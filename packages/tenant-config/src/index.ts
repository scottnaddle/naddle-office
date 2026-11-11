export {
  TENANT_SCHEMA_VERSION,
  TenantConfigError,
  validateTenantConfig,
  type TenantConfig,
  type TenantConfigErrorCode,
  type TenantIdentityKind,
  type TenantIntegrations,
  type TenantKnowledgeKind,
  type TenantModelKind,
  type TenantProduct,
} from './schema'
export {
  TENANT_CONFIG_PATH_ENV,
  PRODUCT_NAME_ENV,
  PRODUCT_NAME_KO_ENV,
  defaultTenantConfigPath,
  loadTenantConfig,
  tenantProductNames,
  type TenantConfigLoaderOptions,
} from './loader'

export {
  IntegrationError,
  integrationDefaults,
  selectIntegrations,
  type IdentityProvider,
  type IntegrationErrorCode,
  type KnowledgeSource,
  type ModelGateway,
  type SelectedIntegrations,
} from './integrations'
