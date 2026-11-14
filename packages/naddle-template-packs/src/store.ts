/**
 * Tenant keyed pack storage: `<storeDir>/<packId>/` plus `index.json`.
 *
 * `storeDir` is always the current tenant's `template-packs` folder. Nothing
 * here reads or writes the personal skill folder.
 */
import { createHash, randomBytes } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { PACK_ID_PATTERN, PACK_INDEX_FILE, PACK_KEY_ID_PATTERN } from './constants'
import { TenantPackError } from './errors'
import { PACK_FOLDER_LIMITS } from './constants'
import { walkPackFiles } from './files'
import {
  verifyPackSignature,
  type PackSignatureInfo,
  type PackSignatureStatus,
  type PackSignatureTrust,
  type PackTrustSource,
} from './signature'
import { loadSignatureTrust } from './trust'
import type { TenantPackOrigin, TenantPackPreview } from './validator'

export interface TenantPackIndexEntry {
  id: string
  kind: string
  name: string
  license: string
  author: string
  skillPath: string
  formAsset?: string
  sha256?: string
}

export interface TenantPackSignatureRecord {
  alg: 'ed25519'
  keyId: string
  signedAt: string
  payloadSha256: string
  trustSource: PackTrustSource
}

export interface TenantPackIndexRecord {
  id: string
  name: string
  version: string
  publisher?: string
  license: string
  author: string
  origin: TenantPackOrigin
  installedAt: string
  entries: TenantPackIndexEntry[]
  /** absent for an unsigned pack; `corrupt` fails closed instead of downgrading */
  signature?: TenantPackSignatureRecord | 'corrupt'
}

export interface TenantPackIndexFile {
  schemaVersion: 1
  packs: TenantPackIndexRecord[]
}

export interface TenantPackListItem extends TenantPackIndexRecord {
  formCount: number
  verified: boolean
  problems: string[]
  signatureStatus: PackSignatureStatus
  signatureInfo: PackSignatureInfo
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const sha256Of = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

function isInside(child: string, parent: string): boolean {
  const rel = relative(resolve(parent), resolve(child))
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
}

function packPathOf(storeDir: string, packId: string): string {
  if (!PACK_ID_PATTERN.test(packId)) {
    throw new TenantPackError('invalid-pack', `Invalid pack id: ${packId}`)
  }
  const path = resolve(storeDir, packId)
  if (!isInside(path, storeDir) || path === resolve(storeDir)) {
    throw new TenantPackError('invalid-pack', 'The pack folder is outside the store')
  }
  return path
}

function signatureRecordOf(value: unknown): TenantPackSignatureRecord | 'corrupt' | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) return 'corrupt'
  if (
    value.alg !== 'ed25519' ||
    typeof value.keyId !== 'string' ||
    !PACK_KEY_ID_PATTERN.test(value.keyId) ||
    typeof value.signedAt !== 'string' ||
    typeof value.payloadSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.payloadSha256) ||
    (value.trustSource !== 'builtin' && value.trustSource !== 'tenant')
  ) {
    return 'corrupt'
  }
  return {
    alg: 'ed25519',
    keyId: value.keyId,
    signedAt: value.signedAt,
    payloadSha256: value.payloadSha256,
    trustSource: value.trustSource,
  }
}

function signatureRecordOfInfo(info: PackSignatureInfo): TenantPackSignatureRecord | undefined {
  if (
    info.status !== 'valid' ||
    info.keyId === undefined ||
    info.signedAt === undefined ||
    info.payloadSha256 === undefined ||
    info.trustSource === undefined
  ) {
    return undefined
  }
  return {
    alg: 'ed25519',
    keyId: info.keyId,
    signedAt: info.signedAt,
    payloadSha256: info.payloadSha256,
    trustSource: info.trustSource,
  }
}

function signatureErrorCode(
  status: PackSignatureStatus,
): 'bad-signature' | 'unknown-key' | 'revoked-key' | 'expired-key' | 'trust-store-unreadable' {
  switch (status) {
    case 'unknown-key':
      return 'unknown-key'
    case 'revoked-key':
      return 'revoked-key'
    case 'expired-key':
      return 'expired-key'
    case 'trust-store-unreadable':
      return 'trust-store-unreadable'
    default:
      return 'bad-signature'
  }
}

