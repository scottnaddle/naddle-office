/** The tenant key the pack store is filed under, and the store path it gives. */
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { LOCAL_TENANT_KEY, TENANT_KEY_PATTERN } from './constants'
import { TenantPackError } from './errors'

const WINDOWS_DEVICE = /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\..*)?$/i

/**
 * The store key for a tenant id from the main-process snapshot. No tenant id
 * means the local-only store (`_local`). A name Windows cannot hold fails
 * closed instead of falling back to another tenant.
 */
export function tenantKeyFromId(tenantId: string | undefined): string {
  if (tenantId === undefined || tenantId === '') return LOCAL_TENANT_KEY
  if (!TENANT_KEY_PATTERN.test(tenantId)) {
    throw new TenantPackError('invalid-tenant', `Tenant id "${tenantId}" cannot be stored`)
  }
  if (tenantId.endsWith('.') || tenantId.endsWith(' ') || WINDOWS_DEVICE.test(tenantId)) {
    throw new TenantPackError(
      'invalid-tenant',
      `Tenant id "${tenantId}" cannot be stored on Windows`,
    )
  }
  return tenantId
}

/** `<userData>/tenants/<tenantKey>/template-packs`, checked to stay inside `tenants`. */
export function tenantPackStoreDir(userDataDir: string, tenantId: string | undefined): string {
  const key = tenantKeyFromId(tenantId)
  const tenantsRoot = resolve(userDataDir, 'tenants')
  const store = resolve(tenantsRoot, key, 'template-packs')
  const rel = relative(tenantsRoot, store)
  if (!rel || rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) {
    throw new TenantPackError('invalid-tenant', 'The tenant pack folder is outside the tenant area')
  }
  return store
}
