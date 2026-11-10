export {
  TENANT_SCHEMA_VERSION,
  TenantConfigError,
  validateTenantConfig,
  type TenantConfig,
  type TenantConfigErrorCode,
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
