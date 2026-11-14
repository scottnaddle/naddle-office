/** License normalization and the tenant pack license policy. */
import {
  isRejectedTemplateOrigin,
  isTemplateLicenseAllowed,
  type TemplateManifestScope,
} from '../../ui/src/authoring/manifest'

/**
 * The v1 parser only knows `CC0-1.0`. A pack may write the bare `CC0`; rewrite
 * it before parsing, without changing the schema. Returns whether anything
 * changed so the preview can show `CC0 -> CC0-1.0`.
 */
export function normalizeLicenseText(value: unknown): { value: unknown; normalized: boolean } {
  if (typeof value !== 'string') return { value, normalized: false }
  if (value.trim().toUpperCase() === 'CC0') return { value: 'CC0-1.0', normalized: true }
  return { value, normalized: false }
}

export interface ManifestLicenseSource {
  license?: unknown
  author?: unknown
  name?: unknown
  description?: unknown
  entries?: unknown
}

/** Rewrite bare `CC0` at the manifest and entry levels, leaving everything else as written. */
export function normalizeManifestLicenses(raw: unknown): { value: unknown; normalized: boolean } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { value: raw, normalized: false }
  }
  const copy = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>
  let normalized = false
  const top = normalizeLicenseText(copy.license)
  copy.license = top.value
  normalized ||= top.normalized
  if (Array.isArray(copy.entries)) {
    for (const entry of copy.entries) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue
      const entryLicense = normalizeLicenseText((entry as Record<string, unknown>).license)
      ;(entry as Record<string, unknown>).license = entryLicense.value
      normalized ||= entryLicense.normalized
    }
  }
  return { value: copy, normalized }
}

/** A license allowed in a tenant pack; the v1 schema already rejects the rest. */
export function licenseAllowedInTenant(
  license: string,
  scope: TemplateManifestScope = 'tenant',
): boolean {
  return isTemplateLicenseAllowed(license, scope)
}

/** Whether a pack's names or author point at a vendor gallery or form marketplace. */
export function rejectedOriginProblem(
  values: ReadonlyArray<string | null | undefined>,
): string | undefined {
  return isRejectedTemplateOrigin(...values)
    ? 'vendor and marketplace templates cannot be imported as a tenant pack'
    : undefined
}
