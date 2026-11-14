/**
 * The shell's tenant template pack bridge: import is a native dialog in main,
 * list and remove are the same calls the app menu uses. No tenant value crosses
 * this bridge; main files every pack under its own tenant snapshot.
 */
export const TENANT_PACKS_CHANNELS = {
  importZip: 'tenant-packs:import-zip',
  importFolder: 'tenant-packs:import-folder',
  prepareZip: 'tenant-packs:prepare-zip',
  prepareFolder: 'tenant-packs:prepare-folder',
  prepareGitHub: 'tenant-packs:prepare-github',
  confirmInstall: 'tenant-packs:confirm-install',
  cancelPrepare: 'tenant-packs:cancel-prepare',
  list: 'tenant-packs:list',
  remove: 'tenant-packs:remove',
  openForm: 'tenant-packs:open-form',
  listKeys: 'tenant-packs:list-keys',
  registerKey: 'tenant-packs:register-key',
  removeKey: 'tenant-packs:remove-key',
  revokeKey: 'tenant-packs:revoke-key',
} as const

export type TenantPackOriginView =
  | { kind: 'zip'; file: string }
  | { kind: 'folder'; folder: string }
  | { kind: 'github'; repo: string; ref: string; commit: string; path: string }

/** Signature state shown in the pane; no key bytes or PEM cross this type. */
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

export interface TenantPackTrustedKeyView {
  keyId: string
  label: string
  addedAt?: string
  notAfter?: string
}

export interface TenantPackRevokedKeyView {
  keyId: string
  revokedAt?: string
  reason?: string
}

export interface TenantPackEntrySummary {
  id: string
  kind: string
  name: string
  license: string
  author: string
  /** relative to the pack root; never an absolute path */
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

export interface TenantPackEntryPreviewView {
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

/** What a prepare call returns: no filesystem paths and no prepared folder. */
export interface TenantPackPreviewView {
  pack: {
    id: string
    name: string
    version: string
    publisher?: string
    description?: string
  }
  origin: TenantPackOriginView
  license: string
  licenseNormalized: boolean
  author: string
  entries: TenantPackEntryPreviewView[]
  problems: string[]
  requiresAttestation: boolean
  replacesExisting: boolean
  signature?: TenantPackSignatureView
}

export interface TenantPackOpenFormInput {
  packId: string
  entryId: string
  /** an optional fill instruction for the new tab's AI panel */
  text?: string
}

export interface TenantPackActionResult {
  ok: boolean
  canceled?: boolean
  reason?: string
  error?: string
  packs?: TenantPackSummary[]
  /** short-lived handle for a prepared preview; never a path */
  prepareToken?: string
  preview?: TenantPackPreviewView
  /** the new tab opened from a verified pack form */
  tabId?: string
  keys?: TenantPackTrustedKeyView[]
  revoked?: TenantPackRevokedKeyView[]
}

export interface TenantPacksApi {
  /** open a zip picker and import after the native preview confirms */
  importZip(): Promise<TenantPackActionResult>
  /** open a folder picker and import after the native preview confirms */
  importFolder(): Promise<TenantPackActionResult>
  /** pick a zip and return a preview for the settings pane */
  prepareZip(): Promise<TenantPackActionResult>
  /** pick a folder and return a preview for the settings pane */
  prepareFolder(): Promise<TenantPackActionResult>
  /** fetch a GitHub repository or folder and return a preview */
  prepareGitHub(address: string): Promise<TenantPackActionResult>
  /** install the prepared preview only when the rights are confirmed */
  confirmInstall(token: string, attested: boolean): Promise<TenantPackActionResult>
  /** drop a prepared preview and its temporary folders */
  cancelPrepare(token: string): Promise<TenantPackActionResult>
  /** the current tenant's packs, with their form hashes re-checked */
  list(): Promise<TenantPackActionResult>
  /** remove one pack of the current tenant */
  remove(id: string): Promise<TenantPackActionResult>
  /** the current tenant's registered signing keys and revocations */
  listKeys?(): Promise<TenantPackActionResult>
  /** pick a public-key PEM and register it after a key-id confirmation */
  registerKey?(): Promise<TenantPackActionResult>
  /** remove one registered key from the current tenant */
  removeKey?(keyId: string): Promise<TenantPackActionResult>
  /** revoke a signing key for the current tenant */
  revokeKey?(keyId: string): Promise<TenantPackActionResult>
}

/** The narrower bridge a document window gets: list and open a pack form. */
export interface TenantPackGalleryApi {
  list(): Promise<TenantPackActionResult>
  openForm(input: TenantPackOpenFormInput): Promise<TenantPackActionResult>
}
