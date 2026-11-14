/** Fixed rules of a tenant template pack. Shared by the validator, scanner and store. */
import { MAX_USER_SKILL_BYTES, MAX_USER_SKILL_FILES } from '@genoffice/ai-provider'

/** The manifest file at the pack root. */
export const PACK_MANIFEST_FILE = 'manifest.json'

/** The detached signature sidecar at the pack root. */
export const PACK_SIGNATURE_FILE = 'manifest.sig.json'

/** The tenant store's index file. */
export const PACK_INDEX_FILE = 'index.json'

/** The tenant's registered signing keys, beside the pack folders. */
export const PACK_TRUSTED_KEYS_FILE = 'trusted-keys.json'

/** The tenant's locally revoked signing keys, beside the pack folders. */
export const PACK_REVOKED_KEYS_FILE = 'revoked-keys.json'

/** The only signature sidecar format this version reads. */
export const PACK_SIGNATURE_FORMAT = 'naddle-pack-signature'

/** The only signed payload format this version reads. */
export const PACK_SIGNATURE_PAYLOAD_FORMAT = 'naddle-pack-signature-payload'

/** The only signature algorithm this version accepts. */
export const PACK_SIGNATURE_ALG = 'ed25519'

/** An Ed25519 key id: the algorithm plus the first 32 hex chars of the SPKI hash. */
export const PACK_KEY_ID_PATTERN = /^ed25519:[0-9a-f]{32}$/

/** The largest sidecar read; a pack may hold many files, so leave room. */
export const PACK_SIGNATURE_MAX_BYTES = 256 * 1024

/** The key used when no tenant is configured. `_` never starts a tenantId. */
export const LOCAL_TENANT_KEY = '_local'

/** Tenant ids the store may use; `_local` is added separately. */
export const TENANT_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/

/** Pack ids, the same rule as a manifest entry id. */
export const PACK_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/

/** Entry versions (`x.y.z`). */
export const PACK_VERSION_PATTERN = /^\d+\.\d+\.\d+$/

/** Folder limits for one pack (same shape as the skills folder limits). */
export const PACK_FOLDER_LIMITS = {
  files: MAX_USER_SKILL_FILES,
  bytes: MAX_USER_SKILL_BYTES,
} as const

/** Form files a tenant pack may ship. */
export const FORM_EXTENSIONS: ReadonlySet<string> = new Set(['.hwpx', '.docx', '.xlsx', '.pptx'])

/**
 * Extensions that are never taken, even when they look like forms. Macro
 * enabled and legacy Office files are rejected here; `.hwp` is rejected
 * because a binary HWP file cannot be checked for macros.
 */
export const REJECTED_FORM_EXTENSIONS: ReadonlySet<string> = new Set([
  '.docm',
  '.xlsm',
  '.pptm',
  '.dotm',
  '.xltm',
  '.potm',
  '.xlam',
  '.ppam',
  '.xlsb',
  '.doc',
  '.xls',
  '.ppt',
  '.hwp',
  '.svg',
  '.html',
  '.htm',
])

/** Entry name parts that mark an embedded program or macro. */
export const MACRO_ENTRY_NAMES: ReadonlySet<string> = new Set(['vbaproject.bin', 'vbadata.xml'])

/** Entry folders that carry ActiveX controls or custom UI. */
export const MACRO_ENTRY_FOLDERS: ReadonlySet<string> = new Set(['activex', 'customui'])

/** Script extensions refused inside a form archive (besides the skill script rule). */
export const ARCHIVE_SCRIPT_EXTENSIONS: ReadonlySet<string> = new Set([
  '.js',
  '.jse',
  '.vbs',
  '.vbe',
  '.wsf',
  '.wsh',
  '.ps1',
  '.bat',
  '.cmd',
  '.exe',
])

/** Zip limits for opening a form file only to inspect its entries. */
export const FORM_ZIP_LIMITS = {
  maxParts: 5_000,
  maxPartBytes: 64 * 1024 * 1024,
  maxTotalBytes: 256 * 1024 * 1024,
} as const

/** The largest form file inspected. */
export const MAX_FORM_BYTES = 64 * 1024 * 1024

/** The temporary folder used when the caller names none. */
export const PACK_TEMP_FOLDER = 'naddle-tenant-packs'
