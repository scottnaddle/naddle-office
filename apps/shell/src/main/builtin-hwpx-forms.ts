/**
 * Where the ten builtin HWPX office forms live, and how to read one.
 *
 * The forms are committed under `packages/ui/src/authoring/assets` and ship as
 * `<resources>/builtin-hwpx-forms` (apps/shell/electron-builder.cjs). This
 * module resolves the same folder in a dev run (the checkout's assets) and in
 * the installed app, then verifies the file against the ledger sha256. A
 * missing or changed file fails; no substitute form is generated.
 *
 * No Electron import: the host facts are passed in, so the unit test can use
 * the committed assets and a fake resources directory.
 */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import builtinTemplates from '../../../../packages/ui/src/authoring/builtin-templates.json'

/** the folder's name under the packaged app's resources */
export const BUILTIN_HWPX_FORMS_DIR_NAME = 'builtin-hwpx-forms'

/** the folder in the checkout, relative to the repo root */
export const BUILTIN_HWPX_FORMS_REPO_DIR = 'packages/ui/src/authoring/assets'

const FORM_ASSET_FOLDER = 'assets/'
const SHA256_PATTERN = /^[0-9a-f]{64}$/

/** The subset of Electron's `app` (plus `process.resourcesPath`) needed here. */
export interface BuiltinHwpxFormsHost {
  readonly isPackaged: boolean
  getAppPath(): string
  readonly resourcesPath: string
}

export interface BuiltinHwpxFormEntry {
  id: string
  name: string
  assetPath: string
  sha256: string
}

interface LedgerEntry {
  id: string
  kind: string
  name: string
  formAsset?: { path: string }
  sha256?: string | null
}

interface Ledger {
  entries: LedgerEntry[]
}

const LEDGER = builtinTemplates as Ledger

/**
 * The builtin form folder: `<resources>/builtin-hwpx-forms` in the installed
 * app; in a dev run the checkout's folder, found from the app path
 * (`apps/<app>`, two levels below the repo root, for the shell and every
 * editor alike).
 */
export function builtinHwpxFormsDir(host: BuiltinHwpxFormsHost): string {
  if (host.isPackaged) return join(host.resourcesPath, BUILTIN_HWPX_FORMS_DIR_NAME)
  return resolve(host.getAppPath(), '..', '..', BUILTIN_HWPX_FORMS_REPO_DIR)
}

/** The ledger entry for one S3 form, or undefined when no form file ships with it. */
export function builtinHwpxFormEntry(id: string): BuiltinHwpxFormEntry | undefined {
  const entry = LEDGER.entries.find(
    (item) => item.kind === 'document-brief' && item.id === id && item.formAsset,
  )
  const assetPath = entry?.formAsset?.path
  const sha256 = entry?.sha256
  if (!entry || !assetPath || typeof sha256 !== 'string' || !SHA256_PATTERN.test(sha256)) {
    return undefined
  }
  return { id: entry.id, name: entry.name, assetPath, sha256 }
}

/**
 * A ledger `formAsset.path` resolved inside the form folder. Only a plain file
 * directly under `assets/` is accepted: no absolute paths, no `..`, no nested
 * folders, no backslashes.
 */
export function resolveBuiltinHwpxFormPath(
  host: BuiltinHwpxFormsHost,
  assetPath: string,
): string {
  if (!assetPath.startsWith(FORM_ASSET_FOLDER)) {
    throw new Error(`builtin form path must stay under assets/: ${assetPath}`)
  }
  if (assetPath.includes('\\') || assetPath.includes('\0')) {
    throw new Error(`builtin form path must stay under assets/: ${assetPath}`)
  }
  const parts = assetPath.split('/')
  if (parts.length !== 2 || parts.some((part) => part === '..' || part === '.' || part === '')) {
    throw new Error(`builtin form path must stay under assets/: ${assetPath}`)
  }
  const fileName = basename(assetPath)
  if (!fileName.endsWith('.hwpx')) {
    throw new Error(`builtin form must be an .hwpx file: ${assetPath}`)
  }
  return join(builtinHwpxFormsDir(host), fileName)
}

export interface BuiltinHwpxFormFile {
  bytes: Uint8Array
  fileName: string
  title: string
}

/**
 * Read one builtin form and verify its bytes against the ledger sha256. A
 * missing file or a hash mismatch throws: the caller must not open or generate
 * a different document.
 */
export async function readBuiltinHwpxForm(
  host: BuiltinHwpxFormsHost,
  id: string,
  readBytes: (path: string) => Promise<Uint8Array> = readFile,
): Promise<BuiltinHwpxFormFile> {
  const entry = builtinHwpxFormEntry(id)
  if (!entry) throw new Error(`no builtin hwpx form for ${id}`)
  const path = resolveBuiltinHwpxFormPath(host, entry.assetPath)
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await readBytes(path))
  } catch {
    throw new Error(`builtin hwpx form file is missing: ${entry.assetPath}`)
  }
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (digest !== entry.sha256) {
    throw new Error(`builtin hwpx form hash mismatch: ${entry.assetPath}`)
  }
  return { bytes, fileName: basename(entry.assetPath), title: entry.name }
}