function recordOf(value: unknown): TenantPackIndexRecord | undefined {
  if (!isRecord(value)) return undefined
  const id = value.id
  if (typeof id !== 'string' || !PACK_ID_PATTERN.test(id)) return undefined
  if (typeof value.name !== 'string' || typeof value.version !== 'string') return undefined
  if (typeof value.license !== 'string' || typeof value.author !== 'string') return undefined
  if (typeof value.installedAt !== 'string') return undefined
  if (!isRecord(value.origin) || typeof value.origin.kind !== 'string') return undefined
  const signature = signatureRecordOf(value.signature)
  const entries = Array.isArray(value.entries) ? value.entries : []
  const cleanEntries: TenantPackIndexEntry[] = []
  for (const entry of entries) {
    if (!isRecord(entry)) continue
    if (typeof entry.id !== 'string' || typeof entry.kind !== 'string') continue
    if (typeof entry.name !== 'string' || typeof entry.license !== 'string') continue
    if (typeof entry.author !== 'string' || typeof entry.skillPath !== 'string') continue
    cleanEntries.push({
      id: entry.id,
      kind: entry.kind,
      name: entry.name,
      license: entry.license,
      author: entry.author,
      skillPath: entry.skillPath,
      ...(typeof entry.formAsset === 'string' ? { formAsset: entry.formAsset } : {}),
      ...(typeof entry.sha256 === 'string' ? { sha256: entry.sha256 } : {}),
    })
  }
  return {
    id,
    name: value.name,
    version: value.version,
    ...(typeof value.publisher === 'string' ? { publisher: value.publisher } : {}),
    license: value.license,
    author: value.author,
    origin: value.origin as TenantPackOrigin,
    installedAt: value.installedAt,
    entries: cleanEntries,
    ...(signature !== undefined ? { signature } : {}),
  }
}

/** Read the index. A missing or unreadable index reads as empty, never as another tenant's. */
export async function readTenantPackIndex(storeDir: string): Promise<TenantPackIndexFile> {
  try {
    const raw = JSON.parse(await readFile(join(storeDir, PACK_INDEX_FILE), 'utf8')) as unknown
    if (!isRecord(raw) || !Array.isArray(raw.packs)) return { schemaVersion: 1, packs: [] }
    const packs = raw.packs
      .map(recordOf)
      .filter((pack): pack is TenantPackIndexRecord => pack !== undefined)
    return { schemaVersion: 1, packs }
  } catch {
    return { schemaVersion: 1, packs: [] }
  }
}

async function writeTenantPackIndex(storeDir: string, index: TenantPackIndexFile): Promise<void> {
  await mkdir(storeDir, { recursive: true })
  const target = join(storeDir, PACK_INDEX_FILE)
  const temporary = join(storeDir, `.index-${randomBytes(6).toString('hex')}.tmp`)
  await writeFile(temporary, `${JSON.stringify(index, null, 2)}\n`)
  try {
    await rename(temporary, target)
  } catch {
    await rm(target, { force: true })
    await rename(temporary, target)
  }
}

/** The ids this tenant already stores. */
export async function tenantPackIds(storeDir: string): Promise<Set<string>> {
  const index = await readTenantPackIndex(storeDir)
  return new Set(index.packs.map((pack) => pack.id))
}

export interface InstallTenantPackOptions {
  attested: boolean
  now?: (() => Date) | undefined
  random?: (() => string) | undefined
  /** trust keys for the staging re-check; omitted reads the tenant's store */
  signatureTrust?: PackSignatureTrust | undefined
}

/**
 * Copy a validated pack into a staging folder, rename it into place, then
 * update the index. The same pack.id replaces the old folder after the caller
 * has confirmed it.
 */
