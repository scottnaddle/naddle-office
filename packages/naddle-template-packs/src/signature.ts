/**
 * Detached Ed25519 signatures for tenant template packs.
 *
 * The signed bytes are a canonical JSON payload listing every regular file
 * under the pack root (the sidecar itself is left out). Verification rebuilds
 * the file list from disk, keeps the signed algorithm/key/pack/time fields,
 * and calls `node:crypto`'s verifier once. Private keys never enter this file.
 */
import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  PACK_KEY_ID_PATTERN,
  PACK_MANIFEST_FILE,
  PACK_SIGNATURE_ALG,
  PACK_SIGNATURE_FILE,
  PACK_SIGNATURE_FORMAT,
  PACK_SIGNATURE_MAX_BYTES,
  PACK_SIGNATURE_PAYLOAD_FORMAT,
} from './constants'
import { TenantPackError } from './errors'
import { isSafeRelPath, walkPackFiles } from './files'

export type PackSignatureStatus =
  | 'unsigned'
  | 'valid'
  | 'malformed'
  | 'bad-signature'
  | 'files-mismatch'
  | 'unknown-key'
  | 'revoked-key'
  | 'expired-key'
  | 'pack-mismatch'
  | 'missing-signature'
  | 'trust-store-unreadable'

export type PackTrustSource = 'builtin' | 'tenant'

export interface TrustedPackKey {
  keyId: string
  label: string
  publicKeyPem: string
  addedAt?: string
  notAfter?: string
  source?: PackTrustSource
}

export interface RevokedPackKey {
  keyId: string
  revokedAt?: string
  reason?: string
}

export interface PackSignatureTrust {
  trustedKeys: readonly TrustedPackKey[]
  revokedKeys: readonly RevokedPackKey[]
  revokedUnreadable?: boolean
}

export interface PackPayloadFile {
  path: string
  sha256: string
  size: number
}

export interface PackPayload {
  alg: typeof PACK_SIGNATURE_ALG
  files: PackPayloadFile[]
  format: typeof PACK_SIGNATURE_PAYLOAD_FORMAT
  keyId: string
  pack: { id: string; version: string }
  signedAt: string
  v: 1
}

export interface PackSignatureSidecar {
  format: typeof PACK_SIGNATURE_FORMAT
  v: 1
  payload: PackPayload
  signature: string
}

export interface PackPayloadInput {
  keyId: string
  signedAt: string
  pack: { id: string; version: string }
}

export interface PackSignatureInfo {
  status: PackSignatureStatus
  keyId?: string
  keyLabel?: string
  signedAt?: string
  trustSource?: PackTrustSource
  payloadSha256?: string
  problems: string[]
}

/** The empty trust store: no keys, no revocations, readable. */
export const EMPTY_PACK_TRUST: PackSignatureTrust = {
  trustedKeys: [],
  revokedKeys: [],
  revokedUnreadable: false,
}

const SHA256_HEX = /^[0-9a-f]{64}$/
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value)
  return actual.length === keys.length && keys.every((key) => key in value)
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** `ed25519:` plus the first 32 hex chars of sha256(SPKI DER). */
export function keyIdOfPublicKey(publicKey: ReturnType<typeof createPublicKey>): string {
  const der = publicKey.export({ type: 'spki', format: 'der' })
  const hex = createHash('sha256').update(der).digest('hex')
  return `${PACK_SIGNATURE_ALG}:${hex.slice(0, 32)}`
}

/** Parse a public-key PEM and return its key id. Throws on anything else. */
export function keyIdOfPublicKeyPem(publicKeyPem: string): string {
  if (/PRIVATE KEY/.test(publicKeyPem)) {
    throw new TenantPackError('bad-key', 'A private key cannot be registered as a trust root')
  }
  const publicKey = createPublicKey(publicKeyPem)
  if (publicKey.asymmetricKeyType !== 'ed25519') {
    throw new TenantPackError('bad-key', 'The signing key must be an Ed25519 public key')
  }
  return keyIdOfPublicKey(publicKey)
}

