/** Walking a pack folder without following links, and path helpers. */
import { lstat, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PACK_FOLDER_LIMITS } from './constants'
import { TenantPackError } from './errors'

export interface PackFile {
  rel: string
  path: string
  size: number
}

export interface PackFolderLimits {
  files: number
  bytes: number
}

/**
 * Every regular file below `root`, sorted by inside path. Symbolic links are
 * refused instead of followed, so a pack can never read outside its folder.
 */
export async function walkPackFiles(
  root: string,
  limits: PackFolderLimits = PACK_FOLDER_LIMITS,
): Promise<PackFile[]> {
  const out: PackFile[] = []
  let bytes = 0
  const walk = async (dir: string, relDir: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true })
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    for (const entry of entries) {
      const path = join(dir, entry.name)
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name
      if (entry.isSymbolicLink()) {
        throw new TenantPackError('unsafe', `Links are not allowed in a template pack: ${rel}`)
      }
      if (entry.isDirectory()) {
        await walk(path, rel)
        continue
      }
      if (!entry.isFile()) {
        throw new TenantPackError('unsafe', `Only regular files are allowed: ${rel}`)
      }
      const info = await lstat(path)
      if (!info.isFile())
        throw new TenantPackError('unsafe', `Only regular files are allowed: ${rel}`)
      bytes += info.size
      out.push({ rel, path, size: info.size })
      if (out.length > limits.files || bytes > limits.bytes) {
        throw new TenantPackError('too-large', 'The template pack is too large')
      }
    }
  }
  await walk(root, '')
  return out
}

/** A relative path with `/` between parts and no `.`/`..` escape. */
export function isSafeRelPath(path: string): boolean {
  if (!path || path.includes('\\') || path.startsWith('/') || /^[A-Za-z]:/.test(path)) {
    return false
  }
  const parts = path.split('/')
  return parts.every((part) => part !== '' && part !== '.' && part !== '..')
}

/** The license/notice/readme files a pack root may carry. */
export function isRootPackDocument(rel: string): boolean {
  if (rel.includes('/')) return false
  return /^(?:licen[cs]e|notice)(?:[.-][^/]*)?$|^readme\.md$/i.test(rel)
}

/** A markdown, text or image file a pack may carry outside `assets/`. */
export function isPlainPackFile(rel: string): boolean {
  return /\.(?:md|txt|png|jpe?g)$/i.test(rel)
}

/** Read a pack file's bytes. */
export async function readPackFile(file: PackFile): Promise<Uint8Array> {
  return new Uint8Array(await readFile(file.path))
}