export async function installTenantPack(
  sourceRoot: string,
  preview: TenantPackPreview,
  storeDir: string,
  options: InstallTenantPackOptions,
): Promise<TenantPackIndexRecord> {
  if (!options.attested) {
    throw new TenantPackError('attestation-required', 'The rights confirmation is required')
  }
  if (preview.problems.length > 0) {
    throw new TenantPackError('invalid-pack', 'The pack has errors and cannot be installed')
  }
  const packId = preview.pack.id
  if (!PACK_ID_PATTERN.test(packId)) {
    throw new TenantPackError('invalid-pack', 'The pack id is not valid')
  }
  const suffix = options.random?.() ?? randomBytes(6).toString('hex')
  const packPath = packPathOf(storeDir, packId)
  const staging = join(storeDir, `.staging-${suffix}`)
  const old = join(storeDir, `.old-${suffix}`)
  const files = await walkPackFiles(sourceRoot)

  await mkdir(staging, { recursive: true })
  try {
    for (const file of files) {
      const target = join(staging, ...file.rel.split('/'))
      if (!isInside(target, staging)) {
        throw new TenantPackError('unsafe', `Unsafe pack path: ${file.rel}`)
      }
      await mkdir(dirname(target), { recursive: true })
      await copyFile(file.path, target)
    }

    // Re-verify on the exact bytes that will be installed, so a change between
    // preview and confirmation (or a trust change) fails closed.
    const trust = options.signatureTrust ?? (await loadSignatureTrust(storeDir))
    const signature = await verifyPackSignature(staging, trust)
    if (signature.status !== 'unsigned' && signature.status !== 'valid') {
      throw new TenantPackError(
        signatureErrorCode(signature.status),
        `The pack signature is not valid (${signature.status})`,
      )
    }
    if (preview.signature.status === 'valid' && signature.status !== 'valid') {
      throw new TenantPackError(
        'bad-signature',
        'The pack signature disappeared before installation',
      )
    }
    const signatureRecord = signatureRecordOfInfo(signature)

    let movedOld = false
    if ((await stat(packPath).catch(() => undefined)) !== undefined) {
      await rename(packPath, old)
      movedOld = true
    }
    try {
      await rename(staging, packPath)
    } catch (error) {
      if (movedOld) await rename(old, packPath).catch(() => undefined)
      throw error
    }

    const record: TenantPackIndexRecord = {
      id: packId,
      name: preview.pack.name,
      version: preview.pack.version,
      ...(preview.pack.publisher ? { publisher: preview.pack.publisher } : {}),
      license: preview.license,
      author: preview.author,
      origin: preview.origin,
      installedAt: (options.now?.() ?? new Date()).toISOString(),
      entries: preview.entries.map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        name: entry.name,
        license: entry.license,
        author: entry.author,
        skillPath: entry.skillPath,
        ...(entry.formAsset ? { formAsset: entry.formAsset } : {}),
        ...(entry.sha256 ? { sha256: entry.sha256 } : {}),
      })),
      ...(signatureRecord ? { signature: signatureRecord } : {}),
    }
    const index = await readTenantPackIndex(storeDir)
    const packs = index.packs.filter((pack) => pack.id !== packId)
    packs.push(record)
    await writeTenantPackIndex(storeDir, { schemaVersion: 1, packs })
    if (movedOld) await rm(old, { recursive: true, force: true }).catch(() => undefined)
    return record
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

async function signatureForRecord(
  storeDir: string,
  record: TenantPackIndexRecord,
  trust: PackSignatureTrust,
): Promise<PackSignatureInfo> {
  if (record.signature === 'corrupt') {
    return {
      status: 'bad-signature',
      problems: ['The stored signature record is damaged'],
    }
  }
  if (!record.signature) return { status: 'unsigned', problems: [] }
  const info = await verifyPackSignature(packPathOf(storeDir, record.id), trust)
  if (info.status === 'unsigned') {
    return {
      status: 'missing-signature',
      keyId: record.signature.keyId,
      signedAt: record.signature.signedAt,
      trustSource: record.signature.trustSource,
      problems: ['The signature file is missing from an installed signed pack'],
    }
  }
  if (info.status === 'valid' && info.keyId !== record.signature.keyId) {
    return {
      status: 'bad-signature',
      keyId: info.keyId,
      signedAt: info.signedAt,
      problems: ['The installed signature uses a different key than the index recorded'],
    }
  }
  return info
}

