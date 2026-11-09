# @naddle/tenant-config

Validated runtime tenant configuration for NaddleOffice.

> **Main/Node only.** `loader.ts` imports `node:fs` and must not be imported by renderer code. Renderer delivery is a separate preload/IPC slice (P0-2).

## File location

Default per-user file:

- Windows: `%APPDATA%\naddle-office\tenant.json`
- macOS/Linux: `~/.config/naddle-office/tenant.json`

Override the path with `NADDLE_TENANT_CONFIG=/absolute/path/tenant.json`.

Recommended permissions: `0600` on POSIX. The file contains references, not secret values, but it may reveal where secrets live.

## Precedence

1. Explicit `path` option (code) or `NADDLE_TENANT_CONFIG` (environment).
2. Default per-user file above.
3. Built-in default: `{ "schemaVersion": 1 }` (no product override).

Product display names can be overridden after the file is read:

- `NADDLE_PRODUCT_NAME` — English display name.
- `NADDLE_PRODUCT_NAME_KO` — Korean display name.

## Failure behavior

- **No default file** → built-in defaults; existing product name is unchanged.
- **Explicit path missing** → fail closed (`not_found`).
- **Unreadable file** → fail closed (`read_failed`).
- **Malformed JSON** → fail closed (`invalid_json`).
- **Invalid schema or unknown key** → fail closed (`invalid_config`).
- **Invalid product name** → fail closed (`invalid_product_name`).
- **Secret value instead of a reference** → fail closed (`invalid_secret_ref`).

Errors include the file path and are safe to show to an operator. They do not include file contents or secret values.

## Schema (v1)

```json
{
  "schemaVersion": 1,
  "tenantId": "example",
  "product": {
    "name": "NaddleOffice",
    "nameKo": "나들오피스"
  },
  "secretRefs": {
    "modelGatewayKey": "env:NADDLE_MODEL_GATEWAY_KEY"
  }
}
```

- `schemaVersion`: must be `1`.
- `tenantId`: optional lowercase slug (`a-z`, `0-9`, `.`, `_`, `-`; 1–64 chars).
- `product.name`: required when `product` is present, 1–80 printable characters.
- `product.nameKo`: optional; Korean display falls back to `name`.
- `secretRefs`: optional. Values must be `env:NAME`, `file:/path`, `secret:name`, or `ref:name`. Raw values are rejected; the loader never reads them.

Example file: [`tenant.example.json`](../../tenant.example.json).

## Usage (main process)

```ts
import { loadTenantConfig, tenantProductNames } from '@naddle/tenant-config'

const config = loadTenantConfig()
const names = tenantProductNames(config)
```

Catch `TenantConfigError` at startup and show its `code`, `message`, and `source` (path) to the operator. Do not fall back to another file when a configuration is present but invalid.

## Rollback

- Remove or rename the tenant file, or unset `NADDLE_TENANT_CONFIG` / product-name variables.
- No build or data migration is involved. Restart the app to return to the built-in defaults.

## Scope

P0-1 provides the schema, loader, validation, tests, example, and this document. It does **not** wire product names into renderers yet; that is the P0-2 preload/IPC slice. No upstream files are modified by this package.
