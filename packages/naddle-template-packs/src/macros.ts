/**
 * Macro and embedded-program scanning for form files.
 *
 * A form is opened only as a zip and its entry names are inspected. Nothing is
 * extracted to disk and nothing from the archive is executed. Any sign of a
 * macro, ActiveX control, custom UI, OLE embedding or external relationship is
 * a hard failure.
 */
import { extname } from 'node:path'
import { assertZipInflatesWithinLimits } from '@genoffice/zip-gate'
import JSZip from 'jszip'
import {
  ARCHIVE_SCRIPT_EXTENSIONS,
  FORM_EXTENSIONS,
  FORM_ZIP_LIMITS,
  MACRO_ENTRY_FOLDERS,
  MACRO_ENTRY_NAMES,
  MAX_FORM_BYTES,
  REJECTED_FORM_EXTENSIONS,
} from './constants'

/** A file whose bytes are checked. */
export interface ScannableFile {
  rel: string
  path: string
  size: number
  bytes: Uint8Array
}

const EXTERNAL_RELATIONSHIP = /TargetMode\s*=\s*["']External["']/i
const MACRO_CONTENT_TYPE = /macroenabled|vbaproject/i

function extensionOf(rel: string): string {
  return extname(rel).toLowerCase()
}

/** Why a form file cannot be taken, before its bytes are read. */
export function formExtensionProblem(rel: string): string | undefined {
  const ext = extensionOf(rel)
  if (REJECTED_FORM_EXTENSIONS.has(ext)) {
    return `macro enabled, legacy or unreadable form files are not allowed: ${rel}`
  }
  if (!FORM_EXTENSIONS.has(ext)) {
    return `form files must be .hwpx, .docx, .xlsx or .pptx: ${rel}`
  }
  return undefined
}

async function entryText(zip: JSZip, name: string): Promise<string | undefined> {
  const entry = zip.file(name)
  if (!entry) return undefined
  return entry.async('string')
}

function isExternalRelationship(name: string): boolean {
  return name.toLowerCase().endsWith('.rels')
}

/** Problems found in one form archive. Empty when it carries no macro or script. */
export async function scanFormArchive(bytes: Uint8Array, rel: string): Promise<string[]> {
  const problems: string[] = []
  const ext = extensionOf(rel)
  if (REJECTED_FORM_EXTENSIONS.has(ext)) {
    problems.push(`macro enabled, legacy or unreadable form files are not allowed: ${rel}`)
    return problems
  }
  if (!FORM_EXTENSIONS.has(ext)) {
    problems.push(`form files must be .hwpx, .docx, .xlsx or .pptx: ${rel}`)
    return problems
  }
  if (bytes.byteLength > MAX_FORM_BYTES) {
    problems.push(`the form is too large to inspect: ${rel}`)
    return problems
  }

  let zip: JSZip
  try {
    await assertZipInflatesWithinLimits(bytes, FORM_ZIP_LIMITS)
    zip = await JSZip.loadAsync(bytes)
  } catch {
    problems.push(`the form is not a readable ${ext} archive: ${rel}`)
    return problems
  }

  const entries = Object.values(zip.files)
  for (const entry of entries) {
    const name = entry.name
    const lower = name.toLowerCase()
    const parts = lower.split('/')
    const base = parts[parts.length - 1] ?? ''

    if (parts[0] === 'scripts' || parts.includes('scripts')) {
      problems.push(`a form may not carry scripts: ${rel} (${name})`)
    }
    if (MACRO_ENTRY_NAMES.has(base)) {
      problems.push(`a form may not carry macros: ${rel} (${name})`)
    }
    if (parts.some((part) => MACRO_ENTRY_FOLDERS.has(part))) {
      problems.push(`a form may not carry ActiveX or custom UI: ${rel} (${name})`)
    }
    if (parts.includes('embeddings') && /\.(?:bin|ole)$/.test(lower)) {
      problems.push(`a form may not carry OLE embeddings: ${rel} (${name})`)
    }
    if (ARCHIVE_SCRIPT_EXTENSIONS.has(extname(base))) {
      problems.push(`a form may not carry scripts: ${rel} (${name})`)
    }
  }

  const contentTypes = entries.find((entry) => entry.name.toLowerCase() === '[content_types].xml')
  if (contentTypes) {
    const text = await entryText(zip, contentTypes.name).catch(() => undefined)
    if (text && MACRO_CONTENT_TYPE.test(text)) {
      problems.push(`a form may not declare a macro: ${rel}`)
    }
  }

  for (const entry of entries) {
    if (!isExternalRelationship(entry.name) || entry.dir) continue
    const text = await entryText(zip, entry.name).catch(() => undefined)
    if (text && EXTERNAL_RELATIONSHIP.test(text)) {
      problems.push(`a form may not reference an external target: ${rel} (${entry.name})`)
    }
  }

  return [...new Set(problems)]
}

/** Scan every file that looks like a form. Text, image and license files pass. */
export async function scanFilesForMacros(files: readonly ScannableFile[]): Promise<string[]> {
  const problems: string[] = []
  for (const file of files) {
    const ext = extensionOf(file.rel)
    if (!FORM_EXTENSIONS.has(ext) && !REJECTED_FORM_EXTENSIONS.has(ext)) continue
    if (REJECTED_FORM_EXTENSIONS.has(ext)) {
      problems.push(`macro enabled, legacy or unreadable form files are not allowed: ${file.rel}`)
      continue
    }
    problems.push(...(await scanFormArchive(file.bytes, file.rel)))
  }
  return [...new Set(problems)]
}
