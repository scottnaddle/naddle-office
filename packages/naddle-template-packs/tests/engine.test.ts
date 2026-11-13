import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SkillFetch } from '@genoffice/ai-provider'
import {
  disposeTenantPack,
  installPreparedTenantPack,
  listTenantPacks,
  prepareTenantPackFolder,
  prepareTenantPackGitHub,
  prepareTenantPackZip,
  tenantKeyFromId,
  tenantPackStoreDir,
} from '../src/index'
import {
  FORM_ASSET,
  PACK_ID,
  SKILL_PATH,
  githubArchive,
  makeForm,
  manifest,
  sha256,
  skillMd,
  writePack,
  writePackZip,
} from './helpers'

let work: string
let storeDir: string

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'naddle-pack-test-'))
  storeDir = tenantPackStoreDir(join(work, 'userData'), 'tenant-a')
})

afterEach(async () => {
  await rm(work, { recursive: true, force: true })
})

async function preparedZip(options: Parameters<typeof writePack>[1] = {}) {
  const root = await writePack(join(work, 'pack'), options)
  const file = join(work, 'pack.zip')
  await writePackZip(root, file)
  return prepareTenantPackZip(file, { storeDir })
}

describe('zip import', () => {
  it('installs a valid pack and writes one index record', async () => {
    const prepared = await preparedZip()
    expect(prepared.preview.problems).toEqual([])
    const record = await installPreparedTenantPack(prepared, {
      attested: true,
      now: () => new Date('2026-01-02T03:04:05Z'),
    })
    expect(record.id).toBe(PACK_ID)
    expect(record.installedAt).toBe('2026-01-02T03:04:05.000Z')
    const list = await listTenantPacks(storeDir)
    expect(list).toHaveLength(1)
    expect(list[0]!.id).toBe(PACK_ID)
    expect(list[0]!.verified).toBe(true)
    await disposeTenantPack(prepared)
  })

  it('also accepts a zip with one top folder', async () => {
    const root = await writePack(join(work, 'pack'))
    const file = join(work, 'wrapped.zip')
    await writePackZip(root, file, { topFolder: 'acme' })
    const prepared = await prepareTenantPackZip(file, { storeDir })
    expect(prepared.preview.problems).toEqual([])
    await disposeTenantPack(prepared)
  })

  it('requires the rights attestation before install', async () => {
    const prepared = await preparedZip()
    await expect(installPreparedTenantPack(prepared, { attested: false })).rejects.toMatchObject({
      code: 'attestation-required',
    })
    await disposeTenantPack(prepared)
  })
})

describe('manifest and layout rejection', () => {
  const cases: Array<[string, Parameters<typeof writePack>[1], string]> = [
    ['a missing manifest', { omitManifest: true }, 'manifest.json is missing'],
    ['invalid JSON', { manifestRaw: '{' }, 'not valid JSON'],
    ['a builtin scope', { scope: 'builtin' }, 'scope must be tenant'],
    ['a non-tenant source', { sourcePack: 'other-pack' }, 'source.pack must be'],
    [
      'a mismatched pack id',
      { packId: 'acme-pack', sourcePack: 'other-pack' },
      'source.pack must be',
    ],
    [
      'a stray SKILL.md',
      { extraFiles: { 'other/SKILL.md': skillMd() } },
      'SKILL.md is not in the manifest',
    ],
    [
      'a stray asset',
      { extraFiles: { [`${SKILL_PATH}/assets/extra.hwpx`]: 'not used' } },
      'asset is not part of any manifest entry',
    ],
    ['a missing pack id', { omitPack: true }, 'manifest.pack is required'],
  ]

  it.each(cases)('rejects %s', async (_name, options, message) => {
    const prepared = await preparedZip(options)
    expect(prepared.preview.problems.join('\n')).toContain(message)
    await expect(installPreparedTenantPack(prepared, { attested: true })).rejects.toMatchObject({
      code: 'invalid-pack',
    })
    await disposeTenantPack(prepared)
  })

  it('rejects a SKILL.md that names a different template than the manifest', async () => {
    const prepared = await preparedZip({ skill: skillMd('assets/other.hwpx') })
    expect(prepared.preview.problems.join('\n')).toContain('must match formAsset.path')
    await disposeTenantPack(prepared)
  })
})

