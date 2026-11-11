/**
 * P0-2 tenant startup: load the main-owned tenant file once, expose a redacted
 * snapshot to the renderer, and inject the display name.
 *
 * Fail-closed: the caller decides how to show the error and stop. No secret
 * reference or value is part of the snapshot.
 */
import { setTenantProductNames } from '@genoffice/i18n'
import {
  loadTenantConfig,
  selectIntegrations,
  TenantConfigError,
  type TenantConfig,
} from '@naddle/tenant-config'
import {
  TENANT_GET_CHANNEL,
  TENANT_GET_SYNC_CHANNEL,
  type TenantSnapshot,
} from '../shared/tenant-api'

export function createTenantSnapshot(config: TenantConfig): TenantSnapshot {
  const integrations = selectIntegrations(config)
  return {
    schemaVersion: 1,
    ...(config.tenantId ? { tenantId: config.tenantId } : {}),
    ...(config.product
      ? {
          product: {
            name: config.product.name,
            ...(config.product.nameKo ? { nameKo: config.product.nameKo } : {}),
          },
        }
      : {}),
    integrations: {
      identity: integrations.identity.kind,
      model: integrations.model.kind,
      knowledge: integrations.knowledge.kind,
    },
  }
}

/** Load the config and apply its display name; throws a TenantConfigError when invalid. */
export function initTenant(load: () => TenantConfig = () => loadTenantConfig()): TenantSnapshot {
  const snapshot = createTenantSnapshot(load())
  setTenantProductNames(snapshot.product ?? null)
  return snapshot
}

export function describeTenantError(error: unknown): string {
  if (error instanceof TenantConfigError) {
    return `${error.code}: ${error.message}${error.source ? ` (${error.source})` : ''}`
  }
  return error instanceof Error ? error.message : String(error)
}

interface TenantIpc {
  handle(channel: string, listener: () => unknown): void
  on(channel: string, listener: (event: { returnValue?: unknown }) => void): void
}

/** Renderer delivery: async getter plus a synchronous read for the first paint. */
export function registerTenantIpc(ipc: TenantIpc, snapshot: TenantSnapshot): void {
  ipc.handle(TENANT_GET_CHANNEL, () => snapshot)
  ipc.on(TENANT_GET_SYNC_CHANNEL, (event) => {
    event.returnValue = snapshot
  })
}
