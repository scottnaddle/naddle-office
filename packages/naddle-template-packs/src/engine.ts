/**
 * The import engine: zip, folder and GitHub all end in the same validator.
 * A folder is copied to a size-capped staging folder first, so the files that
 * are validated and installed are the files that were copied.
 */
import { copyFile, mkdir, mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  disposeSkillImport,
  findSkillFolders,
  parseGitHubSkillAddress,
  prepareFolderImport,
  SkillImportError,
  prepareGitHubImport,
  prepareZipImport,
  type SkillFetch,
  type SkillImport,
  type SkillImportCandidate,
} from '@genoffice/ai-provider'
import { PACK_TEMP_FOLDER } from './constants'
import { TenantPackError, tenantPackMessage } from './errors'
import { isSafeRelPath, walkPackFiles } from './files'
import {
  installTenantPack,
  tenantPackIds,
  type InstallTenantPackOptions,
  type TenantPackIndexRecord,
} from './store'
import type { PackSignatureTrust } from './signature'
import { loadSignatureTrust } from './trust'
import {
  previewFailure,
  validateTenantPack,
  type TenantPackCandidate,
  type TenantPackOrigin,
  type TenantPackPreview,
} from './validator'

export interface TenantPackPrepared {
  preview: TenantPackPreview
  /** the folder that holds the pack root */
  root: string
  storeDir: string
  /** folders the caller must remove when the import ends, installed or not */
  cleanup: string[]
}

export interface TenantPackPrepareOptions {
  storeDir: string
  tempDir?: string | undefined
  homeDir?: string | undefined
  /** overrides the tenant's loaded trust store (tests and callers with a snapshot) */
  signatureTrust?: PackSignatureTrust | undefined
}

function tempRoot(options: { tempDir?: string | undefined }): string {
  return options.tempDir ?? join(tmpdir(), PACK_TEMP_FOLDER)
}

async function exists(path: string): Promise<boolean> {
  return (await stat(path).catch(() => undefined)) !== undefined
}

/** The archive helpers' errors carry a `kind`; the pack API uses its own codes. */
function mapImportError(error: unknown): unknown {
  if (error instanceof TenantPackError) return error
  if (error instanceof SkillImportError) {
    const code =
      error.kind === 'unsafe' || error.kind === 'too-large' || error.kind === 'not-found'
        ? error.kind
        : 'failed'
    return new TenantPackError(code, error.message)
  }
  return error
}

interface ResolvedRoot {
  root: string
  /** path from the import root to the pack root, `''` when they are the same */
  prefix: string
}

/**
 * The pack root inside the folder the import produced. A zip made by zipping a
 * folder usually has one top folder; accept that without widening the allowlist.
 */
async function resolvePackRoot(importRoot: string, githubPath: string): Promise<ResolvedRoot> {
  const preferred = githubPath ? join(importRoot, ...githubPath.split('/')) : importRoot
  if (await exists(join(preferred, 'manifest.json'))) {
    return { root: preferred, prefix: githubPath }
  }
  if (githubPath) return { root: preferred, prefix: githubPath }
  if (await exists(join(importRoot, 'manifest.json'))) return { root: importRoot, prefix: '' }
  const entries = await readdir(importRoot, { withFileTypes: true }).catch(() => [])
  const folders = entries.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
  if (folders.length === 1) {
    const only = join(importRoot, folders[0]!.name)
    if (await exists(join(only, 'manifest.json'))) {
      return { root: only, prefix: folders[0]!.name }
    }
  }
  return { root: importRoot, prefix: '' }
}

function mapCandidates(
  candidates: readonly SkillImportCandidate[],
  prefix: string,
): TenantPackCandidate[] {
  return candidates.map((candidate) => {
    if (!prefix) return { rel: candidate.rel, problem: candidate.problem }
    if (candidate.rel === prefix) return { rel: '', problem: candidate.problem }
    if (candidate.rel.startsWith(`${prefix}/`)) {
      return {
        rel: candidate.rel.slice(prefix.length + 1),
        problem: candidate.problem,
      }
    }
    return {
      rel: candidate.rel,
      problem: candidate.problem ?? 'the skill is outside the pack root',
    }
  })
}

async function previewOf(
  imported: SkillImport,
  origin: TenantPackOrigin,
  options: TenantPackPrepareOptions,
): Promise<{ preview: TenantPackPreview; root: string }> {
  const githubPath = imported.origin.kind === 'github' ? imported.origin.path : ''
  const resolved = await resolvePackRoot(imported.root, githubPath)
  const candidates = mapCandidates(imported.candidates, resolved.prefix)
  let preview: TenantPackPreview
  try {
    preview = await validateTenantPack(resolved.root, {
      origin,
      candidates,
      existingPackIds: await tenantPackIds(options.storeDir),
      signatureTrust: options.signatureTrust ?? (await loadSignatureTrust(options.storeDir)),
    })
  } catch (error) {
    preview = previewFailure(origin, error)
  }
  return { preview, root: resolved.root }
}

