import { afterEach, describe, expect, it } from 'vitest'
import { productName, setTenantProductNames } from '@genoffice/i18n'
import type { TenantConfig } from '@naddle/tenant-config'
import { TenantConfigError } from '@naddle/tenant-config'
import {
  createTenantSnapshot,
  describeTenantError,
  initTenant,
  registerTenantIpc,
} from '../src/main/tenant'
import { TENANT_GET_CHANNEL, TENANT_GET_SYNC_CHANNEL } from '../src/shared/tenant-api'

afterEach(() => setTenantProductNames(null))

const full: TenantConfig = {
  schemaVersion: 1,
  tenantId: 'acme',
  product: { name: 'AcmeOffice', nameKo: '애크미오피스' },
  integrations: { identity: 'none', model: 'current', knowledge: 'none' },
  secretRefs: { modelGatewayKey: 'env:ACME_MODEL_KEY' },
}

describe('tenant startup', () => {
  it('builds a snapshot without secret references or values', () => {
    const snapshot = createTenantSnapshot(full)
    expect(snapshot).toEqual({
      schemaVersion: 1,
      tenantId: 'acme',
      product: { name: 'AcmeOffice', nameKo: '애크미오피스' },
      integrations: { identity: 'none', model: 'current', knowledge: 'none' },
    })
    const text = JSON.stringify(snapshot)
    expect(text).not.toContain('secretRefs')
    expect(text).not.toContain('modelGatewayKey')
    expect(text).not.toContain('ACME_MODEL_KEY')
  })

  it('keeps current behavior when the config has no product or integrations', () => {
    expect(initTenant(() => ({ schemaVersion: 1 }))).toEqual({
      schemaVersion: 1,
      integrations: { identity: 'none', model: 'current', knowledge: 'none' },
    })
  })

  it('applies the tenant display name without changing the install name', () => {
    initTenant(() => full)
    expect(productName('en')).toBe('AcmeOffice')
    expect(productName('ko')).toBe('애크미오피스')
    initTenant(() => ({ schemaVersion: 1 }))
    expect(productName('en')).toBe('NaddleOffice')
  })

  it('propagates a fail-closed config error with a readable description', () => {
    const error = new TenantConfigError('invalid_config', 'unknown key', '/tmp/tenant.json')
    expect(() =>
      initTenant(() => {
        throw error
      }),
    ).toThrow(error)
    expect(describeTenantError(error)).toBe('invalid_config: unknown key (/tmp/tenant.json)')
    expect(describeTenantError(new Error('boom'))).toBe('boom')
  })
})

describe('renderer delivery', () => {
  it('serves the same redacted snapshot asynchronously and synchronously', async () => {
    const handlers = new Map<string, () => unknown>()
    const sync = new Map<string, (event: { returnValue?: unknown }) => void>()
    const ipc = {
      handle(channel: string, listener: () => unknown) {
        handlers.set(channel, listener)
      },
      on(channel: string, listener: (event: { returnValue?: unknown }) => void) {
        sync.set(channel, listener)
      },
    }
    const snapshot = createTenantSnapshot(full)
    registerTenantIpc(ipc, snapshot)

    expect(handlers.get(TENANT_GET_CHANNEL)?.()).toEqual(snapshot)
    const event: { returnValue?: unknown } = {}
    sync.get(TENANT_GET_SYNC_CHANNEL)?.(event)
    expect(event.returnValue).toEqual(snapshot)
    expect(JSON.stringify(event.returnValue)).not.toContain('ACME_MODEL_KEY')
  })
})
