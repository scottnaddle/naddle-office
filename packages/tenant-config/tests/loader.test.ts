import { describe, expect, it } from 'vitest'
import {
  PRODUCT_NAME_ENV,
  PRODUCT_NAME_KO_ENV,
  TENANT_CONFIG_PATH_ENV,
  TenantConfigError,
  defaultTenantConfigPath,
  loadTenantConfig,
  tenantProductNames,
  validateTenantConfig,
} from '../src/index'

const valid = {
  schemaVersion: 1 as const,
  tenantId: 'acme',
  product: { name: 'NaddleOffice', nameKo: '나들오피스' },
  secretRefs: { modelGatewayKey: 'env:ACME_MODEL_KEY' },
}

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn()
    return undefined
  } catch (error) {
    return error instanceof TenantConfigError ? error.code : 'not-tenant-config-error'
  }
}

describe('tenant config loader', () => {
  it('uses built-in defaults when no default file exists', () => {
    const config = loadTenantConfig({ path: undefined, exists: () => false, env: {} })
    expect(config).toEqual({ schemaVersion: 1 })
  })

  it('fails closed when an explicit path is missing', () => {
    expect(
      codeOf(() => loadTenantConfig({ path: '/missing/tenant.json', exists: () => false, env: {} })),
    ).toBe('not_found')
  })

  it('loads a valid file and preserves references', () => {
    const config = loadTenantConfig({
      path: '/tenant.json',
      exists: () => true,
      readFile: () => JSON.stringify(valid),
      env: {},
    })
    expect(config).toEqual(valid)
  })

  it('uses NADDLE_TENANT_CONFIG as an explicit path', () => {
    const config = loadTenantConfig({
      exists: (p) => p === '/env/tenant.json',
      readFile: () => JSON.stringify(valid),
      env: { [TENANT_CONFIG_PATH_ENV]: '/env/tenant.json' },
    })
    expect(config.tenantId).toBe('acme')
  })

  it('applies product-name environment overrides last', () => {
    const config = loadTenantConfig({
      path: '/tenant.json',
      exists: () => true,
      readFile: () => JSON.stringify(valid),
      env: { [PRODUCT_NAME_ENV]: 'AcmeOffice', [PRODUCT_NAME_KO_ENV]: '애크미오피스' },
    })
    expect(config.product).toEqual({ name: 'AcmeOffice', nameKo: '애크미오피스' })
  })

  it('allows product-name overrides without a file', () => {
    const config = loadTenantConfig({
      exists: () => false,
      env: { [PRODUCT_NAME_ENV]: 'AcmeOffice' },
    })
    expect(config.product).toEqual({ name: 'AcmeOffice' })
  })

  it('fails closed on invalid JSON', () => {
    expect(
      codeOf(() =>
        loadTenantConfig({ path: '/tenant.json', exists: () => true, readFile: () => '{', env: {} }),
      ),
    ).toBe('invalid_json')
  })

  it('fails closed on unreadable files', () => {
    expect(
      codeOf(() =>
        loadTenantConfig({
          path: '/tenant.json',
          exists: () => true,
          readFile: () => {
            throw new Error('EACCES')
          },
          env: {},
        }),
      ),
    ).toBe('read_failed')
  })

  it('fails closed on an invalid schema', () => {
    expect(
      codeOf(() =>
        loadTenantConfig({
          path: '/tenant.json',
          exists: () => true,
          readFile: () => JSON.stringify({ schemaVersion: 1, unknown: true }),
          env: {},
        }),
      ),
    ).toBe('invalid_config')
  })

  it('returns null product names when no product is configured', () => {
    expect(tenantProductNames({ schemaVersion: 1 })).toBeNull()
  })

  it('returns English and Korean product names', () => {
    expect(tenantProductNames(valid)).toEqual({ en: 'NaddleOffice', ko: '나들오피스' })
  })

  it('falls back Korean to English when only one name exists', () => {
    expect(tenantProductNames({ schemaVersion: 1, product: { name: 'AcmeOffice' } })).toEqual({
      en: 'AcmeOffice',
      ko: 'AcmeOffice',
    })
  })

  it('computes the default per-user path', () => {
    expect(defaultTenantConfigPath({ home: '/home/u', platform: 'linux', env: {} })).toBe(
      '/home/u/.config/naddle-office/tenant.json',
    )
  })
})

describe('tenant config schema', () => {
  it('rejects an empty product name', () => {
    expect(codeOf(() => validateTenantConfig({ schemaVersion: 1, product: { name: '  ' } }))).toBe(
      'invalid_product_name',
    )
  })

  it('rejects a raw secret value instead of a reference', () => {
    expect(
      codeOf(() =>
        validateTenantConfig({
          schemaVersion: 1,
          secretRefs: { modelGatewayKey: 'sk-raw-value' },
        }),
      ),
    ).toBe('invalid_secret_ref')
  })

  it('accepts supported reference forms', () => {
    const config = validateTenantConfig({
      schemaVersion: 1,
      secretRefs: {
        a: 'env:ACME_KEY',
        b: 'file:/run/secrets/acme',
        c: 'secret:acme-key',
        d: 'ref:tenant/acme-key',
      },
    })
    expect(Object.keys(config.secretRefs ?? {})).toHaveLength(4)
  })

  it('rejects unknown top-level keys', () => {
    expect(codeOf(() => validateTenantConfig({ schemaVersion: 1, extra: 1 }))).toBe('invalid_config')
  })
})
