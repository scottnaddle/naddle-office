/**
 * Template manifest ledger.
 *
 * One schema for every template the app knows about, styled after
 * `apps/shell/resources/builtin-skills/builtin-skills.json`: each entry records
 * id, version, license, source, author, locale and, when a form file ships with
 * it, the file path and its sha256. The builtin ledger lives next to this file
 * in `builtin-templates.json`; tenant packs and signed distribution (S4) are
 * meant to reuse the same shape.
 *
 * Kinds:
 * - `document-brief`: a structured brief (questions + ordered sections) the
 *   document writer fills. The runtime data for the docs app comes from here.
 * - `slide-design`: provenance for a built-in slide design. The TypeScript
 *   templates under `packages/pipelines/src/slides/templates` stay the runtime
 *   source of truth for style; this ledger only mirrors ids, names, order and
 *   origin.
 * - `form-skill`: a user/tenant skill folder (SKILL.md) that may carry a form
 *   file through `metadata.ieum-template`. The builtin ledger has none yet.
 *
 * Pure module: no file system, no network. Safe to import in the renderer.
 */
import type { AuthoringQuestion, BriefSection } from './types'
import builtinTemplatesJson from './builtin-templates.json'

export const TEMPLATE_MANIFEST_ID = 'naddle-template-manifest'
export const TEMPLATE_MANIFEST_VERSION = 1

export const TEMPLATE_MANIFEST_KINDS = ['document-brief', 'slide-design', 'form-skill'] as const
export type TemplateManifestKind = (typeof TEMPLATE_MANIFEST_KINDS)[number]

/** Where a manifest comes from. Builtin entries ship in the installer; tenant entries are imported by an organization. */
export type TemplateManifestScope = 'builtin' | 'tenant'

/**
 * Licenses an entry may carry. Builtin entries are limited to permissive or
 * attribution-only terms; `proprietary-tenant` is only for tenant packs, whose
 * owner is responsible for the right to use the form.
 */
export const BUILTIN_TEMPLATE_LICENSES = [
  'Apache-2.0',
  'MIT',
  'CC0-1.0',
  'CC-BY-4.0',
  'KOGL-Type1',
] as const
export const TENANT_TEMPLATE_LICENSE = 'proprietary-tenant'
export type TemplateLicense =
  (typeof BUILTIN_TEMPLATE_LICENSES)[number] | typeof TENANT_TEMPLATE_LICENSE

/** License identifiers that are never accepted, in any scope (non-commercial or no-derivatives terms). */
const REJECTED_LICENSE_PATTERNS: readonly RegExp[] = [
  /^CC-BY(-SA)?-NC/i,
  /^CC-BY-ND/i,
  /-NC-/i,
  /^KOGL-Type[234]$/i,
  /non-?commercial/i,
  /personal/i,
]

/**
 * Origins neither builtin entries nor tenant packs may come from: official
 * vendor template galleries and form marketplaces. Matched against source
 * repo/url, author and displayed names.
 */
export const REJECTED_TEMPLATE_ORIGINS: readonly RegExp[] = [
  /microsoft|office\.com|templates\.office/i,
  /docs\.google|google\s*(docs|workspace)|workspace\.google/i,
  /hancom|한컴/i,
  /yesform|예스폼/i,
  /bizforms?|비즈폼/i,
]

/** Whether any of the given texts names a rejected vendor or marketplace origin. */
export function isRejectedTemplateOrigin(
  ...values: ReadonlyArray<string | null | undefined>
): boolean {
  return values.some(
    (value) =>
      typeof value === 'string' && REJECTED_TEMPLATE_ORIGINS.some((pattern) => pattern.test(value)),
  )
}

const REJECTED_BUILTIN_ORIGINS = REJECTED_TEMPLATE_ORIGINS

export type TemplateSource =
  | { type: 'self' }
  | { type: 'github'; repo: string; commit: string; path: string }
  | { type: 'url'; url: string }
  | { type: 'tenant'; pack: string }

/** Optional form file shipped with an entry, relative to the entry's folder (e.g. `assets/양식.hwpx`). */
export interface TemplateFormAsset {
  path: string
}

interface TemplateManifestEntryBase {
  id: string
  kind: TemplateManifestKind
  /** Semantic version of the entry itself */
  version: string
  name: string
  description?: string
  category?: string
  tags?: string[]
  /** SPDX identifier, or `proprietary-tenant` for tenant packs */
  license: TemplateLicense
  source: TemplateSource
  author: string
  /** BCP 47 tag of the entry's text */
  locale: string
  formAsset?: TemplateFormAsset
  /** Hex sha256 of the form file; required when `formAsset` is set, otherwise absent or null */
  sha256?: string | null
  questions?: AuthoringQuestion[]
  sections?: BriefSection[]
}

export interface DocumentBriefEntry extends TemplateManifestEntryBase {
  kind: 'document-brief'
  previewText?: string
  questions: AuthoringQuestion[]
  sections: BriefSection[]
}

export interface SlideDesignEntry extends TemplateManifestEntryBase {
  kind: 'slide-design'
  scheme: 'light' | 'dark' | 'mixed'
}

