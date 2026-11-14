/**
 * Offline signing and verification for tenant template packs.
 *
 * This is the only place that opens a private key. It reads the key from a
 * path named by `NADDLE_PACK_SIGNING_KEY` or `--key-file`, never from the key
 * text itself, and never prints key material. The app uses the verifier in
 * `../signature` and has no signing path.
 */
import { createPrivateKey, createPublicKey, sign as cryptoSign, type KeyObject } from 'node:crypto'
import { readFileSync, statSync, unlink } from 'node:fs'
import { readFile, unlink as unlinkAsync, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findSkillFolders } from '@genoffice/ai-provider'
import { PACK_SIGNATURE_FILE, PACK_SIGNATURE_FORMAT } from '../constants'
import { TenantPackError, tenantPackMessage } from '../errors'
import { walkPackFiles } from '../files'
import {
  buildPackPayload,
  canonicalPayloadBytes,
  keyIdOfPublicKey,
  keyIdOfPublicKeyPem,
  publicKeyPemOf,
  verifyPackSignature,
  type PackSignatureInfo,
} from '../signature'
import { validateTenantPack, type TenantPackCandidate } from '../validator'

const PRIVATE_KEY_HEADER = /-----BEGIN PRIVATE KEY-----/
const UNSAFE_KEY_FILE = /\.(?:pem|key)$/i

export class CliError extends Error {
  readonly exitCode: number

  constructor(message: string, exitCode = 1) {
    super(message)
    this.name = 'CliError'
    this.exitCode = exitCode
  }
}

export interface LoadedSigningKey {
  key: KeyObject
  publicKeyPem: string
  keyId: string
}

export interface LoadSigningKeyOptions {
  strictPerms?: boolean
  /** a short warning sink; it never receives key bytes */
  warn?: (message: string) => void
}

/** Read a PKCS8 Ed25519 private key from a path, with POSIX mode warnings only. */
export function loadSigningKey(
  keyPath: string,
  options: LoadSigningKeyOptions = {},
): LoadedSigningKey {
  let info
  try {
    info = statSync(keyPath)
  } catch {
    throw new CliError('The signing key file cannot be read', 2)
  }
  if (!info.isFile()) throw new CliError('The signing key path is not a file', 2)
  if (process.platform !== 'win32' && (info.mode & 0o077) !== 0) {
    const message = 'The signing key is readable by group or others; use mode 0600'
    if (options.strictPerms) throw new CliError(message, 2)
    options.warn?.(message)
  }
  let pem: string
  try {
    pem = readFileSync(keyPath, 'utf8')
  } catch {
    throw new CliError('The signing key file cannot be read', 2)
  }
  if (!PRIVATE_KEY_HEADER.test(pem)) {
    throw new CliError('The signing key is not a PKCS8 Ed25519 private key', 2)
  }
  let key: KeyObject
  try {
    key = createPrivateKey(pem)
  } catch {
    throw new CliError('The signing key is not a PKCS8 Ed25519 private key', 2)
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new CliError('The signing key is not a PKCS8 Ed25519 private key', 2)
  }
  const publicKey = createPublicKey(key)
  return {
    key,
    publicKeyPem: publicKeyPemOf(publicKey),
    keyId: keyIdOfPublicKey(publicKey),
  }
}

async function assertNoKeyFiles(root: string): Promise<void> {
  const files = await walkPackFiles(root)
  for (const file of files) {
    if (UNSAFE_KEY_FILE.test(file.rel)) {
      throw new TenantPackError('bad-signature', `A pack may not contain key files: ${file.rel}`)
    }
  }
}

async function candidatesOf(root: string): Promise<TenantPackCandidate[]> {
  const folders = await findSkillFolders(root)
  return folders.map((rel) => ({ rel }))
}

export interface SignPackOptions {
  /** a PEM read by a test; the CLI passes the already-parsed key instead */
  privateKeyPem?: string
  privateKey?: KeyObject
  signedAt?: string
}

export interface SignPackResult {
  keyId: string
  fileCount: number
  sidecarPath: string
  info: PackSignatureInfo
}

/**
 * Sign a pack folder after the full validator passes. Any existing sidecar is
 * removed first and rewritten; on failure it is removed so no half signature
 * is left behind.
 */
