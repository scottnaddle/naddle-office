/**
 * The tenant's signing-key trust store: registered public keys and local
 * revocations, both beside `index.json`. Nothing here reads another tenant's
 * files; the caller always passes the current tenant's `storeDir`.
 *
 * Built-in keys and revocations are merged in, so a locally revoked built-in
 * key loses trust. A corrupt revocation file fails closed; a corrupt trusted
 * key file is read as "no tenant keys".
 */
import { createPublicKey, randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PACK_KEY_ID_PATTERN, PACK_REVOKED_KEYS_FILE, PACK_TRUSTED_KEYS_FILE } from './constants'
import { TenantPackError } from './errors'
import {
  EMPTY_PACK_TRUST,
  keyIdOfPublicKey,
  keyIdOfPublicKeyPem,
  publicKeyPemOf,
  type PackSignatureTrust,
  type RevokedPackKey,
  type TrustedPackKey,
} from './signature'
import { BUILTIN_PACK_KEYS } from './trust/builtin-keys'
import { REVOKED_PACK_KEYS } from './trust/revoked-keys'

interface TrustedKeysFile {
  schemaVersion: 1
  keys: TrustedPackKey[]
}

interface RevokedKeysFile {
  schemaVersion: 1
  keys: RevokedPackKey[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/

export interface ParsedPublicKey {
  keyId: string
  publicKeyPem: string
}

/**
 * Read a public-key PEM and return its canonical SPKI form and key id. A PEM
 * holding a private key, a non-Ed25519 key or unreadable text is `bad-key`.
 */
export function inspectPublicKeyPem(publicKeyPem: string): ParsedPublicKey {
  if (/PRIVATE KEY/.test(publicKeyPem)) {
    throw new TenantPackError('bad-key', 'A private key cannot be registered as a trust root')
  }
  let publicKey: ReturnType<typeof createPublicKey>
  try {
    publicKey = createPublicKey(publicKeyPem)
  } catch {
    throw new TenantPackError('bad-key', 'The public key cannot be read')
  }
  if (publicKey.asymmetricKeyType !== 'ed25519') {
    throw new TenantPackError('bad-key', 'The public key must be an Ed25519 key')
  }
  return {
    keyId: keyIdOfPublicKey(publicKey),
    publicKeyPem: publicKeyPemOf(publicKey),
  }
}

function trustedKeyOf(value: unknown): TrustedPackKey | undefined {
  if (!isRecord(value)) return undefined
  if (typeof value.keyId !== 'string' || !PACK_KEY_ID_PATTERN.test(value.keyId)) return undefined
  if (typeof value.publicKeyPem !== 'string') return undefined
  let parsed: ParsedPublicKey
  try {
    parsed = inspectPublicKeyPem(value.publicKeyPem)
  } catch {
    return undefined
  }
  if (parsed.keyId !== value.keyId) return undefined
  if (
    value.notAfter !== undefined &&
    (typeof value.notAfter !== 'string' || !ISO_TIME.test(value.notAfter))
  ) {
    return undefined
  }
  return {
    keyId: parsed.keyId,
    label: typeof value.label === 'string' && value.label.trim() ? value.label : parsed.keyId,
    publicKeyPem: parsed.publicKeyPem,
    ...(typeof value.addedAt === 'string' ? { addedAt: value.addedAt } : {}),
    ...(typeof value.notAfter === 'string' ? { notAfter: value.notAfter } : {}),
  }
}

function revokedKeyOf(value: unknown): RevokedPackKey | undefined {
  if (!isRecord(value)) return undefined
  if (typeof value.keyId !== 'string' || !PACK_KEY_ID_PATTERN.test(value.keyId)) return undefined
  return {
    keyId: value.keyId,
    ...(typeof value.revokedAt === 'string' ? { revokedAt: value.revokedAt } : {}),
    ...(typeof value.reason === 'string' ? { reason: value.reason } : {}),
  }
}

function dedupeByKeyId<T extends { keyId: string }>(keys: readonly T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const key of keys) {
    if (seen.has(key.keyId)) continue
    seen.add(key.keyId)
    out.push(key)
  }
  return out
}

/** The tenant's registered keys. A missing or unreadable file reads as empty. */
export async function readTrustedPackKeys(storeDir: string): Promise<TrustedPackKey[]> {
  let raw: unknown
  try {
    raw = JSON.parse(await readFile(join(storeDir, PACK_TRUSTED_KEYS_FILE), 'utf8')) as unknown
  } catch {
    return []
  }
  if (!isRecord(raw) || !Array.isArray(raw.keys)) return []
  const keys = raw.keys.map(trustedKeyOf).filter((key): key is TrustedPackKey => key !== undefined)
  return dedupeByKeyId(keys)
}

/** The tenant's local revocations, with an `unreadable` flag for a corrupt file. */
export async function readRevokedPackKeys(
  storeDir: string,
): Promise<{ keys: RevokedPackKey[]; unreadable: boolean }> {
  let text: string
  try {
    text = await readFile(join(storeDir, PACK_REVOKED_KEYS_FILE), 'utf8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return { keys: [], unreadable: code !== 'ENOENT' }
  }
  let raw: unknown
  try {
    raw = JSON.parse(text) as unknown
  } catch {
    return { keys: [], unreadable: true }
  }
  if (!isRecord(raw) || !Array.isArray(raw.keys)) return { keys: [], unreadable: true }
  const keys = raw.keys.map(revokedKeyOf).filter((key): key is RevokedPackKey => key !== undefined)
  return { keys: dedupeByKeyId(keys), unreadable: false }
}

/** Built-in keys plus the current tenant's keys and revocations. */
export async function loadSignatureTrust(storeDir: string): Promise<PackSignatureTrust> {
  const [tenantKeys, revoked] = await Promise.all([
    readTrustedPackKeys(storeDir),
    readRevokedPackKeys(storeDir),
  ])
  const trustedKeys: TrustedPackKey[] = dedupeByKeyId([
    ...BUILTIN_PACK_KEYS.map((key) => ({ ...key, source: 'builtin' as const })),
    ...tenantKeys.map((key) => ({ ...key, source: 'tenant' as const })),
  ])
  return {
    trustedKeys,
    revokedKeys: dedupeByKeyId([...REVOKED_PACK_KEYS, ...revoked.keys]),
    revokedUnreadable: revoked.unreadable,
  }
}

/** An empty trust store; useful when a caller verifies without a tenant store. */
export function emptyTrust(): PackSignatureTrust {
  return { ...EMPTY_PACK_TRUST, trustedKeys: [], revokedKeys: [] }
}

async function writeJsonAtomically(
  storeDir: string,
  fileName: string,
  value: unknown,
): Promise<void> {
  await mkdir(storeDir, { recursive: true })
  const target = join(storeDir, fileName)
  const temporary = join(storeDir, `.${fileName}-${randomBytes(6).toString('hex')}.tmp`)
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  try {
    await rename(temporary, target)
  } catch {
    await rm(target, { force: true })
    await rename(temporary, target)
  }
}

async function writeTrustedKeys(storeDir: string, keys: readonly TrustedPackKey[]): Promise<void> {
  const file: TrustedKeysFile = {
    schemaVersion: 1,
    keys: keys.map((key) => ({
      keyId: key.keyId,
      label: key.label,
      publicKeyPem: key.publicKeyPem,
      ...(key.addedAt ? { addedAt: key.addedAt } : {}),
      ...(key.notAfter ? { notAfter: key.notAfter } : {}),
    })),
  }
  await writeJsonAtomically(storeDir, PACK_TRUSTED_KEYS_FILE, file)
}

async function writeRevokedKeys(storeDir: string, keys: readonly RevokedPackKey[]): Promise<void> {
  const file: RevokedKeysFile = { schemaVersion: 1, keys: [...keys] }
  await writeJsonAtomically(storeDir, PACK_REVOKED_KEYS_FILE, file)
}

export interface RegisterTrustedKeyInput {
  publicKeyPem: string
  label?: string
  notAfter?: string
  now?: Date
}

/** Register a public key for the current tenant. The same key id is stored once. */
export async function registerTrustedPackKey(
  storeDir: string,
  input: RegisterTrustedKeyInput,
): Promise<TrustedPackKey> {
  const parsed = inspectPublicKeyPem(input.publicKeyPem)
  if (input.notAfter !== undefined && !ISO_TIME.test(input.notAfter)) {
    throw new TenantPackError('bad-key', 'The key expiry time is malformed')
  }
  const keys = await readTrustedPackKeys(storeDir)
  const existing = keys.find((key) => key.keyId === parsed.keyId)
  if (existing) return { ...existing, source: 'tenant' }
  const record: TrustedPackKey = {
    keyId: parsed.keyId,
    label: input.label?.trim() || parsed.keyId,
    publicKeyPem: parsed.publicKeyPem,
    addedAt: (input.now ?? new Date()).toISOString(),
    ...(input.notAfter ? { notAfter: input.notAfter } : {}),
  }
  await writeTrustedKeys(storeDir, [...keys, record])
  return { ...record, source: 'tenant' }
}

/** Remove a tenant key from the trusted list. */
export async function removeTrustedPackKey(storeDir: string, keyId: string): Promise<boolean> {
  if (!PACK_KEY_ID_PATTERN.test(keyId)) return false
  const keys = await readTrustedPackKeys(storeDir)
  if (!keys.some((key) => key.keyId === keyId)) return false
  await writeTrustedKeys(
    storeDir,
    keys.filter((key) => key.keyId !== keyId),
  )
  return true
}

/** Revoke a key for the current tenant; the entry is kept for later checks. */
export async function revokePackKey(
  storeDir: string,
  keyId: string,
  options: { reason?: string; now?: Date } = {},
): Promise<RevokedPackKey> {
  if (!PACK_KEY_ID_PATTERN.test(keyId)) {
    throw new TenantPackError('bad-key', 'The key id is malformed')
  }
  const current = await readRevokedPackKeys(storeDir)
  if (current.unreadable) {
    throw new TenantPackError('trust-store-unreadable', 'The revoked-key list cannot be read')
  }
  const existing = current.keys.find((key) => key.keyId === keyId)
  if (existing) return existing
  const record: RevokedPackKey = {
    keyId,
    revokedAt: (options.now ?? new Date()).toISOString(),
    ...(options.reason?.trim() ? { reason: options.reason.trim() } : {}),
  }
  await writeRevokedKeys(storeDir, [...current.keys, record])
  return record
}

/** Check a key id against a PEM without writing anything (used by the dialog). */
export function keyIdMatchesPem(keyId: string, publicKeyPem: string): boolean {
  try {
    return keyIdOfPublicKeyPem(publicKeyPem) === keyId
  } catch {
    return false
  }
}