export interface FormSkillEntry extends TemplateManifestEntryBase {
  kind: 'form-skill'
  /** The skill folder, relative to the pack root */
  skillPath: string
}

export type TemplateManifestEntry = DocumentBriefEntry | SlideDesignEntry | FormSkillEntry

export interface TemplateManifest {
  manifest: typeof TEMPLATE_MANIFEST_ID
  version: typeof TEMPLATE_MANIFEST_VERSION
  scope: TemplateManifestScope
  entries: TemplateManifestEntry[]
}

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const COMMIT_PATTERN = /^[0-9a-f]{40}$/
const LOCALE_PATTERN = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/
const FORM_ASSET_FOLDER = 'assets/'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

/** Whether a license may be used in the given scope. */
export function isTemplateLicenseAllowed(license: string, scope: TemplateManifestScope): boolean {
  if (REJECTED_LICENSE_PATTERNS.some((pattern) => pattern.test(license))) return false
  if ((BUILTIN_TEMPLATE_LICENSES as readonly string[]).includes(license)) return true
  return scope === 'tenant' && license === TENANT_TEMPLATE_LICENSE
}

/** A form path must stay inside `assets/`, the same rule as `metadata.ieum-template`. */
export function isFormAssetPath(path: string): boolean {
  if (!path.startsWith(FORM_ASSET_FOLDER) || path.length === FORM_ASSET_FOLDER.length) return false
  if (path.includes('\\') || path.includes('\0')) return false
  return !path.split('/').some((part) => part === '..' || part === '.' || part === '')
}

function sourceProblems(source: unknown, scope: TemplateManifestScope): string[] {
  if (!isRecord(source)) return ['source must be an object']
  switch (source.type) {
    case 'self':
      return []
    case 'github': {
      const problems: string[] = []
      if (!isText(source.repo) || !/^[\w.-]+\/[\w.-]+$/.test(source.repo))
        problems.push('source.repo must be owner/name')
      if (typeof source.commit !== 'string' || !COMMIT_PATTERN.test(source.commit))
        problems.push('source.commit must be a full commit hash')
      if (typeof source.path !== 'string') problems.push('source.path must be a string')
      return problems
    }
    case 'url':
      return isText(source.url) && /^https:\/\//.test(source.url)
        ? []
        : ['source.url must be https']
    case 'tenant':
      if (scope !== 'tenant') return ['tenant source is only allowed in a tenant manifest']
      return isText(source.pack) ? [] : ['source.pack is required']
    default:
      return ['source.type is unknown']
  }
}

function briefProblems(entry: Record<string, unknown>, required: boolean): string[] {
  const problems: string[] = []
  const { questions, sections } = entry
  if (questions === undefined && sections === undefined && !required) return problems
  if (!Array.isArray(questions) || (required && questions.length === 0)) {
    problems.push('questions must be a non-empty array')
  } else {
    const ids = new Set<string>()
    for (const question of questions) {
      if (!isRecord(question) || !isText(question.id) || !isText(question.label)) {
        problems.push('each question needs id and label')
        continue
      }
      if (ids.has(question.id)) problems.push(`duplicate question id ${question.id}`)
      ids.add(question.id)
    }
  }
  if (!Array.isArray(sections) || (required && sections.length === 0)) {
    problems.push('sections must be a non-empty array')
  } else {
    const ids = new Set<string>()
    for (const section of sections) {
      if (!isRecord(section) || !isText(section.id) || !isText(section.title)) {
        problems.push('each section needs id and title')
        continue
      }
      if (ids.has(section.id)) problems.push(`duplicate section id ${section.id}`)
      ids.add(section.id)
    }
  }
  return problems
}

/** Every problem with one entry, as short English messages. Empty when the entry is valid. */
export function templateEntryProblems(entry: unknown, scope: TemplateManifestScope): string[] {
  if (!isRecord(entry)) return ['entry must be an object']
  const problems: string[] = []
  const kind = entry.kind
  if (!(TEMPLATE_MANIFEST_KINDS as readonly unknown[]).includes(kind))
    problems.push('kind is unknown')
  if (typeof entry.id !== 'string' || !ID_PATTERN.test(entry.id))
    problems.push('id must be lowercase letters, digits and dashes')
  if (typeof entry.version !== 'string' || !VERSION_PATTERN.test(entry.version))
    problems.push('version must be x.y.z')
  if (!isText(entry.name)) problems.push('name is required')
  if (!isText(entry.author)) problems.push('author is required')
  if (typeof entry.locale !== 'string' || !LOCALE_PATTERN.test(entry.locale))
    problems.push('locale must be a BCP 47 tag')
  if (typeof entry.license !== 'string' || !isTemplateLicenseAllowed(entry.license, scope)) {
    problems.push(`license ${String(entry.license)} is not allowed in a ${scope} manifest`)
  }
  problems.push(...sourceProblems(entry.source, scope))

  if (scope === 'builtin') {
    const origin = [
      isRecord(entry.source) ? entry.source.repo : undefined,
      isRecord(entry.source) ? entry.source.url : undefined,
      entry.author,
    ].filter((value): value is string => typeof value === 'string')
    if (origin.some((value) => REJECTED_BUILTIN_ORIGINS.some((pattern) => pattern.test(value)))) {
      problems.push('builtin entries must not bundle vendor or marketplace templates')
    }
  }

  if (entry.formAsset !== undefined) {
    if (
      !isRecord(entry.formAsset) ||
      typeof entry.formAsset.path !== 'string' ||
      !isFormAssetPath(entry.formAsset.path)
    ) {
      problems.push('formAsset.path must be a file under assets/')
    }
    if (typeof entry.sha256 !== 'string' || !SHA256_PATTERN.test(entry.sha256)) {
      problems.push('sha256 is required (lowercase hex) when formAsset is set')
    }
  } else if (entry.sha256 !== undefined && entry.sha256 !== null) {
    problems.push('sha256 must be absent or null without formAsset')
  }

  if (kind === 'document-brief') problems.push(...briefProblems(entry, true))
  else problems.push(...briefProblems(entry, false))
  if (kind === 'slide-design' && !['light', 'dark', 'mixed'].includes(entry.scheme as string)) {
    problems.push('scheme must be light, dark or mixed')
  }
  if (kind === 'form-skill' && !isText(entry.skillPath)) problems.push('skillPath is required')
  return problems
}

