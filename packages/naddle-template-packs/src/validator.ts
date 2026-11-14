/**
 * Full validation of a tenant template pack. Nothing is installed here; the
 * result is a preview whose `problems` must be empty before the user can
 * install.
 */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { isSkillScriptPath, mcpServersOfSkillMd, parseSkillMd } from '@genoffice/ai-provider'
import {
  templateManifestProblems,
  type FormSkillEntry,
  type TemplateManifest,
  type TemplateManifestEntry,
} from '../../ui/src/authoring/manifest'
import {
  PACK_ID_PATTERN,
  PACK_MANIFEST_FILE,
  PACK_SIGNATURE_FILE,
  PACK_VERSION_PATTERN,
} from './constants'
import { TenantPackError, tenantPackMessage } from './errors'
import {
  isPlainPackFile,
  isRootPackDocument,
  isSafeRelPath,
  readPackFile,
  walkPackFiles,
  type PackFile,
} from './files'
import { licenseAllowedInTenant, normalizeManifestLicenses, rejectedOriginProblem } from './license'
import { scanFilesForMacros, type ScannableFile } from './macros'
import {
  EMPTY_PACK_TRUST,
  verifyPackSignature,
  type PackSignatureInfo,
  type PackSignatureTrust,
} from './signature'

export type TenantPackOrigin =
  | { kind: 'zip'; file: string }
  | { kind: 'folder'; folder: string }
  | { kind: 'github'; repo: string; ref: string; commit: string; path: string }

export interface TenantPackCandidate {
  /** path relative to the pack root, `/` between parts */
  rel: string
  /** why the skill cannot be used, from the import helper */
  problem?: string | undefined
}

export interface TenantPackEntryPreview {
  id: string
  kind: string
  name: string
  license: string
  author: string
  skillPath: string
  formAsset?: string
  sha256?: string
  sha256Match: boolean
  problems: string[]
}

export interface TenantPackPreview {
  pack: {
    id: string
    name: string
    version: string
    publisher?: string
    description?: string
  }
  origin: TenantPackOrigin
  license: string
  licenseNormalized: boolean
  author: string
  entries: TenantPackEntryPreview[]
  problems: string[]
  requiresAttestation: boolean
  replacesExisting: boolean
  signature: PackSignatureInfo
}

