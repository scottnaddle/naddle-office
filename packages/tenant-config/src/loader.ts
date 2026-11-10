/**
 * Runtime tenant configuration loader.
 *
 * MAIN/NODE ONLY. This file imports `node:fs` and must not be pulled into a
 * renderer bundle. Renderer delivery is a separate P0-2 slice (preload/IPC).
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  TenantConfigError,
  validateTenantConfig,
  type TenantConfig,
  type TenantProduct,
} from './schema'

export const TENANT_CONFIG_PATH_ENV = 'NADDLE_TENANT_CONFIG'
export const PRODUCT_NAME_ENV = 'NADDLE_PRODUCT_NAME'
export const PRODUCT_NAME_KO_ENV = 'NADDLE_PRODUCT_NAME_KO'

export interface TenantConfigLoaderOptions {
  /** Environment to read. Defaults to `process.env`. */
  env?: Record<string, string | undefined>
  /** Explicit config path. Overrides `NADDLE_TENANT_CONFIG`. */
  path?: string
  /** Injectable for tests. Defaults to `readFileSync(path, 'utf8')`. */
  readFile?: (path: string) => string
  /** Injectable for tests. Defaults to `existsSync`. */
  exists?: (path: string) => boolean
  /** Home directory for the default path. Defaults to `os.homedir()`. */
  home?: string
  /** Platform for the default path. Defaults to `process.platform`. */
  platform?: NodeJS.Platform
}

/**
 * Default per-user tenant file:
 * - Windows: `%APPDATA%\naddle-office\tenant.json`
 * - macOS/Linux: `~/.config/naddle-office/tenant.json`
 */
export function defaultTenantConfigPath(options: TenantConfigLoaderOptions = {}): string {
  const env = options.env ?? process.env
  const platform = options.platform ?? process.platform
  const home = options.home ?? homedir()
  if (platform === 'win32' && env.APPDATA) return join(env.APPDATA, 'naddle-office', 'tenant.json')
  return join(home, '.config', 'naddle-office', 'tenant.json')
}

/**
 * Precedence:
 * 1. explicit `path` option or `NADDLE_TENANT_CONFIG`
 * 2. default per-user file
 * 3. built-in default (no product override)
 *
 * A missing default file is fine. A missing explicit file, unreadable file,
 * invalid JSON, or invalid schema fails closed with a readable error.
 * Product-name environment variables are applied last.
 */
export function loadTenantConfig(options: TenantConfigLoaderOptions = {}): TenantConfig {
  const env = options.env ?? process.env
  const readFile = options.readFile ?? ((path: string) => readFileSync(path, 'utf8'))
  const exists = options.exists ?? existsSync
  const explicit = options.path?.trim() || env[TENANT_CONFIG_PATH_ENV]?.trim()

  const path = explicit || defaultTenantConfigPath({ env, home: options.home, platform: options.platform })
  let config: TenantConfig = { schemaVersion: 1 }

  if (exists(path)) {
    let raw: string
    try {
      raw = readFile(path)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new TenantConfigError('read_failed', `could not read tenant config: ${detail}`, path)
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new TenantConfigError('invalid_json', 'tenant config is not valid JSON', path)
    }
    config = validateTenantConfig(parsed, path)
  } else if (explicit) {
    throw new TenantConfigError('not_found', 'tenant config file does not exist', path)
  }

  return applyProductNameOverrides(config, env)
}

function applyProductNameOverrides(
  config: TenantConfig,
  env: Record<string, string | undefined>,
): TenantConfig {
  const name = env[PRODUCT_NAME_ENV]?.trim()
  const nameKo = env[PRODUCT_NAME_KO_ENV]?.trim()
  if (!name && !nameKo) return config

  const base = config.product
  const resolvedNameKo = nameKo || base?.nameKo
  const product: TenantProduct = {
    name: name || base?.name || 'NaddleOffice',
    ...(resolvedNameKo ? { nameKo: resolvedNameKo } : {}),
  }
  return validateTenantConfig({ ...config, product }, '<environment>')
}

/** Display names for consumers that can accept runtime product branding. */
export function tenantProductNames(
  config: TenantConfig = loadTenantConfig(),
): { en: string; ko: string } | null {
  if (!config.product) return null
  return { en: config.product.name, ko: config.product.nameKo ?? config.product.name }
}
