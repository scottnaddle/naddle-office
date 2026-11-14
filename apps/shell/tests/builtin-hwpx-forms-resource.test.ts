/**
 * The ten builtin HWPX forms must be in the installer: one extraResources
 * entry copies the ledger's assets folder, the pack hooks refuse a checkout or
 * an app bundle that lost one, and the file check works without electron-builder.
 */
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const SHELL = resolve(import.meta.dirname, '..')
const ROOT = resolve(SHELL, '../..')
const ASSETS = join(ROOT, 'packages/ui/src/authoring/assets')

interface Resource {
  from: string
  to: string
  filter?: string[]
}

interface BuilderConfig {
  extraResources: Resource[]
  afterPack?: (context: unknown) => Promise<void>
  afterAllArtifactBuild?: string
}

const config = require(join(SHELL, 'electron-builder.cjs')) as BuilderConfig
const {
  BUILTIN_HWPX_FORMS_DIR_NAME,
  BUILTIN_HWPX_FORM_IDS,
  assertBuiltinHwpxForms,
  missingBuiltinHwpxForms,
} = require(join(SHELL, 'build/assert-builtin-hwpx-forms.cjs')) as {
  BUILTIN_HWPX_FORMS_DIR_NAME: string
  BUILTIN_HWPX_FORM_IDS: string[]
  assertBuiltinHwpxForms: (dir: string) => void
  missingBuiltinHwpxForms: (dir: string) => string[]
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

function makeFormsDir(root: string, ids: readonly string[] = BUILTIN_HWPX_FORM_IDS): string {
  const dir = join(root, BUILTIN_HWPX_FORMS_DIR_NAME)
  mkdirSync(dir, { recursive: true })
  for (const id of ids) copyFileSync(join(ASSETS, `${id}.hwpx`), join(dir, `${id}.hwpx`))
  return dir
}

describe('builtin hwpx forms packaging', () => {
  it('ships the forms folder exactly once, whole, into resources', () => {
    const entries = config.extraResources.filter(
      (item) => item.to === BUILTIN_HWPX_FORMS_DIR_NAME || item.from.includes('authoring/assets'),
    )
    expect(entries).toHaveLength(1)
    const [entry] = entries
    expect(entry!.to).toBe(BUILTIN_HWPX_FORMS_DIR_NAME)
    expect(entry!.filter).toEqual(['*.hwpx'])
    expect(resolve(SHELL, entry!.from)).toBe(ASSETS)
  })

  it('keeps the source assertion and the afterPack hook', () => {
    const source = require('node:fs').readFileSync(join(SHELL, 'electron-builder.cjs'), 'utf8')
    expect(source).toContain('assertBuiltinHwpxForms(join(__dirname, BUILTIN_HWPX_FORMS_SOURCE))')
    expect(typeof config.afterPack).toBe('function')
    expect(config.afterAllArtifactBuild).toBe('build/notarize-dmg.js')
  })

  it('lists the ten ledger forms', () => {
    expect(BUILTIN_HWPX_FORM_IDS).toEqual([
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
    ])
    const assets = readdirSync(ASSETS).filter((name) => name.endsWith('.hwpx'))
    expect(assets.sort()).toEqual(BUILTIN_HWPX_FORM_IDS.map((id) => `${id}.hwpx`).sort())
  })

  it('rejects a resources tree missing any of the ten files and accepts a complete one', () => {
    const complete = tempDir()
    const formsDir = makeFormsDir(complete)
    expect(() => assertBuiltinHwpxForms(formsDir)).not.toThrow()
    expect(missingBuiltinHwpxForms(formsDir)).toEqual([])

    rmSync(join(formsDir, 'statement.hwpx'))
    expect(missingBuiltinHwpxForms(formsDir)).toEqual(['statement'])
    expect(() => assertBuiltinHwpxForms(formsDir)).toThrow(/statement/)
  })

  it('runs the afterPack check against win/linux and mac app layouts', async () => {
    expect(config.afterPack).toBeTypeOf('function')

    const linuxRoot = tempDir()
    makeFormsDir(join(linuxRoot, 'resources'))
    await expect(
      config.afterPack!({
        appOutDir: linuxRoot,
        electronPlatformName: 'linux',
        packager: { appInfo: { productFilename: 'NaddleOffice' } },
      }),
    ).resolves.toBeUndefined()

    const macRoot = tempDir()
    makeFormsDir(join(macRoot, 'NaddleOffice.app/Contents/Resources'))
    await expect(
      config.afterPack!({
        appOutDir: macRoot,
        electronPlatformName: 'darwin',
        packager: { appInfo: { productFilename: 'NaddleOffice' } },
      }),
    ).resolves.toBeUndefined()

    const brokenRoot = tempDir()
    makeFormsDir(join(brokenRoot, 'resources'), BUILTIN_HWPX_FORM_IDS.slice(0, 9))
    await expect(
      config.afterPack!({
        appOutDir: brokenRoot,
        electronPlatformName: 'win32',
        packager: { appInfo: { productFilename: 'NaddleOffice' } },
      }),
    ).rejects.toThrow(/official-letter/)
  })
})
