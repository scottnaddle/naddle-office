/**
 * Tenant configuration schema for NaddleOffice.
 *
 * This module is intentionally dependency-free and Node-agnostic. The loader
 * (`loader.ts`) is main/Node-only; do not import the loader from renderer code.
 */

export const TENANT_SCHEMA_VERSION = 1 as const

export interface TenantProduct {
  /** English display name. */
  name: string
  /** Korean display name; falls back to `name` when omitted. */
  nameKo?: string
}

export interface TenantConfig {
  schemaVersion: typeof TENANT_SCHEMA_VERSION
  tenantId?: string
  product?: TenantProduct
  /**
   * References only. Values must use one of:
   * `env:NAME`, `file:/path`, `secret:name`, `ref:name`.
   * Raw secret values are rejected.
   */
  secretRefs?: Record<string, string>
}

export type TenantConfigErrorCode =
  | 'read_failed'
  | 'not_found'
  | 'invalid_json'
  | 'invalid_config'
  | 'invalid_product_name'
  | 'invalid_secret_ref'

export class TenantConfigError extends Error {
  readonly code: TenantConfigErrorCode
  readonly source: string | undefined

  constructor(code: TenantConfigErrorCode, message: string, source?: string) {
    super(message)
    this.name = 'TenantConfigError'
    this.code = code
    this.source = source
  }
}

const TOP_LEVEL_KEYS = new Set(['schemaVersion', 'tenantId', 'product', 'secretRefs'])
const PRODUCT_KEYS = new Set(['name', 'nameKo'])
const TENANT_ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/
const SECRET_KEY_RE = /^[a-z][a-z0-9._-]{0,63}$/i
const SECRET_REF_RE = /^(env|file|secret|ref):[^\s]+$/
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fail(code: TenantConfigErrorCode, message: string, source: string): never {
  throw new TenantConfigError(code, message, source)
}

function checkKeys(value: Record<string, unknown>, allowed: Set<string>, label: string, source: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail('invalid_config', `${label} has unknown key "${key}"`, source)
  }
}

function displayName(value: unknown, field: string, source: string): string {
  if (typeof value !== 'string') fail('invalid_product_name', `${field} must be a string`, source)
  const name = value.trim()
  if (!name || name.length > 80 || CONTROL_CHARS_RE.test(name)) {
    fail('invalid_product_name', `${field} must be 1-80 printable characters`, source)
  }
  return name
}

/** Validate a JSON value and return a normalized copy. */
export function validateTenantConfig(value: unknown, source = '<memory>'): TenantConfig {
  if (!isRecord(value)) fail('invalid_config', 'tenant config must be a JSON object', source)
  checkKeys(value, TOP_LEVEL_KEYS, 'tenant config', source)

  if (value.schemaVersion !== TENANT_SCHEMA_VERSION) {
    fail('invalid_config', `schemaVersion must be ${TENANT_SCHEMA_VERSION}`, source)
  }

  let tenantId: string | undefined
  if (value.tenantId !== undefined) {
    if (typeof value.tenantId !== 'string' || !TENANT_ID_RE.test(value.tenantId)) {
      fail('invalid_config', 'tenantId must be a lowercase slug (1-64 chars: a-z 0-9 . _ -)', source)
    }
    tenantId = value.tenantId
  }

  let product: TenantProduct | undefined
  if (value.product !== undefined) {
    if (!isRecord(value.product)) fail('invalid_config', 'product must be an object', source)
    checkKeys(value.product, PRODUCT_KEYS, 'product', source)
    if (value.product.name === undefined) fail('invalid_product_name', 'product.name is required', source)
    const name = displayName(value.product.name, 'product.name', source)
    const nameKo =
      value.product.nameKo === undefined
        ? undefined
        : displayName(value.product.nameKo, 'product.nameKo', source)
    product = { name, ...(nameKo ? { nameKo } : {}) }
  }

  let secretRefs: Record<string, string> | undefined
  if (value.secretRefs !== undefined) {
    if (!isRecord(value.secretRefs)) fail('invalid_config', 'secretRefs must be an object', source)
    const refs: Record<string, string> = {}
    for (const [key, ref] of Object.entries(value.secretRefs)) {
      if (!SECRET_KEY_RE.test(key)) fail('invalid_secret_ref', `secretRefs key "${key}" is not a valid name`, source)
      if (typeof ref !== 'string' || ref.length > 512 || !SECRET_REF_RE.test(ref)) {
        fail(
          'invalid_secret_ref',
          `secretRefs.${key} must be a reference (env:, file:, secret:, ref:), not a value`,
          source,
        )
      }
      refs[key] = ref
    }
    secretRefs = refs
  }

  return {
    schemaVersion: TENANT_SCHEMA_VERSION,
    ...(tenantId ? { tenantId } : {}),
    ...(product ? { product } : {}),
    ...(secretRefs ? { secretRefs } : {}),
  }
}