/** Every problem with a whole manifest; entries are reported as `<index>:<id>: message`. */
export function templateManifestProblems(manifest: unknown): string[] {
  if (!isRecord(manifest)) return ['manifest must be an object']
  const problems: string[] = []
  if (manifest.manifest !== TEMPLATE_MANIFEST_ID)
    problems.push(`manifest must be ${TEMPLATE_MANIFEST_ID}`)
  if (manifest.version !== TEMPLATE_MANIFEST_VERSION)
    problems.push(`version must be ${TEMPLATE_MANIFEST_VERSION}`)
  const scope = manifest.scope
  if (scope !== 'builtin' && scope !== 'tenant') problems.push('scope must be builtin or tenant')
  if (!Array.isArray(manifest.entries)) return [...problems, 'entries must be an array']
  const seen = new Set<string>()
  manifest.entries.forEach((entry, index) => {
    const id = isRecord(entry) && typeof entry.id === 'string' ? entry.id : '?'
    const key = isRecord(entry) ? `${String(entry.kind)}:${id}` : id
    if (seen.has(key)) problems.push(`${index}:${id}: duplicate id within kind`)
    seen.add(key)
    for (const problem of templateEntryProblems(entry, scope === 'tenant' ? 'tenant' : 'builtin')) {
      problems.push(`${index}:${id}: ${problem}`)
    }
  })
  return problems
}

/** Validates and returns a manifest, or throws with every problem listed. */
export function parseTemplateManifest(manifest: unknown): TemplateManifest {
  const problems = templateManifestProblems(manifest)
  if (problems.length > 0) throw new Error(`Invalid template manifest:\n${problems.join('\n')}`)
  return manifest as TemplateManifest
}

/** The builtin ledger, validated once at module load. */
export const BUILTIN_TEMPLATE_MANIFEST: TemplateManifest =
  parseTemplateManifest(builtinTemplatesJson)

/** Builtin entries of one kind, in ledger order. */
export function builtinTemplateEntries<K extends TemplateManifestKind>(
  kind: K,
): Extract<TemplateManifestEntry, { kind: K }>[] {
  return BUILTIN_TEMPLATE_MANIFEST.entries.filter(
    (entry): entry is Extract<TemplateManifestEntry, { kind: K }> => entry.kind === kind,
  )
}

/** What a form skill looks like before it is turned into a manifest entry. */
export interface FormSkillInput {
  /** Skill front matter `name` */
  name: string
  /** `metadata.ieum-title`, else the name */
  title?: string
  description?: string
  /** `metadata.ieum-template`, relative to the skill folder */
  template?: string
  /** The skill folder, relative to the pack root */
  skillPath: string
  version?: string
  license: string
  source: TemplateSource
  author: string
  locale?: string
  /** Hex sha256 of the template file, computed by the caller that can read it */
  sha256?: string | null
}

/**
 * Maps a form skill (front matter + `metadata.ieum-template`) to a manifest
 * entry. Pure: the caller hashes the form file. A template outside `assets/`
 * is dropped, matching how the skill reader treats it. Validate the result
 * with `templateEntryProblems`.
 */
export function formSkillManifestEntry(input: FormSkillInput): FormSkillEntry {
  const id = input.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const template = input.template?.trim()
  const formAsset = template && isFormAssetPath(template) ? { path: template } : undefined
  const entry: FormSkillEntry = {
    id,
    kind: 'form-skill',
    version: input.version ?? '1.0.0',
    name: input.title?.trim() || input.name,
    license: input.license as TemplateLicense,
    source: input.source,
    author: input.author,
    locale: input.locale ?? 'ko',
    skillPath: input.skillPath,
  }
  if (input.description?.trim()) entry.description = input.description.trim()
  if (formAsset) {
    entry.formAsset = formAsset
    entry.sha256 = input.sha256 ?? null
  }
  return entry
}