/** Check the forms of an installed pack against the hashes the index recorded. */
export async function verifyTenantPack(
  storeDir: string,
  record: TenantPackIndexRecord,
  trust?: PackSignatureTrust | undefined,
): Promise<{
  verified: boolean
  problems: string[]
  formCount: number
  signature: PackSignatureInfo
}> {
  const problems: string[] = []
  let formCount = 0
  const packPath = packPathOf(storeDir, record.id)
  for (const entry of record.entries) {
    if (!entry.formAsset) continue
    formCount += 1
    if (!entry.sha256) {
      problems.push(`${entry.id}: the index has no form hash`)
      continue
    }
    const formPath = resolve(packPath, entry.skillPath, entry.formAsset)
    if (!isInside(formPath, packPath)) {
      problems.push(`${entry.id}: the form path is outside the pack`)
      continue
    }
    try {
      const bytes = new Uint8Array(await readFile(formPath))
      if (sha256Of(bytes) !== entry.sha256) {
        problems.push(`${entry.id}: the form changed after installation`)
      }
    } catch {
      problems.push(`${entry.id}: the form is missing`)
    }
  }
  const signature = await signatureForRecord(
    storeDir,
    record,
    trust ?? (await loadSignatureTrust(storeDir)),
  )
  if (signature.status !== 'unsigned' && signature.status !== 'valid') {
    problems.push(`${record.id}: the pack signature is not valid (${signature.status})`)
  }
  return { verified: problems.length === 0, problems, formCount, signature }
}

/** Every pack of the current tenant, with its forms and signature re-checked. */
export async function listTenantPacks(storeDir: string): Promise<TenantPackListItem[]> {
  const index = await readTenantPackIndex(storeDir)
  const trust = await loadSignatureTrust(storeDir)
  const out: TenantPackListItem[] = []
  for (const record of index.packs) {
    const check = await verifyTenantPack(storeDir, record, trust)
    out.push({
      ...record,
      formCount: check.formCount,
      verified: check.verified,
      problems: check.problems,
      signatureStatus: check.signature.status,
      signatureInfo: check.signature,
    })
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

/** The form file of one installed entry, after its hash is checked. */
export async function installedFormPath(
  storeDir: string,
  packId: string,
  entryId: string,
): Promise<string | undefined> {
  const index = await readTenantPackIndex(storeDir)
  const record = index.packs.find((pack) => pack.id === packId)
  if (!record) return undefined
  const entry = record.entries.find((item) => item.id === entryId)
  if (!entry?.formAsset || !entry.sha256) return undefined
  const packPath = packPathOf(storeDir, packId)
  const formPath = resolve(packPath, entry.skillPath, entry.formAsset)
  if (!isInside(formPath, packPath)) return undefined
  const bytes = new Uint8Array(await readFile(formPath).catch(() => new Uint8Array()))
  if (bytes.byteLength === 0 || sha256Of(bytes) !== entry.sha256) return undefined
  if (record.signature !== undefined) {
    const info = await signatureForRecord(storeDir, record, await loadSignatureTrust(storeDir))
    if (info.status !== 'valid') return undefined
  }
  return formPath
}

/** Remove one pack of the current tenant. */
export async function removeTenantPack(storeDir: string, packId: string): Promise<boolean> {
  const packPath = packPathOf(storeDir, packId)
  const index = await readTenantPackIndex(storeDir)
  if (!index.packs.some((pack) => pack.id === packId)) return false
  await rm(packPath, { recursive: true, force: true })
  await writeTenantPackIndex(storeDir, {
    schemaVersion: 1,
    packs: index.packs.filter((pack) => pack.id !== packId),
  })
  return true
}

/** The names of the store's child folders, for tests and diagnostics. */
export async function storedPackIds(storeDir: string): Promise<string[]> {
  try {
    const entries = await readdir(storeDir, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory() && PACK_ID_PATTERN.test(entry.name))
      .map((entry) => entry.name)
      .sort()
  } catch {
    return []
  }
}

export { PACK_FOLDER_LIMITS }
