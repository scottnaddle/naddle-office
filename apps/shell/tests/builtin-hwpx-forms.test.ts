/**
 * The builtin HWPX resolver: the checkout folder in dev, the packaged resources
 * folder in the installed app, and a ledger sha256 check before bytes are used.
 */
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  BUILTIN_HWPX_FORMS_DIR_NAME,
  BUILTIN_HWPX_FORMS_REPO_DIR,
  builtinHwpxFormEntry,
  builtinHwpxFormsDir,
  readBuiltinHwpxForm,
  resolveBuiltinHwpxFormPath,
  type BuiltinHwpxFormsHost,
} from '../src/main/builtin-hwpx-forms'

const ROOT = resolve(import.meta.dirname, '../../..')
const DEV_ASSETS = join(ROOT, 'packages/ui/src/authoring/assets')

const devHost: BuiltinHwpxFormsHost = {
  isPackaged: false,
  getAppPath: () => join(ROOT, 'apps/shell'),
  resourcesPath: join(ROOT, 'does-not-exist'),
}

const temps: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ieum-builtin-forms-'))
  temps.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A fake installed app resources folder holding copies of the real assets. */
function packagedHost(ids: readonly string[]): BuiltinHwpxFormsHost {
  const resourcesPath = tempDir()
  const formsDir = join(resourcesPath, BUILTIN_HWPX_FORMS_DIR_NAME)
  mkdirSync(formsDir, { recursive: true })
  for (const id of ids) {
    copyFileSync(join(DEV_ASSETS, `${id}.hwpx`), join(formsDir, `${id}.hwpx`))
  }
  return { isPackaged: true, getAppPath: () => '', resourcesPath }
}

describe('builtin hwpx form resolution', () => {
  it('finds the checkout assets in a dev run and the resources folder when packaged', () => {
    expect(builtinHwpxFormsDir(devHost)).toBe(DEV_ASSETS)
    expect(builtinHwpxFormsDir(devHost).endsWith(BUILTIN_HWPX_FORMS_REPO_DIR)).toBe(true)

    const host = packagedHost(['draft'])
    expect(builtinHwpxFormsDir(host)).toBe(join(host.resourcesPath, BUILTIN_HWPX_FORMS_DIR_NAME))
  })

  it('accepts only a ledger asset path directly under assets/', () => {
    expect(resolveBuiltinHwpxFormPath(devHost, 'assets/draft.hwpx')).toBe(
      join(DEV_ASSETS, 'draft.hwpx'),
    )
    for (const bad of [
      '../draft.hwpx',
      '/etc/passwd',
      'assets/../draft.hwpx',
      'assets/nested/draft.hwpx',
      'assets/draft.exe',
      'assets\\draft.hwpx',
    ]) {
      expect(() => resolveBuiltinHwpxFormPath(devHost, bad), bad).toThrow()
    }
  })

  it('reads a dev form and returns its file name and title', async () => {
    const form = await readBuiltinHwpxForm(devHost, 'draft')
    expect(form.fileName).toBe('draft.hwpx')
    expect(form.title).toBe('기안서')
    expect([...form.bytes.subarray(0, 2)]).toEqual([0x50, 0x4b])
  })

  it('reads a form from the packaged resources folder', async () => {
    const host = packagedHost(['draft'])
    const form = await readBuiltinHwpxForm(host, 'draft')
    expect(form.fileName).toBe('draft.hwpx')
    expect(form.title).toBe('기안서')
  })

  it('fails on a missing file', async () => {
    const host = packagedHost([])
    await expect(readBuiltinHwpxForm(host, 'draft')).rejects.toThrow(/missing/)
  })

  it('fails when the bytes no longer match the ledger sha256', async () => {
    const host = packagedHost(['draft'])
    writeFileSync(join(host.resourcesPath, BUILTIN_HWPX_FORMS_DIR_NAME, 'draft.hwpx'), 'not hwpx')
    await expect(readBuiltinHwpxForm(host, 'draft')).rejects.toThrow(/hash mismatch/)
  })

  it('ignores ids without a shipped form', async () => {
    expect(builtinHwpxFormEntry('quote')).toBeUndefined()
    expect(builtinHwpxFormEntry('draft')?.sha256).toMatch(/^[0-9a-f]{64}$/)
    await expect(readBuiltinHwpxForm(devHost, 'quote')).rejects.toThrow(/no builtin/)
  })
})
