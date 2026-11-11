import { describe, expect, it } from 'vitest'
import {
  IntegrationError,
  integrationDefaults,
  selectIntegrations,
  validateTenantConfig,
  type TenantConfig,
} from '../src/index'

describe('tenant integrations schema', () => {
  it('accepts the supported adapter kinds', () => {
    const config = validateTenantConfig({
      schemaVersion: 1,
      integrations: { identity: 'none', model: 'current', knowledge: 'none' },
    })
    expect(config.integrations).toEqual({ identity: 'none', model: 'current', knowledge: 'none' })
  })

  it('fails closed on an unknown adapter kind', () => {
    expect(() =>
      validateTenantConfig({ schemaVersion: 1, integrations: { identity: 'oidc' } }),
    ).toThrow(expect.objectContaining({ code: 'invalid_integration' }))
  })

  it('rejects unknown integration keys', () => {
    expect(() => validateTenantConfig({ schemaVersion: 1, integrations: { sso: 'none' } })).toThrow(
      expect.objectContaining({ code: 'invalid_config' }),
    )
  })
})

describe('selectIntegrations', () => {
  it('keeps current behavior when integrations are absent', () => {
    expect(integrationDefaults()).toEqual({
      identity: { kind: 'none', hasAccounts: false },
      model: { kind: 'current', overridesModelSelection: false },
      knowledge: { kind: 'none', hasDocuments: false },
    })
  })

  it('selects the declared adapters', () => {
    const config: TenantConfig = {
      schemaVersion: 1,
      integrations: { identity: 'none', model: 'current', knowledge: 'none' },
    }
    expect(selectIntegrations(config)).toEqual(integrationDefaults())
  })

  it('fails closed when code passes an unsupported adapter', () => {
    const config = {
      schemaVersion: 1,
      integrations: { identity: 'oidc' },
    } as unknown as TenantConfig
    expect(() => selectIntegrations(config)).toThrow(IntegrationError)
    try {
      selectIntegrations(config)
    } catch (error) {
      expect(error).toMatchObject({ code: 'unsupported_integration', field: 'identity' })
    }
  })
})
