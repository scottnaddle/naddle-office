/**
 * The `builtin-forms:open` channel: read one shipped HWPX form after the
 * ledger sha256 check and open it as a new untitled tab. The renderer sends
 * only a ledger id, so no path or document bytes cross the bridge.
 */
import { ipcMain } from 'electron'
import { BUILTIN_FORMS_CHANNELS, type BuiltinFormActionResult } from '../shared/builtin-forms-api'
import {
  builtinHwpxFormEntry,
  readBuiltinHwpxForm,
  type BuiltinHwpxFormsHost,
} from './builtin-hwpx-forms'

export interface BuiltinFormCopyInput {
  bytes: Uint8Array
  fileName: string
  title: string
  text?: string | undefined
}

export interface BuiltinFormCopyResult {
  ok: boolean
  tabId?: string | undefined
  reason?: string | undefined
}

export interface BuiltinFormsIpcDeps {
  host: BuiltinHwpxFormsHost
  /** copy verified form bytes into a new untitled tab; no skill is registered */
  openCopy(input: BuiltinFormCopyInput): Promise<BuiltinFormCopyResult>
}

export async function openBuiltinForm(
  deps: BuiltinFormsIpcDeps,
  input: unknown,
): Promise<BuiltinFormActionResult> {
  if (typeof input !== 'object' || input === null) return { ok: false, reason: 'invalid' }
  const record = input as Record<string, unknown>
  const entryId = record.entryId
  const text = record.text
  if (typeof entryId !== 'string' || entryId === '') return { ok: false, reason: 'invalid' }
  if (text !== undefined && typeof text !== 'string') return { ok: false, reason: 'invalid' }
  if (!builtinHwpxFormEntry(entryId)) return { ok: false, reason: 'unknown-form' }
  try {
    const form = await readBuiltinHwpxForm(deps.host, entryId)
    const opened = await deps.openCopy({
      bytes: form.bytes,
      fileName: form.fileName,
      title: form.title,
      ...(text !== undefined ? { text } : {}),
    })
    if (!opened.ok) return { ok: false, reason: opened.reason ?? 'failed' }
    return { ok: true, ...(opened.tabId ? { tabId: opened.tabId } : {}) }
  } catch {
    return { ok: false, reason: 'missing-or-changed' }
  }
}

export function registerBuiltinFormsIpc(deps: BuiltinFormsIpcDeps): void {
  ipcMain.handle(BUILTIN_FORMS_CHANNELS.open, async (_event, ...args: unknown[]) =>
    openBuiltinForm(deps, args[0]),
  )
}
