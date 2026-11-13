/**
 * The shell's tenant template pack bridge: import is a native dialog in main,
 * list and remove are the same calls the app menu uses. No tenant value crosses
 * this bridge; main files every pack under its own tenant snapshot.
 */
export const TENANT_PACKS_CHANNELS = {
  importZip: 'tenant-packs:import-zip',
  importFolder: 'tenant-packs:import-folder',
  list: 'tenant-packs:list',
  remove: 'tenant-packs:remove',
} as const

export type TenantPackOriginView =
  | { kind: 'zip'; file: string }
  | { kind: 'folder'; folder: string }
  | { kind: 'github'; repo: string; ref: string; commit: string; path: string }

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
}

export interface TenantPackActionResult {
  ok: boolean
  canceled?: boolean
  reason?: string
  error?: string
  packs?: TenantPackSummary[]
}

export interface TenantPacksApi {
  /** open a zip picker and import after the native preview confirms */
  importZip(): Promise<TenantPackActionResult>
  /** open a folder picker and import after the native preview confirms */
  importFolder(): Promise<TenantPackActionResult>
  /** the current tenant's packs, with their form hashes re-checked */
  list(): Promise<TenantPackActionResult>
  /** remove one pack of the current tenant */
  remove(id: string): Promise<TenantPackActionResult>
}
