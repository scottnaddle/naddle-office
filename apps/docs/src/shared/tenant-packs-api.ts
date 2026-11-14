/**
 * The narrow document-window view of tenant template packs: list the current
 * tenant's packs and open one verified form in a new tab. Import and remove
 * stay in the shell's settings window; no tenant value crosses this bridge.
 */
export const TENANT_PACKS_GALLERY_CHANNELS = {
  list: 'tenant-packs:list',
  openForm: 'tenant-packs:open-form',
} as const

export type TenantPackOriginView =
  | { kind: 'zip'; file: string }
  | { kind: 'folder'; folder: string }
  | { kind: 'github'; repo: string; ref: string; commit: string; path: string }

export type TenantPackSignatureStatusView =
  | 'unsigned'
  | 'valid'
  | 'malformed'
  | 'bad-signature'
  | 'files-mismatch'
  | 'unknown-key'
  | 'revoked-key'
  | 'expired-key'
  | 'pack-mismatch'
  | 'missing-signature'
  | 'trust-store-unreadable'

export interface TenantPackSignatureView {
  status: TenantPackSignatureStatusView
  keyId?: string
  keyLabel?: string
  signedAt?: string
  trustSource?: 'builtin' | 'tenant'
}

export interface TenantPackEntrySummary {
  id: string
  kind: string
  name: string
  license: string
  author: string
  skillPath: string
  formAsset?: string
  sha256?: string
}

export interface TenantPackSummary {
  id: string
  name: string
  version: string
  publisher?: string
  license: string
  author: string
  origin: TenantPackOriginView
  installedAt: string
  formCount: number
  verified: boolean
  problems: string[]
  entries: TenantPackEntrySummary[]
  signature?: TenantPackSignatureView
  signatureStatus?: TenantPackSignatureStatusView
}

export interface TenantPackOpenFormInput {
  packId: string
  entryId: string
  text?: string
}

export interface TenantPackActionResult {
  ok: boolean
  canceled?: boolean
  reason?: string
  error?: string
  packs?: TenantPackSummary[]
  tabId?: string
}

export interface TenantPackGalleryApi {
  list(): Promise<TenantPackActionResult>
  openForm(input: TenantPackOpenFormInput): Promise<TenantPackActionResult>
}