/** The SPKI PEM for a parsed public key, so the stored form is canonical. */
export function publicKeyPemOf(publicKey: ReturnType<typeof createPublicKey>): string {
  return publicKey.export({ type: 'spki', format: 'pem' }).toString()
}

function compareUtf8Bytes(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))
}

function validPayloadFile(value: unknown): value is PackPayloadFile {
  if (!isRecord(value) || !hasExactKeys(value, ['path', 'sha256', 'size'])) return false
  if (typeof value.path !== 'string' || !isSafeRelPath(value.path)) return false
  if (value.path.normalize('NFC') !== value.path) return false
  if (typeof value.sha256 !== 'string' || !SHA256_HEX.test(value.sha256)) return false
  return Number.isSafeInteger(value.size) && (value.size as number) >= 0
}

/** Validate a payload object strictly and return it as the fixed shape. */
export function parsePackPayload(value: unknown): PackPayload {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['alg', 'files', 'format', 'keyId', 'pack', 'signedAt', 'v'])
  ) {
    throw new TenantPackError('bad-signature', 'The signature payload is malformed')
  }
  if (value.alg !== PACK_SIGNATURE_ALG) {
    throw new TenantPackError('bad-signature', 'The signature algorithm is not supported')
  }
  if (value.format !== PACK_SIGNATURE_PAYLOAD_FORMAT) {
    throw new TenantPackError('bad-signature', 'The signature payload format is not supported')
  }
  if (value.v !== 1) throw new TenantPackError('bad-signature', 'The signature version is not 1')
  if (typeof value.keyId !== 'string' || !PACK_KEY_ID_PATTERN.test(value.keyId)) {
    throw new TenantPackError('bad-signature', 'The signature key id is malformed')
  }
  if (typeof value.signedAt !== 'string' || !ISO_TIME.test(value.signedAt)) {
    throw new TenantPackError('bad-signature', 'The signature time is malformed')
  }
  if (
    !isRecord(value.pack) ||
    !hasExactKeys(value.pack, ['id', 'version']) ||
    typeof value.pack.id !== 'string' ||
    typeof value.pack.version !== 'string'
  ) {
    throw new TenantPackError('bad-signature', 'The signature pack identity is malformed')
  }
  if (!Array.isArray(value.files) || !value.files.every(validPayloadFile)) {
    throw new TenantPackError('bad-signature', 'The signature file list is malformed')
  }
  return {
    alg: PACK_SIGNATURE_ALG,
    files: value.files.map((file) => ({
      path: file.path,
      sha256: file.sha256,
      size: file.size,
    })),
    format: PACK_SIGNATURE_PAYLOAD_FORMAT,
    keyId: value.keyId,
    pack: { id: value.pack.id, version: value.pack.version },
    signedAt: value.signedAt,
    v: 1,
  }
}

/**
 * The canonical UTF-8 bytes signed and verified. Keys are emitted in ASCII
 * order with no whitespace, no trailing newline and no BOM; paths are sorted
 * by UTF-8 bytes and the result matches the JCS subset for these values.
 */
export function canonicalPayloadBytes(payload: PackPayload): Buffer {
  const parsed = parsePackPayload(payload)
  const files = parsed.files
    .map((file) => ({ path: file.path, sha256: file.sha256, size: file.size }))
    .sort((left, right) => compareUtf8Bytes(left.path, right.path))
  const canonical = {
    alg: parsed.alg,
    files,
    format: parsed.format,
    keyId: parsed.keyId,
    pack: { id: parsed.pack.id, version: parsed.pack.version },
    signedAt: parsed.signedAt,
    v: parsed.v,
  }
  return Buffer.from(JSON.stringify(canonical), 'utf8')
}

