/**
 * Provider-neutral integration boundaries.
 *
 * P0-2 defines the seams; it does not implement OIDC/SAML, knowledge ingestion
 * or a new model gateway. The default adapters are explicit "do nothing, keep
 * the app's current behavior" values, so selecting them cannot change auth,
 * network calls or existing provider rules.
 */
import type {
  TenantConfig,
  TenantIdentityKind,
  TenantKnowledgeKind,
  TenantModelKind,
} from './schema'

export type IntegrationErrorCode = 'unsupported_integration'

export class IntegrationError extends Error {
  readonly code: IntegrationErrorCode
  readonly field: string

  constructor(field: string, message: string) {
    super(message)
    this.name = 'IntegrationError'
    this.code = 'unsupported_integration'
    this.field = field
  }
}

/** No enterprise identity provider: the app keeps its current local account model. */
export interface IdentityProvider {
  readonly kind: 'none'
  readonly hasAccounts: false
}

/** Keep the app's existing AI provider selection (subscriptions, BYOK, local). */
export interface ModelGateway {
  readonly kind: 'current'
  readonly overridesModelSelection: false
}

/** No knowledge source is wired; nothing is read or indexed. */
export interface KnowledgeSource {
  readonly kind: 'none'
  readonly hasDocuments: false
}

export interface SelectedIntegrations {
  identity: IdentityProvider
  model: ModelGateway
  knowledge: KnowledgeSource
}

const NO_IDENTITY: IdentityProvider = Object.freeze({ kind: 'none', hasAccounts: false })
const CURRENT_MODEL: ModelGateway = Object.freeze({
  kind: 'current',
  overridesModelSelection: false,
})
const NO_KNOWLEDGE: KnowledgeSource = Object.freeze({ kind: 'none', hasDocuments: false })

function expectKind<T extends string>(field: string, value: unknown, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new IntegrationError(
      field,
      `${field} must be one of: ${allowed.join(', ')}; refusing to start with an unsupported adapter`,
    )
  }
  return value as T
}

/**
 * Resolve the adapters named by a tenant config. The schema already rejects
 * unknown values; this guards configs assembled in code or passed by a future
 * settings surface. Missing values keep today's behavior.
 */
export function selectIntegrations(config: TenantConfig): SelectedIntegrations {
  const chosen = config.integrations ?? {}
  expectKind<TenantIdentityKind>('identity', chosen.identity ?? 'none', ['none'])
  expectKind<TenantModelKind>('model', chosen.model ?? 'current', ['current'])
  expectKind<TenantKnowledgeKind>('knowledge', chosen.knowledge ?? 'none', ['none'])

  return { identity: NO_IDENTITY, model: CURRENT_MODEL, knowledge: NO_KNOWLEDGE }
}

export function integrationDefaults(): SelectedIntegrations {
  return selectIntegrations({ schemaVersion: 1 })
}