export async function signPackFolder(
  root: string,
  options: SignPackOptions,
): Promise<SignPackResult> {
  await assertNoKeyFiles(root)
  const sidecarPath = join(root, PACK_SIGNATURE_FILE)
  await unlinkAsync(sidecarPath).catch(() => undefined)

  let key: KeyObject
  try {
    key = options.privateKey ?? createPrivateKey(options.privateKeyPem ?? '')
  } catch {
    throw new CliError('The signing key is not a PKCS8 Ed25519 private key', 2)
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new CliError('The signing key is not a PKCS8 Ed25519 private key', 2)
  }
  const publicKey = createPublicKey(key)
  const keyId = keyIdOfPublicKey(publicKey)

  const preview = await validateTenantPack(root, {
    origin: { kind: 'folder', folder: root },
    candidates: await candidatesOf(root),
  })
  if (preview.problems.length > 0) {
    throw new TenantPackError(
      'invalid-pack',
      `The pack has errors and cannot be signed: ${preview.problems.join('; ')}`,
    )
  }
  if (!preview.pack.id || !preview.pack.version) {
    throw new TenantPackError('invalid-pack', 'The pack id and version are required')
  }

  const signedAt = options.signedAt ?? new Date().toISOString()
  const payload = await buildPackPayload(root, {
    keyId,
    signedAt,
    pack: { id: preview.pack.id, version: preview.pack.version },
  })
  const bytes = canonicalPayloadBytes(payload)
  const signature = cryptoSign(null, bytes, key)

  const sidecar = {
    format: PACK_SIGNATURE_FORMAT,
    v: 1,
    payload,
    signature: signature.toString('base64'),
  }
  await writeFile(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`)

  const info = await verifyPackSignature(root, {
    trustedKeys: [{ keyId, label: 'self', publicKeyPem: publicKeyPemOf(publicKey) }],
    revokedKeys: [],
  })
  if (info.status !== 'valid') {
    unlink(sidecarPath, () => undefined)
    throw new TenantPackError('bad-signature', 'The new signature did not verify')
  }
  return {
    keyId,
    fileCount: payload.files.length,
    sidecarPath,
    info,
  }
}

/** Verify a pack folder with a public key supplied on the command line. */
export async function verifyPackFolder(
  root: string,
  publicKeyPem: string,
): Promise<PackSignatureInfo> {
  let keyId: string
  let canonicalPem: string
  try {
    keyId = keyIdOfPublicKeyPem(publicKeyPem)
    canonicalPem = publicKeyPemOf(createPublicKey(publicKeyPem))
  } catch {
    throw new CliError('The public key cannot be read', 2)
  }
  return verifyPackSignature(root, {
    trustedKeys: [{ keyId, label: 'cli', publicKeyPem: canonicalPem }],
    revokedKeys: [],
  })
}

export interface CliIo {
  out: (message: string) => void
  err: (message: string) => void
}

const defaultIo: CliIo = {
  out: (message) => process.stdout.write(`${message}\n`),
  err: (message) => process.stderr.write(`${message}\n`),
}

function parseFlag(argv: readonly string[], name: string): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!
    if (arg === name) return argv[index + 1]
    const prefix = `${name}=`
    if (arg.startsWith(prefix)) return arg.slice(prefix.length)
  }
  return undefined
}

function hasFlag(argv: readonly string[], name: string): boolean {
  return argv.includes(name)
}

function positional(argv: readonly string[], flags: ReadonlySet<string>): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!
    if (arg.startsWith('--')) {
      if (!arg.includes('=') && flags.has(arg)) index += 1
      continue
    }
    return arg
  }
  return undefined
}

const SIGN_FLAGS = new Set(['--key-file', '--signed-at'])
const VERIFY_FLAGS = new Set(['--pub'])

export async function runSignCli(argv: readonly string[], io: CliIo = defaultIo): Promise<number> {
  const command = argv[0]
  const rest = argv.slice(1)
  try {
    if (command === 'sign') {
      const folder = positional(rest, SIGN_FLAGS)
      if (!folder) throw new CliError('Usage: sign <pack-folder> [--key-file <path>]', 2)
      const keyPath = parseFlag(rest, '--key-file') ?? process.env.NADDLE_PACK_SIGNING_KEY
      if (!keyPath) {
        throw new CliError('Set NADDLE_PACK_SIGNING_KEY or pass --key-file', 2)
      }
      const signing = loadSigningKey(keyPath, {
        strictPerms: hasFlag(rest, '--strict-perms'),
        warn: io.err,
      })
      const root = resolve(folder)
      const signedAt = parseFlag(rest, '--signed-at')
      const result = await signPackFolder(root, {
        privateKey: signing.key,
        ...(signedAt ? { signedAt } : {}),
      })
      io.out(`keyId: ${result.keyId}`)
      io.out(`files: ${result.fileCount}`)
      io.out(`sidecar: ${result.sidecarPath}`)
      return 0
    }
    if (command === 'verify') {
      const folder = positional(rest, VERIFY_FLAGS)
      const publicKeyPath = parseFlag(rest, '--pub')
      if (!folder || !publicKeyPath) {
        throw new CliError('Usage: verify <pack-folder> --pub <public.pem>', 2)
      }
      const publicKeyPem = await readFile(publicKeyPath, 'utf8').catch(() => {
        throw new CliError('The public key file cannot be read', 2)
      })
      const info = await verifyPackFolder(resolve(folder), publicKeyPem)
      io.out(`status: ${info.status}`)
      if (info.keyId) io.out(`keyId: ${info.keyId}`)
      return info.status === 'valid' ? 0 : 1
    }
    throw new CliError('Usage: sign <pack-folder> | verify <pack-folder> --pub <key>', 2)
  } catch (error) {
    if (error instanceof CliError) {
      io.err(error.message)
      return error.exitCode
    }
    io.err(tenantPackMessage(error))
    return 1
  }
}

const invokedDirectly =
  Boolean(process.argv[1]) && resolve(process.argv[1]!) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  void runSignCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code
  })
}
