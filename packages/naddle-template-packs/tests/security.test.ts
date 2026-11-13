import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { disposeTenantPack, prepareTenantPackZip, tenantPackStoreDir } from '../src/index'
import { SKILL_PATH, makeForm, skillMd, writePack, writePackZip } from './helpers'

let work: string
let storeDir: string

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'naddle-pack-security-'))
  storeDir = tenantPackStoreDir(join(work, 'userData'), 'tenant-a')
})

afterEach(async () => {
  await rm(work, { recursive: true, force: true })
})

async function problemsFor(
  options: Parameters<typeof writePack>[1],
  formAsset = 'assets/leave.hwpx',
): Promise<string> {
  const root = await writePack(join(work, 'pack'), { ...options, formAsset })
  const file = join(work, 'pack.zip')
  await writePackZip(root, file)
  const prepared = await prepareTenantPackZip(file, { storeDir })
  const text = prepared.preview.problems.join('\n')
  await disposeTenantPack(prepared)
  return text
}

describe('scripts are a hard failure', () => {
  it('rejects a scripts folder', async () => {
    const text = await problemsFor({
      extraFiles: { [`${SKILL_PATH}/scripts/run.sh`]: '#!/bin/sh\n' },
    })
    expect(text).toContain('scripts are not allowed')
  })

  it('rejects a .py file', async () => {
    const text = await problemsFor({
      extraFiles: { [`${SKILL_PATH}/tool.py`]: 'print(1)\n' },
    })
    expect(text).toContain('scripts are not allowed')
  })

  it('rejects an .exe file', async () => {
    const text = await problemsFor({
      extraFiles: { [`${SKILL_PATH}/tool.exe`]: 'MZ' },
    })
    expect(text).toContain('scripts are not allowed')
  })

  it('rejects an MCP declaration in SKILL.md', async () => {
    const skill = [
      '---',
      'name: leave-form',
      'description: Leave request form',
      'allowed-tools:',
      '  - mcp__files__read',
      'metadata:',
      '  ieum-template: assets/leave.hwpx',
      '---',
      'Use this form.',
    ].join('\n')
    const text = await problemsFor({ skill })
    expect(text).toContain('declares tools')
  })
})

describe('macros and embedded programs are a hard failure', () => {
  it('rejects vbaProject.bin inside a docx', async () => {
    const bytes = await makeForm({ add: (zip) => zip.file('word/vbaProject.bin', 'macro') })
    const text = await problemsFor({ formBytes: bytes }, 'assets/form.docx')
    expect(text).toContain('may not carry macros')
  })

  it.each(['.xlsm', '.docm'])('rejects the %s extension outright', async (ext) => {
    const text = await problemsFor({}, `assets/form${ext}`)
    expect(text).toContain('not allowed')
  })

  it('rejects .hwp because its macros cannot be checked', async () => {
    const text = await problemsFor({}, 'assets/form.hwp')
    expect(text).toContain('not allowed')
  })

  it('rejects Scripts/ inside HWPX', async () => {
    const bytes = await makeForm({ add: (zip) => zip.file('Scripts/evil', 'x') })
    const text = await problemsFor({ formBytes: bytes }, 'assets/form.hwpx')
    expect(text).toContain('may not carry scripts')
  })

  it('rejects an external relationship', async () => {
    const bytes = await makeForm({
      add: (zip) =>
        zip.file(
          'word/_rels/document.xml.rels',
          '<Relationships><Relationship Target="https://example.test/x" TargetMode="External"/></Relationships>',
        ),
    })
    const text = await problemsFor({ formBytes: bytes }, 'assets/form.docx')
    expect(text).toContain('external target')
  })

  it('rejects SVG and HTML forms', async () => {
    expect(await problemsFor({}, 'assets/form.svg')).toContain('not allowed')
    expect(await problemsFor({}, 'assets/form.html')).toContain('not allowed')
  })

  it('rejects a form whose contents are not the extension it claims', async () => {
    const text = await problemsFor({ formBytes: Buffer.from('not a zip') }, 'assets/form.docx')
    expect(text).toContain('not a readable .docx archive')
  })
})

describe('unsafe archives', () => {
  it('rejects a path traversal entry', async () => {
    const root = await writePack(join(work, 'pack'))
    const file = join(work, 'traversal.zip')
    await writePackZip(root, file, {
      add: (zip: JSZip) => {
        zip.file('../evil.txt', 'x')
      },
    })
    await expect(prepareTenantPackZip(file, { storeDir })).rejects.toMatchObject({
      code: 'unsafe',
    })
  })

  it('rejects a symlink entry', async () => {
    const root = await writePack(join(work, 'pack'))
    const file = join(work, 'symlink.zip')
    await writePackZip(root, file, {
      platform: 'UNIX',
      add: (zip: JSZip) => {
        zip.file('link', 'target', { unixPermissions: 0o120777 })
      },
    })
    await expect(prepareTenantPackZip(file, { storeDir })).rejects.toMatchObject({
      code: 'unsafe',
    })
  })

  it('refuses a symbolic link in a chosen folder', async () => {
    const root = await writePack(join(work, 'folder'))
    const { symlink } = await import('node:fs/promises')
    await symlink('/etc/passwd', join(root, 'link'))
    const { prepareTenantPackFolder } = await import('../src/index')
    await expect(prepareTenantPackFolder(root, { storeDir })).rejects.toMatchObject({
      code: 'unsafe',
    })
  })
})

describe('SKILL.md content', () => {
  it('accepts a plain form skill without tools', async () => {
    const root = await writePack(join(work, 'plain'), { skill: skillMd() })
    const file = join(work, 'plain.zip')
    await writePackZip(root, file)
    const prepared = await prepareTenantPackZip(file, { storeDir })
    expect(prepared.preview.problems).toEqual([])
    await disposeTenantPack(prepared)
  })
})
