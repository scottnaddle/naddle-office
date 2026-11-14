/**
 * The builtin office form bridge: the docs authoring gallery opens one of the
 * ten shipped HWPX forms as a new untitled tab. Only the ledger id (and an
 * optional fill instruction) crosses; main resolves and verifies the file.
 */
export const BUILTIN_FORMS_CHANNELS = {
  open: 'builtin-forms:open',
} as const

export interface BuiltinFormOpenInput {
  /** a builtin document-brief id that ships a form file, e.g. `draft` */
  entryId: string
  /** an optional fill instruction for the new tab's AI panel */
  text?: string
}

export interface BuiltinFormActionResult {
  ok: boolean
  reason?: string
  /** the new tab opened from a verified builtin form */
  tabId?: string
}

export interface BuiltinFormGalleryApi {
  open(input: BuiltinFormOpenInput): Promise<BuiltinFormActionResult>
}