/** Compute the file list from disk. The sidecar itself is not signed. */
export async function buildPackPayload(
  root: string,
  input: PackPayloadInput,
): Promise<PackPayload> {
  if (typeof input.pack.id !== 'string' || typeof input.pack.version !== 'string') {
    throw new TenantPackError('bad-signature', 'The pack identity is required')
  }
  if (!PACK_KEY_ID_PATTERN.test(input.keyId)) {
    throw new TenantPackError('bad-signature', 'The signing key id is malformed')
  }
  if (!ISO_TIME.test(input.signedAt)) {
    throw new TenantPackError('bad-signature', 'The signing time is malformed')
  }
  const files = await walkPackFiles(root)
  const seen = new Set<string>()
  const listed: PackPayloadFile[] = []
  for (const file of files) {
    if (file.rel === PACK_SIGNATURE_FILE) continue
    if (!isSafeRelPath(file.rel)) {
      throw new TenantPackError('bad-signature', `The pack path is not safe: ${file.rel}`)
    }
    const path = file.rel.normalize('NFC')
    if (seen.has(path)) {
      throw new TenantPackError('bad-signature', `Two pack paths normalize to one: ${path}`)
    }
    seen.add(path)
    const bytes = new Uint8Array(await readFile(file.path))
    listed.push({ path, sha256: sha256Hex(bytes), size: bytes.byteLength })
  }
  listed.sort((left, right) => compareUtf8Bytes(left.path, right.path))
  return {
    alg: PACK_SIGNATURE_ALG,
    files: listed,
    format: PACK_SIGNATURE_PAYLOAD_FORMAT,
    keyId: input.keyId,
    pack: { id: input.pack.id, version: input.pack.version },
    signedAt: input.signedAt,
    v: 1,
  }
}

function strictBase64Signature(value: unknown): Buffer {
  if (typeof value !== 'string' || value.length === 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new TenantPackError('bad-signature', 'The signature is not valid base64')
  }
  const bytes = Buffer.from(value, 'base64')
  if (bytes.byteLength !== 64 || bytes.toString('base64') !== value) {
    throw new TenantPackError('bad-signature', 'The signature is not a 64-byte Ed25519 signature')
  }
  return bytes
}

/** Strict parse of `manifest.sig.json`. Any unknown shape is malformed. */
export function parsePackSignatureSidecar(raw: unknown): {
  sidecar: PackSignatureSidecar
  signatureBytes: Buffer
} {
  if (!isRecord(raw) || !hasExactKeys(raw, ['format', 'payload', 'signature', 'v'])) {
    throw new TenantPackError('bad-signature', 'The signature file is malformed')
  }
  if (raw.format !== PACK_SIGNATURE_FORMAT) {
    throw new TenantPackError('bad-signature', 'The signature file format is not supported')
  }
  if (raw.v !== 1) throw new TenantPackError('bad-signature', 'The signature file version is not 1')
  const payload = parsePackPayload(raw.payload)
  const signatureBytes = strictBase64Signature(raw.signature)
  return {
    sidecar: {
      format: PACK_SIGNATURE_FORMAT,
      v: 1,
      payload,
      signature: raw.signature as string,
    },
    signatureBytes,
  }
}

async function readManifestPack(
  root: string,
): Promise<{ id: string; version: string } | undefined> {
  try {
    const raw = JSON.parse(await readFile(join(root, PACK_MANIFEST_FILE), 'utf8')) as unknown
    if (!isRecord(raw) || !isRecord(raw.pack)) return undefined
    if (typeof raw.pack.id !== 'string' || typeof raw.pack.version !== 'string') return undefined
    return { id: raw.pack.id, version: raw.pack.version }
  } catch {
    return undefined
  }
}

function filesMatch(left: readonly PackPayloadFile[], right: readonly PackPayloadFile[]): boolean {
  if (left.length !== right.length) return false
  const sortedLeft = [...left].sort((a, b) => compareUtf8Bytes(a.path, b.path))
  return sortedLeft.every((file, index) => {
    const other = right[index]
    return (
      other !== undefined &&
      file.path === other.path &&
      file.sha256 === other.sha256 &&
      file.size === other.size
    )
  })
}

function failure(
  status: PackSignatureStatus,
  message: string,
  extra: Partial<PackSignatureInfo> = {},
): PackSignatureInfo {
  return { status, problems: [message], ...extra }
}

/**
 * Verify the pack's signature against the supplied trust store. Recomputes the
 * file list from disk and verifies exactly once. The sidecar's own file list is
 * not trusted; it is only used to name a files-mismatch.
 */