describe('license policy', () => {
  it.each(['CC-BY-NC-4.0', 'CC-BY-ND-4.0', 'KOGL-Type3', 'personal'])(
    'rejects %s',
    async (license) => {
      const prepared = await preparedZip({ license })
      expect(prepared.preview.problems.length).toBeGreaterThan(0)
      await disposeTenantPack(prepared)
    },
  )

  it('rejects a vendor author', async () => {
    const prepared = await preparedZip({ author: 'Hancom Office' })
    expect(prepared.preview.problems.join('\n')).toContain('vendor and marketplace')
    await disposeTenantPack(prepared)
  })

  it.each(['proprietary-tenant', 'Apache-2.0', 'MIT', 'CC0-1.0', 'CC-BY-4.0', 'KOGL-Type1'])(
    'allows %s',
    async (license) => {
      const prepared = await preparedZip({ license })
      expect(prepared.preview.problems).toEqual([])
      await disposeTenantPack(prepared)
    },
  )

  it('normalizes a bare CC0 before parsing', async () => {
    const prepared = await preparedZip({ license: 'CC0' })
    expect(prepared.preview.problems).toEqual([])
    expect(prepared.preview.licenseNormalized).toBe(true)
    expect(prepared.preview.entries[0]!.license).toBe('CC0-1.0')
    await disposeTenantPack(prepared)
  })
})

describe('sha256', () => {
  it('rejects a mismatch', async () => {
    const prepared = await preparedZip({ sha256: 'b'.repeat(64) })
    expect(prepared.preview.problems.join('\n')).toContain('sha256 does not match')
    await disposeTenantPack(prepared)
  })

  it('detects a form changed after installation', async () => {
    const prepared = await preparedZip()
    await installPreparedTenantPack(prepared, { attested: true })
    const form = join(storeDir, PACK_ID, ...SKILL_PATH.split('/'), ...FORM_ASSET.split('/'))
    await writeFile(form, 'changed')
    const list = await listTenantPacks(storeDir)
    expect(list[0]!.verified).toBe(false)
    expect(list[0]!.problems.join('\n')).toContain('changed after installation')
    await disposeTenantPack(prepared)
  })
})

describe('folder import', () => {
  it('validates a copy of the chosen folder', async () => {
    const root = await writePack(join(work, 'folder-pack'))
    const prepared = await prepareTenantPackFolder(root, { storeDir })
    expect(prepared.preview.problems).toEqual([])
    await installPreparedTenantPack(prepared, { attested: true })
    expect(await listTenantPacks(storeDir)).toHaveLength(1)
    await disposeTenantPack(prepared)
  })
})

describe('GitHub import', () => {
  const commit = 'c'.repeat(40)

  it('uses the same validator and records the commit', async () => {
    const root = await writePack(join(work, 'github-pack'))
    const archive = await githubArchive(root)
    const fetchMock: SkillFetch = async (url) => {
      if (url === 'https://api.github.com/repos/owner/repo') {
        return new Response(JSON.stringify({ default_branch: 'main' }), { status: 200 })
      }
      if (url.includes('/commits/main')) return new Response(commit, { status: 200 })
      if (url.includes('/zip/')) {
        return new Response(new Uint8Array(archive), {
          status: 200,
          headers: { 'content-type': 'application/zip' },
        })
      }
      throw new Error(`unexpected request ${url}`)
    }
    const prepared = await prepareTenantPackGitHub('owner/repo', { storeDir, fetch: fetchMock })
    expect(prepared.preview.problems).toEqual([])
    const record = await installPreparedTenantPack(prepared, { attested: true })
    expect(record.origin).toMatchObject({ kind: 'github', commit })
    await disposeTenantPack(prepared)
  })

  it('rejects a single-skill address before requesting anything', async () => {
    let called = false
    const fetchMock: SkillFetch = async () => {
      called = true
      throw new Error('should not fetch')
    }
    await expect(
      prepareTenantPackGitHub('owner/repo@leave-form', { storeDir, fetch: fetchMock }),
    ).rejects.toMatchObject({ code: 'single-skill' })
    expect(called).toBe(false)
  })
})

describe('tenant isolation', () => {
  it('does not show one tenant packs to another or to _local', async () => {
    const prepared = await preparedZip()
    await installPreparedTenantPack(prepared, { attested: true })
    const storeB = tenantPackStoreDir(join(work, 'userData'), 'tenant-b')
    const storeLocal = tenantPackStoreDir(join(work, 'userData'), undefined)
    expect(await listTenantPacks(storeDir)).toHaveLength(1)
    expect(await listTenantPacks(storeB)).toHaveLength(0)
    expect(await listTenantPacks(storeLocal)).toHaveLength(0)
    expect(tenantKeyFromId(undefined)).toBe('_local')
    await disposeTenantPack(prepared)
  })

  it('fails closed on a Windows-unsafe tenant id', () => {
    expect(() => tenantKeyFromId('acme.')).toThrow()
    expect(() => tenantKeyFromId('con')).toThrow()
    expect(() => tenantKeyFromId('../escape')).toThrow()
  })
})

describe('helpers', () => {
  it('hashes the same bytes the manifest records', async () => {
    const bytes = await makeForm()
    expect(sha256(bytes)).toHaveLength(64)
    expect(manifest({ sha256: sha256(bytes) }).entries).toHaveLength(1)
  })
})