/** Prepare a zip file. The caller reviews `preview` and then installs or disposes. */
export async function prepareTenantPackZip(
  file: string,
  options: TenantPackPrepareOptions,
): Promise<TenantPackPrepared> {
  let imported: SkillImport
  try {
    imported = await prepareZipImport({
      file,
      appSkillsDir: options.storeDir,
      tempDir: tempRoot(options),
    })
  } catch (error) {
    throw mapImportError(error)
  }
  try {
    const origin: TenantPackOrigin = { kind: 'zip', file }
    const { preview, root } = await previewOf(imported, origin, options)
    return {
      preview,
      root,
      storeDir: options.storeDir,
      cleanup: imported.tempDir ? [imported.tempDir] : [],
    }
  } catch (error) {
    await disposeSkillImport(imported).catch(() => undefined)
    throw error
  }
}

async function stageFolder(folder: string, options: TenantPackPrepareOptions): Promise<string> {
  const info = await stat(folder).catch(() => undefined)
  if (!info?.isDirectory())
    throw new TenantPackError('not-found', 'The chosen folder cannot be read')
  await mkdir(tempRoot(options), { recursive: true })
  const work = await mkdtemp(join(tempRoot(options), 'pack-'))
  const staged = join(work, 'pack')
  await mkdir(staged, { recursive: true })
  const files = await walkPackFiles(folder)
  for (const file of files) {
    const target = join(staged, ...file.rel.split('/'))
    await mkdir(dirname(target), { recursive: true })
    await copyFile(file.path, target)
  }
  return work
}

/**
 * Prepare a folder. The folder is copied to a staging folder first and only the
 * copy is validated and installed, so a file cannot change between the two.
 */
export async function prepareTenantPackFolder(
  folder: string,
  options: TenantPackPrepareOptions,
): Promise<TenantPackPrepared> {
  const work = await stageFolder(folder, options)
  try {
    let imported: SkillImport
    try {
      imported = await prepareFolderImport({
        folder: join(work, 'pack'),
        appSkillsDir: options.storeDir,
        homeDir: options.homeDir ?? homedir(),
      })
    } catch (error) {
      throw mapImportError(error)
    }
    const origin: TenantPackOrigin = { kind: 'folder', folder }
    const { preview, root } = await previewOf(imported, origin, options)
    return {
      preview,
      root,
      storeDir: options.storeDir,
      cleanup: [work, ...(imported.tempDir ? [imported.tempDir] : [])],
    }
  } catch (error) {
    await rm(work, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

export interface TenantPackGitHubOptions extends TenantPackPrepareOptions {
  fetch: SkillFetch
  signal?: AbortSignal | undefined
}

/**
 * Prepare a GitHub repository or subfolder. A single skill address
 * (`owner/repo@name`) is not a pack and is refused before any request.
 */
export async function prepareTenantPackGitHub(
  address: string,
  options: TenantPackGitHubOptions,
): Promise<TenantPackPrepared> {
  const parsed = parseGitHubSkillAddress(address)
  if (!parsed) throw new TenantPackError('bad-address', 'Not a GitHub address the app accepts')
  if (parsed.skill !== undefined) {
    throw new TenantPackError(
      'single-skill',
      'A tenant pack address must name a repository or folder, not a single skill',
    )
  }
  let imported: SkillImport
  try {
    imported = await prepareGitHubImport({
      address,
      fetch: options.fetch,
      appSkillsDir: options.storeDir,
      tempDir: tempRoot(options),
      ...(options.signal ? { signal: options.signal } : {}),
    })
  } catch (error) {
    throw mapImportError(error)
  }
  try {
    const source = imported.origin
    const origin: TenantPackOrigin =
      source.kind === 'github'
        ? {
            kind: 'github',
            repo: source.repo,
            ref: source.ref,
            commit: source.commit,
            path: source.path,
          }
        : { kind: 'github', repo: '', ref: '', commit: '', path: '' }
    const { preview, root } = await previewOf(imported, origin, options)
    return {
      preview,
      root,
      storeDir: options.storeDir,
      cleanup: imported.tempDir ? [imported.tempDir] : [],
    }
  } catch (error) {
    await disposeSkillImport(imported).catch(() => undefined)
    throw error
  }
}

/** Remove the temporary folders of a prepared import (after installing or cancelling). */
export async function disposeTenantPack(
  prepared: Pick<TenantPackPrepared, 'cleanup'>,
): Promise<void> {
  for (const dir of new Set(prepared.cleanup)) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

/** Install a prepared pack after the user confirmed the rights. */
export async function installPreparedTenantPack(
  prepared: TenantPackPrepared,
  options: InstallTenantPackOptions,
): Promise<TenantPackIndexRecord> {
  return installTenantPack(prepared.root, prepared.preview, prepared.storeDir, options)
}

/** The skill folders inside a pack root (used by tests and future callers). */
export async function packSkillFolders(root: string): Promise<string[]> {
  const folders = await findSkillFolders(root)
  return folders.filter((rel) => rel === '' || isSafeRelPath(rel))
}

export { tenantPackMessage }
