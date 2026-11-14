/**
 * The ten builtin HWPX office forms ship once through `extraResources`
 * (`packages/ui/src/authoring/assets` -> `<resources>/builtin-hwpx-forms`).
 * These helpers let both the pack hooks and a unit test assert that every form
 * is present, without running electron-builder.
 *
 * The source folder holds the files directly; the packaged folder holds them
 * under `builtin-hwpx-forms/`. The caller passes whichever folder to inspect.
 */

const { existsSync } = require('node:fs')
const { join } = require('node:path')

const BUILTIN_HWPX_FORMS_DIR_NAME = 'builtin-hwpx-forms'

/** The S3 office forms, in ledger order (packages/ui/src/authoring/builtin-templates.json). */
const BUILTIN_HWPX_FORM_IDS = [
  'draft',
  'purchase-request',
  'trip-request',
  'trip-report',
  'leave-request',
  'corp-card',
  'cooperation',
  'statement',
  'purchase-order',
  'official-letter',
]

function missingBuiltinHwpxForms(formsDir, exists = existsSync) {
  return BUILTIN_HWPX_FORM_IDS.filter((id) => !exists(join(formsDir, `${id}.hwpx`)))
}

function assertBuiltinHwpxForms(formsDir, exists = existsSync) {
  const missing = missingBuiltinHwpxForms(formsDir, exists)
  if (missing.length > 0) {
    throw new Error(
      `builtin hwpx forms missing from ${formsDir}: ${missing.join(', ')} ` +
        '(the packaged app would open no form)',
    )
  }
}

module.exports = {
  BUILTIN_HWPX_FORMS_DIR_NAME,
  BUILTIN_HWPX_FORM_IDS,
  missingBuiltinHwpxForms,
  assertBuiltinHwpxForms,
}