export interface ValidateTenantPackOptions {
  origin: TenantPackOrigin
  candidates: readonly TenantPackCandidate[]
  existingPackIds?: ReadonlySet<string> | undefined
  /** built-in plus the current tenant's keys; omitted means no keys */
  signatureTrust?: PackSignatureTrust | undefined
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const sha256Of = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

function emptyPreview(origin: TenantPackOrigin): TenantPackPreview {
  return {
    pack: { id: '', name: '', version: '' },
    origin,
    license: '',
    licenseNormalized: false,
    author: '',
    entries: [],
    problems: [],
    requiresAttestation: true,
    replacesExisting: false,
    signature: { status: 'unsigned', problems: [] },
  }
}

function manifestEntryKind(entry: TemplateManifestEntry): string {
  return entry.kind
}

/** Every file is either a declared form skill file or a safe pack document. */
function layoutProblems(
  files: readonly PackFile[],
  entries: readonly TemplateManifestEntry[],
): string[] {
  const problems: string[] = []
  const formPaths = new Set<string>()
  const skillMdPaths = new Set<string>()
  for (const entry of entries) {
    if (entry.kind !== 'form-skill') continue
    skillMdPaths.add(`${entry.skillPath}/SKILL.md`)
    if (entry.formAsset) formPaths.add(`${entry.skillPath}/${entry.formAsset.path}`)
  }
  for (const file of files) {
    const rel = file.rel
    if (rel === PACK_MANIFEST_FILE || rel === PACK_SIGNATURE_FILE || isRootPackDocument(rel)) {
      continue
    }
    if (rel.split('/').includes('assets')) {
      if (!formPaths.has(rel)) problems.push(`an asset is not part of any manifest entry: ${rel}`)
      continue
    }
    if (rel === 'SKILL.md') {
      problems.push('SKILL.md must sit in the folder a manifest entry names')
      continue
    }
    if (rel.endsWith('/SKILL.md')) {
      if (!skillMdPaths.has(rel)) problems.push(`a SKILL.md is not in the manifest: ${rel}`)
      continue
    }
    if (formPaths.has(rel)) continue
    if (isPlainPackFile(rel)) continue
    problems.push(`file is not allowed in a template pack: ${rel}`)
  }
  return problems
}

function sourceProblems(entry: TemplateManifestEntry, packId: string): string[] {
  const source = entry.source
  if (!isRecord(source) || source.type !== 'tenant') {
    return [`${entry.id}: source must be { "type": "tenant", "pack": "${packId}" }`]
  }
  if (source.pack !== packId) {
    return [`${entry.id}: source.pack must be ${packId}`]
  }
  return []
}

function scriptsInSkillProblems(parsed: ReturnType<typeof parseSkillMd>): string[] {
  if (!parsed) return []
  const problems: string[] = []
  if (mcpServersOfSkillMd(parsed).length > 0) {
    problems.push('SKILL.md declares an MCP server')
  }
  const toolKeys = ['allowed-tools', 'tools', 'mcp-servers', 'mcpServers', 'hooks']
  for (const key of toolKeys) {
    if (
      parsed.lists[key] !== undefined ||
      parsed.fields[key] !== undefined ||
      parsed.metadata[key] !== undefined
    ) {
      problems.push(`SKILL.md declares tools (${key})`)
    }
  }
  return problems
}

async function validateEntries(
  root: string,
  manifest: TemplateManifest,
  packId: string,
  files: readonly PackFile[],
  candidates: readonly TenantPackCandidate[],
): Promise<{ entries: TenantPackEntryPreview[]; problems: string[] }> {
  const problems: string[] = []
  const entries: TenantPackEntryPreview[] = []
  if (!manifest.entries.some((entry) => entry.kind === 'form-skill')) {
    problems.push('a tenant pack needs at least one form-skill entry')
  }

  const candidateByRel = new Map<string, TenantPackCandidate>()
  for (const candidate of candidates) {
    if (candidate.problem) problems.push(`${candidate.rel}: ${candidate.problem}`)
    candidateByRel.set(candidate.rel, candidate)
  }

  const fileByRel = new Map(files.map((file) => [file.rel, file]))
  const manifestSkillPaths = new Set<string>()
  const formBytes = new Map<string, Uint8Array>()

  for (const entry of manifest.entries) {
    const entryProblems: string[] = []
    if (entry.kind === 'slide-design') {
      entryProblems.push('slide-design entries are not part of a tenant pack in this version')
    }
    entryProblems.push(...sourceProblems(entry, packId))

    let sha256Match = false
    if (entry.formAsset && entry.kind !== 'form-skill') {
      entryProblems.push('only a form-skill entry may carry a form file')
    }

    if (entry.kind === 'form-skill') {
      const skill = entry as FormSkillEntry
      if (!isSafeRelPath(skill.skillPath)) {
        entryProblems.push('skillPath must be a relative folder inside the pack')
      } else {
        manifestSkillPaths.add(skill.skillPath)
        const skillMdRel = `${skill.skillPath}/SKILL.md`
        const skillMdFile = fileByRel.get(skillMdRel)
        const skillMd = skillMdFile
          ? await readFile(skillMdFile.path, 'utf8').catch(() => undefined)
          : undefined
        if (!skillMdFile || skillMd === undefined) {
          entryProblems.push(`SKILL.md is missing at ${skillMdRel}`)
        } else {
          const parsed = parseSkillMd(skillMd)
          entryProblems.push(...scriptsInSkillProblems(parsed))
          const template = parsed?.metadata['ieum-template']?.trim()
          if (skill.formAsset) {
            if (!template) {
              entryProblems.push('SKILL.md metadata.ieum-template is required for a form file')
            } else if (template !== skill.formAsset.path) {
              entryProblems.push(
                `SKILL.md metadata.ieum-template (${template}) must match formAsset.path (${skill.formAsset.path})`,
              )
            }
          } else if (template) {
            entryProblems.push('SKILL.md names a template the manifest does not declare')
          }
        }

        if (skill.formAsset) {
          const formRel = `${skill.skillPath}/${skill.formAsset.path}`
          const formFile = fileByRel.get(formRel)
          if (!formFile) {
            entryProblems.push(`form file is missing: ${formRel}`)
          } else {
            const bytes = await readPackFile(formFile)
            formBytes.set(formRel, bytes)
            const digest = sha256Of(bytes)
            sha256Match = typeof skill.sha256 === 'string' && digest === skill.sha256
            if (!sha256Match) {
              entryProblems.push(`sha256 does not match the form bytes: ${formRel}`)
            }
          }
        }
      }
    }

    const license = entry.license
    if (!licenseAllowedInTenant(license)) {
      entryProblems.push(`license ${license} is not allowed in a tenant pack`)
    }
    const originProblem = rejectedOriginProblem([entry.author, entry.name, entry.description])
    if (originProblem) entryProblems.push(originProblem)

    entries.push({
      id: entry.id,
      kind: manifestEntryKind(entry),
      name: entry.name,
      license,
      author: entry.author,
      skillPath: entry.kind === 'form-skill' ? entry.skillPath : '',
      ...(entry.kind === 'form-skill' && entry.formAsset
        ? { formAsset: entry.formAsset.path }
        : {}),
      ...(typeof entry.sha256 === 'string' ? { sha256: entry.sha256 } : {}),
      sha256Match,
      problems: entryProblems,
    })
    problems.push(...entryProblems.map((problem) => `${entry.id}: ${problem}`))
  }

  const candidateRels = new Set(candidateByRel.keys())
  for (const rel of candidateRels) {
    if (!manifestSkillPaths.has(rel)) {
      problems.push(`a skill folder is not in the manifest: ${rel || '.'}`)
    }
  }
  for (const rel of manifestSkillPaths) {
    if (!candidateRels.has(rel)) problems.push(`manifest entry skill path is missing: ${rel}`)
  }

  const scannable: ScannableFile[] = files.map((file) => ({
    rel: file.rel,
    path: file.path,
    size: file.size,
    bytes: formBytes.get(file.rel) ?? new Uint8Array(),
  }))
  problems.push(...(await scanFilesForMacros(scannable)))

  return { entries, problems }
}

/**
 * Validate one unpacked pack. All problems are collected, not thrown, so the
 * preview can show every reason at once.
 */
export async function validateTenantPack(
  root: string,
  options: ValidateTenantPackOptions,
): Promise<TenantPackPreview> {
  const preview = emptyPreview(options.origin)
  const problems: string[] = []
  let files: PackFile[]
  try {
    files = await walkPackFiles(root)
  } catch (error) {
    preview.problems = [tenantPackMessage(error)]
    return preview
  }

  for (const file of files) {
    if (isSkillScriptPath(file.rel)) {
      problems.push(`scripts are not allowed in a template pack: ${file.rel}`)
    }
  }

  const signatureTrust = options.signatureTrust ?? EMPTY_PACK_TRUST
  const readSignature = async (): Promise<void> => {
    preview.signature = await verifyPackSignature(root, signatureTrust)
  }

  const manifestFile = files.find((file) => file.rel === PACK_MANIFEST_FILE)
  if (!manifestFile) {
    preview.problems = ['manifest.json is missing at the pack root']
    await readSignature()
    return preview
  }

  let raw: unknown
  try {
    raw = JSON.parse(await readFile(manifestFile.path, 'utf8')) as unknown
  } catch {
    preview.problems = ['manifest.json is not valid JSON']
    await readSignature()
    return preview
  }
  if (!isRecord(raw)) {
    preview.problems = ['manifest.json must be an object']
    await readSignature()
    return preview
  }

  const normalized = normalizeManifestLicenses(raw)
  preview.licenseNormalized = normalized.normalized
  const manifestProblems = templateManifestProblems(normalized.value)
  problems.push(...manifestProblems.map((problem) => `manifest: ${problem}`))

  if (raw.scope !== 'tenant') problems.push('manifest scope must be tenant')
  const rawPack = raw.pack
  if (!isRecord(rawPack)) {
    problems.push('manifest.pack is required')
  } else {
    if (typeof rawPack.id !== 'string' || !PACK_ID_PATTERN.test(rawPack.id)) {
      problems.push('pack.id must be lowercase letters, digits and dashes')
    } else {
      preview.pack.id = rawPack.id
      preview.replacesExisting = options.existingPackIds?.has(rawPack.id) === true
    }
    if (typeof rawPack.name !== 'string' || rawPack.name.trim() === '') {
      problems.push('pack.name is required')
    } else {
      preview.pack.name = rawPack.name.trim()
    }
    if (typeof rawPack.version !== 'string' || !PACK_VERSION_PATTERN.test(rawPack.version)) {
      problems.push('pack.version must be x.y.z')
    } else {
      preview.pack.version = rawPack.version
    }
    if (rawPack.publisher !== undefined) {
      if (typeof rawPack.publisher !== 'string') problems.push('pack.publisher must be a string')
      else preview.pack.publisher = rawPack.publisher
    }
    if (rawPack.description !== undefined) {
      if (typeof rawPack.description !== 'string') {
        problems.push('pack.description must be a string')
      } else {
        preview.pack.description = rawPack.description
      }
    }
  }

  if (manifestProblems.length > 0 || raw.scope !== 'tenant' || !isRecord(rawPack)) {
    preview.problems = problems
    await readSignature()
    return preview
  }

  const manifest = normalized.value as TemplateManifest
  preview.license = (manifest.entries[0]?.license as string | undefined) ?? ''
  preview.author = manifest.entries[0]?.author ?? ''
  const originProblem = rejectedOriginProblem([
    preview.pack.publisher,
    preview.pack.name,
    preview.pack.description,
    preview.author,
  ])
  if (originProblem) problems.push(originProblem)
  problems.push(...layoutProblems(files, manifest.entries))

  const validated = await validateEntries(
    root,
    manifest,
    preview.pack.id,
    files,
    options.candidates,
  )
  preview.entries = validated.entries
  problems.push(...validated.problems)

  const signature = await verifyPackSignature(root, signatureTrust)
  preview.signature = signature
  if (signature.status !== 'unsigned' && signature.status !== 'valid') {
    problems.push(`the pack signature is not valid (${signature.status})`)
  }

  preview.problems = [...new Set(problems)]
  return preview
}

/** Turn an unexpected validator error into one preview problem. */
export function previewFailure(origin: TenantPackOrigin, error: unknown): TenantPackPreview {
  const preview = emptyPreview(origin)
  preview.problems = [error instanceof TenantPackError ? error.message : tenantPackMessage(error)]
  return preview
}
