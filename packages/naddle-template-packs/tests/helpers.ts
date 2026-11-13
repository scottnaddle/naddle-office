import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import JSZip from 'jszip'

export interface FormOptions {
  /** extra archive entries, so a test can add a macro or a relationship */
  add?: (zip: JSZip) => void
}

/** A readable form archive with no macro, script or external relationship. */
export async function makeForm(options: FormOptions = {}): Promise<Buffer> {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
  )
  zip.file('mimetype', 'application/hwp+zip')
  zip.file('Contents/content.hpf', '<hpf version="1.4"></hpf>')
  zip.file('word/document.xml', '<document></document>')
  zip.file('xl/workbook.xml', '<workbook></workbook>')
  zip.file('ppt/presentation.xml', '<presentation></presentation>')
  options.add?.(zip)
  return zip.generateAsync({ type: 'nodebuffer' })
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export const SKILL_NAME = 'leave-form'
export const SKILL_PATH = 'forms/leave'
export const FORM_ASSET = 'assets/leave.hwpx'
export const PACK_ID = 'acme-pack'

export interface ManifestOptions {
  packId?: string
  skillPath?: string
  formAsset?: string
  sha256?: string
  license?: string
  author?: string
  scope?: string
  sourcePack?: string
  kind?: string
  extraEntries?: Record<string, unknown>[]
  omitPack?: boolean
  omitFormAsset?: boolean
  name?: string
  publisher?: string
}

/** A minimal valid tenant manifest; overrides make the negative cases. */
export function manifest(options: ManifestOptions = {}): Record<string, unknown> {
  const packId = options.packId ?? PACK_ID
  const skillPath = options.skillPath ?? SKILL_PATH
  const formAsset = options.formAsset ?? FORM_ASSET
  const digest = options.sha256 ?? 'a'.repeat(64)
  const entry: Record<string, unknown> = {
    id: 'leave-form',
    kind: options.kind ?? 'form-skill',
    version: '1.0.0',
    name: 'Leave request form',
    license: options.license ?? 'proprietary-tenant',
    source: { type: 'tenant', pack: options.sourcePack ?? packId },
    author: options.author ?? 'Acme Company',
    locale: 'ko',
    ...(skillPath ? { skillPath } : {}),
  }
  if (!options.omitFormAsset) {
    entry.formAsset = { path: formAsset }
    entry.sha256 = digest
  }
  return {
    manifest: 'naddle-template-manifest',
    version: 1,
    scope: options.scope ?? 'tenant',
    ...(options.omitPack
      ? {}
      : {
          pack: {
            id: packId,
            name: options.name ?? 'Acme forms',
            version: '1.0.0',
            publisher: options.publisher ?? 'Acme Company',
          },
        }),
    entries: [entry, ...(options.extraEntries ?? [])],
  }
}

export function skillMd(template: string | undefined = FORM_ASSET, extra = ''): string {
  return [
    '---',
    `name: ${SKILL_NAME}`,
    'description: Leave request form',
    'metadata:',
    ...(template ? [`  ieum-template: ${template}`] : []),
    '---',
    extra,
    'Use this form.',
  ].join('\n')
}

export interface PackOptions extends ManifestOptions {
  manifestRaw?: string
  skill?: string
  formBytes?: Buffer
  extraFiles?: Record<string, string | Buffer>
  omitManifest?: boolean
  omitSkill?: boolean
  omitForm?: boolean
}

/** Write a pack folder and return its root. */
export async function writePack(root: string, options: PackOptions = {}): Promise<string> {
  await mkdir(root, { recursive: true })
  const skillPath = options.skillPath ?? SKILL_PATH
  const formAsset = options.formAsset ?? FORM_ASSET
  const formBytes = options.formBytes ?? (await makeForm())
  const raw =
    options.manifestRaw ??
    JSON.stringify(manifest({ ...options, sha256: options.sha256 ?? sha256(formBytes) }), null, 2)
  if (!options.omitManifest) await writeFile(join(root, 'manifest.json'), raw)
  if (!options.omitSkill) {
    await mkdir(join(root, ...skillPath.split('/')), { recursive: true })
    await writeFile(
      join(root, ...skillPath.split('/'), 'SKILL.md'),
      options.skill ?? skillMd(formAsset),
    )
  }
  if (!options.omitForm) {
    const formPath = join(root, ...skillPath.split('/'), ...formAsset.split('/'))
    await mkdir(dirname(formPath), { recursive: true })
    await writeFile(formPath, formBytes)
  }
  for (const [rel, content] of Object.entries(options.extraFiles ?? {})) {
    const path = join(root, ...rel.split('/'))
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content)
  }
  return root
}

async function addFolder(zip: JSZip, dir: string, relDir: string): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const path = join(dir, entry.name)
    const rel = relDir ? `${relDir}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      await addFolder(zip, path, rel)
    } else if (entry.isFile()) {
      zip.file(rel, await readFile(path))
    }
  }
}

/** Zip a folder, optionally under one top folder. */
export async function zipFolder(
  root: string,
  options: {
    topFolder?: string
    add?: (zip: JSZip) => void
    platform?: 'UNIX' | 'DOS'
  } = {},
): Promise<Buffer> {
  const zip = new JSZip()
  await addFolder(zip, root, options.topFolder ?? '')
  options.add?.(zip)
  return zip.generateAsync({
    type: 'nodebuffer',
    ...(options.platform ? { platform: options.platform } : {}),
  })
}

/** Write a zip of a pack folder and return the zip path. */
export async function writePackZip(
  root: string,
  zipPath: string,
  options: {
    topFolder?: string
    add?: (zip: JSZip) => void
    platform?: 'UNIX' | 'DOS'
  } = {},
): Promise<string> {
  await mkdir(dirname(zipPath), { recursive: true })
  await writeFile(zipPath, await zipFolder(root, options))
  return zipPath
}

/** A GitHub-style archive: one top folder, then the pack files. */
export async function githubArchive(root: string, topFolder = 'repo-abc123'): Promise<Buffer> {
  return zipFolder(root, { topFolder })
}