export async function verifyPackSignature(
  root: string,
  trust: PackSignatureTrust = EMPTY_PACK_TRUST,
): Promise<PackSignatureInfo> {
  let header: Buffer
  try {
    header = await readFile(join(root, PACK_SIGNATURE_FILE))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { status: 'unsigned', problems: [] }
    }
    return failure('malformed', 'The signature file cannot be read')
  }
  if (header.byteLength > PACK_SIGNATURE_MAX_BYTES) {
    return failure('malformed', 'The signature file is too large')
  }

  let parsed: ReturnType<typeof parsePackSignatureSidecar>
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(header)
    parsed = parsePackSignatureSidecar(JSON.parse(text) as unknown)
  } catch {
    return failure('malformed', 'The signature file is malformed')
  }
  const { sidecar, signatureBytes } = parsed
  const claimed = sidecar.payload

  const manifestPack = await readManifestPack(root)
  if (
    !manifestPack ||
    manifestPack.id !== claimed.pack.id ||
    manifestPack.version !== claimed.pack.version
  ) {
    return failure('pack-mismatch', 'The signature names a different pack than the manifest')
  }

  if (trust.revokedUnreadable) {
    return failure(
      'trust-store-unreadable',
      'The revoked-key list cannot be read, so signed packs are unavailable',
    )
  }
  if (trust.revokedKeys.some((key) => key.keyId === claimed.keyId)) {
    return failure('revoked-key', 'The signing key has been revoked', {
      keyId: claimed.keyId,
      signedAt: claimed.signedAt,
    })
  }

  const trusted = trust.trustedKeys.find((key) => key.keyId === claimed.keyId)
  if (!trusted) {
    return failure('unknown-key', 'The signing key is not registered', {
      keyId: claimed.keyId,
      signedAt: claimed.signedAt,
    })
  }

  let publicKey: ReturnType<typeof createPublicKey>
  try {
    publicKey = createPublicKey(trusted.publicKeyPem)
  } catch {
    return failure('unknown-key', 'The registered signing key cannot be read', {
      keyId: claimed.keyId,
      signedAt: claimed.signedAt,
    })
  }
  if (publicKey.asymmetricKeyType !== 'ed25519' || keyIdOfPublicKey(publicKey) !== trusted.keyId) {
    return failure('unknown-key', 'The registered signing key does not match its id', {
      keyId: claimed.keyId,
      signedAt: claimed.signedAt,
    })
  }

  if (trusted.notAfter !== undefined) {
    const cutoff = Date.parse(trusted.notAfter)
    const signedAt = Date.parse(claimed.signedAt)
    if (!Number.isFinite(cutoff) || !Number.isFinite(signedAt) || signedAt > cutoff) {
      return failure('expired-key', 'The pack was signed after this key stopped accepting packs', {
        keyId: claimed.keyId,
        keyLabel: trusted.label,
        signedAt: claimed.signedAt,
        ...(trusted.source ? { trustSource: trusted.source } : {}),
      })
    }
  }

  let rebuilt: PackPayload
  try {
    rebuilt = await buildPackPayload(root, {
      keyId: claimed.keyId,
      signedAt: claimed.signedAt,
      pack: claimed.pack,
    })
  } catch {
    return failure('files-mismatch', 'The pack files could not be read for verification', {
      keyId: claimed.keyId,
      signedAt: claimed.signedAt,
    })
  }
  const bytes = canonicalPayloadBytes(rebuilt)
  const mismatch = !filesMatch(claimed.files, rebuilt.files)
  const valid = cryptoVerify(null, bytes, publicKey, signatureBytes)
  const extra: Partial<PackSignatureInfo> = {
    keyId: claimed.keyId,
    keyLabel: trusted.label,
    signedAt: claimed.signedAt,
    ...(trusted.source ? { trustSource: trusted.source } : {}),
  }
  if (!valid) {
    return mismatch
      ? failure('files-mismatch', 'The pack files changed after signing', extra)
      : failure('bad-signature', 'The signature does not verify', extra)
  }
  return {
    status: 'valid',
    ...extra,
    payloadSha256: sha256Hex(bytes),
    problems: [],
  }
}
