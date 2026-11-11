/** Tenant config snapshot shared by the main process, preload and renderer. */
export const TENANT_GET_CHANNEL = 'tenant:get'
export const TENANT_GET_SYNC_CHANNEL = 'tenant:get-sync'

export interface TenantSnapshot {
  schemaVersion: 1
  tenantId?: string
  product?: { name: string; nameKo?: string }
  integrations: { identity: 'none'; model: 'current'; knowledge: 'none' }
}
