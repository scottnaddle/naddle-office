import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TENANT_PACKS_CHANNELS as C } from '../src/shared/tenant-packs-api'

/**
 * Tenant template pack IPC: every call files under the main-process tenant
 * snapshot, an extra tenant argument is ignored, and only the main shell
 * window may import, prepare or remove. Document windows may list and open a
 * verified form through `installedFormPath`.
 */

type Handler = (event: unknown, ...args: unknown[]) => unknown

const fs = vi.hoisted(() => ({
  readFile: vi.fn(async () => new Uint8Array([1, 2, 3])),
}))

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  showOpenDialog: vi.fn(),
  showMessageBox: vi.fn(),
}))

const engine = vi.hoisted(() => ({
  listTenantPacks: vi.fn(),
  removeTenantPack: vi.fn(),
  prepareTenantPackZip: vi.fn(),
  prepareTenantPackFolder: vi.fn(),
  prepareTenantPackGitHub: vi.fn(),
  installPreparedTenantPack: vi.fn(),
  disposeTenantPack: vi.fn(),
  installedFormPath: vi.fn(),
  readTenantPackIndex: vi.fn(),
}))

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: () => null },
  ipcMain: {
    handle: (channel: string, handler: Handler) => mocks.handlers.set(channel, handler),
  },
  dialog: {
    showOpenDialog: mocks.showOpenDialog,
    showMessageBox: mocks.showMessageBox,
  },
}))

vi.mock('node:fs/promises', () => ({ readFile: fs.readFile }))

vi.mock('@naddle/template-packs', async () => {
  const { join } = await import('node:path')
  class TenantPackError extends Error {
    code: string
    constructor(code: string, message: string) {
      super(message)
      this.code = code
    }
  }
  return {
    TenantPackError,
    tenantPackMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
    tenantPackStoreDir: (userData: string, tenantId: string | undefined) =>
      join(userData, 'tenants', tenantId ?? '_local', 'template-packs'),
    listTenantPacks: engine.listTenantPacks,
    removeTenantPack: engine.removeTenantPack,
    prepareTenantPackZip: engine.prepareTenantPackZip,
    prepareTenantPackFolder: engine.prepareTenantPackFolder,
    prepareTenantPackGitHub: engine.prepareTenantPackGitHub,
    installPreparedTenantPack: engine.installPreparedTenantPack,
    disposeTenantPack: engine.disposeTenantPack,
    installedFormPath: engine.installedFormPath,
    readTenantPackIndex: engine.readTenantPackIndex,
  }
})

const { registerTenantPacksIpc } = await import('../src/main/tenant-packs')

const main = { id: 1 }
const editor = { id: 2 }
const fetchMock = vi.fn(async () => new Response('{}'))
const openFormCopy = vi.fn(async () => ({ ok: true, tabId: 'tab-1' }))

registerTenantPacksIpc({
  userDataDir: () => '/userData',
  tenantId: 'tenant-a',
  lang: () => 'en',
  parentWindow: () => null,
  isMainWindow: (sender) => sender === main,
  fetch: fetchMock,
  openFormCopy,
})

const call = (channel: string, sender: object, ...args: unknown[]) =>
  mocks.handlers.get(channel)!({ sender }, ...args)

function preview(overrides: Record<string, unknown> = {}) {
  return {
    pack: { id: 'acme-pack', name: 'Acme', version: '1.0.0' },
    origin: { kind: 'zip', file: '/tmp/pack.zip' },
    license: 'proprietary-tenant',
    licenseNormalized: false,
    author: 'Acme',
    entries: [],
    problems: [],
    requiresAttestation: true,
    replacesExisting: false,
    ...overrides,
  }
}

function prepared(overrides: Record<string, unknown> = {}) {
  return {
    preview: preview(overrides),
    root: '/tmp/unpacked',
    storeDir: '/userData/tenants/tenant-a/template-packs',
    cleanup: [],
  }
}

beforeEach(() => {
  mocks.showOpenDialog.mockReset()
  mocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/pack.zip'] })
  mocks.showMessageBox.mockReset()
  mocks.showMessageBox.mockResolvedValue({ response: 0, checkboxChecked: false })
  for (const fn of Object.values(engine)) fn.mockReset()
  fetchMock.mockClear()
  openFormCopy.mockClear()
  fs.readFile.mockClear()
  engine.listTenantPacks.mockResolvedValue([])
  engine.disposeTenantPack.mockResolvedValue(undefined)
  engine.installPreparedTenantPack.mockResolvedValue({})
  engine.readTenantPackIndex.mockResolvedValue({
    schemaVersion: 1,
    packs: [
      {
        id: 'acme-pack',
        entries: [
          {
            id: 'leave-form',
            kind: 'form-skill',
            name: 'Leave request form',
            license: 'proprietary-tenant',
            author: 'Acme',
            skillPath: 'forms/leave',
            formAsset: 'assets/leave.hwpx',
            sha256: '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
          },
        ],
      },
    ],
  })
})

describe('tenant template pack IPC', () => {
  it('lists only the configured tenant, ignoring a tenant argument', async () => {
    const result = await call(C.list, main, 'tenant-b')
    expect(result).toMatchObject({ ok: true, packs: [] })
    expect(engine.listTenantPacks).toHaveBeenCalledWith('/userData/tenants/tenant-a/template-packs')
  })

  it('allows list from a document window, but not prepare or remove', async () => {
    await call(C.list, editor)
    expect(engine.listTenantPacks).toHaveBeenCalledTimes(1)

    expect(await call(C.prepareZip, editor, 'tenant-b')).toEqual({
      ok: false,
      reason: 'not-allowed',
    })
    expect(await call(C.prepareGitHub, editor, 'owner/repo')).toEqual({
      ok: false,
      reason: 'not-allowed',
    })
    expect(await call(C.remove, editor, 'acme-pack')).toEqual({
      ok: false,
      reason: 'not-allowed',
    })
    expect(mocks.showOpenDialog).not.toHaveBeenCalled()
    expect(engine.prepareTenantPackZip).not.toHaveBeenCalled()
    expect(engine.prepareTenantPackGitHub).not.toHaveBeenCalled()
    expect(engine.removeTenantPack).not.toHaveBeenCalled()
  })

  it('refuses an import from a non-main window before any dialog', async () => {
    const result = await call(C.importZip, editor, 'tenant-b')
    expect(result).toEqual({ ok: false, reason: 'not-allowed' })
    expect(mocks.showOpenDialog).not.toHaveBeenCalled()
    expect(engine.prepareTenantPackZip).not.toHaveBeenCalled()
  })

  it('imports from the main window under the configured tenant, ignoring extra arguments', async () => {
    mocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/pack.zip'] })
    engine.prepareTenantPackZip.mockResolvedValue(prepared({ problems: ['broken'] }))
    const result = await call(C.importZip, main, 'tenant-b')
    expect(result).toMatchObject({ ok: false, reason: 'invalid-pack' })
    expect(engine.prepareTenantPackZip).toHaveBeenCalledWith('/tmp/pack.zip', {
      storeDir: '/userData/tenants/tenant-a/template-packs',
    })
  })

  it('removes a pack from the configured tenant', async () => {
    engine.removeTenantPack.mockResolvedValue(true)
    const result = await call(C.remove, main, 'acme-pack', 'tenant-b')
    expect(result).toMatchObject({ ok: true })
    expect(engine.removeTenantPack).toHaveBeenCalledWith(
      '/userData/tenants/tenant-a/template-packs',
      'acme-pack',
    )
  })

  it('prepares a zip into a path-free preview and stashes the prepared pack', async () => {
    mocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/pack.zip'] })
    engine.prepareTenantPackZip.mockResolvedValue(prepared())
    const result = await call(C.prepareZip, main, 'tenant-b')
    expect(result).toMatchObject({
      ok: true,
      prepareToken: expect.any(String),
      preview: {
        pack: { id: 'acme-pack', name: 'Acme', version: '1.0.0' },
        origin: { kind: 'zip', file: 'pack.zip' },
        problems: [],
      },
    })
    expect(JSON.stringify(result.preview)).not.toContain('/tmp/pack.zip')
    expect(engine.prepareTenantPackZip).toHaveBeenCalledWith('/tmp/pack.zip', {
      storeDir: '/userData/tenants/tenant-a/template-packs',
    })
  })

  it('prepares a GitHub address with the injected fetch and ignores a tenant argument', async () => {
    engine.prepareTenantPackGitHub.mockResolvedValue(
      prepared({
        origin: {
          kind: 'github',
          repo: 'owner/repo',
          ref: 'main',
          commit: 'c'.repeat(40),
          path: '',
        },
      }),
    )
    const result = await call(C.prepareGitHub, main, ' owner/repo ', 'tenant-b')
    expect(result).toMatchObject({
      ok: true,
      preview: { origin: { kind: 'github', repo: 'owner/repo' } },
    })
    expect(engine.prepareTenantPackGitHub).toHaveBeenCalledWith('owner/repo', {
      storeDir: '/userData/tenants/tenant-a/template-packs',
      fetch: fetchMock,
    })
  })

  it('reports a single-skill GitHub address as refused', async () => {
    const { TenantPackError } = await import('@naddle/template-packs')
    engine.prepareTenantPackGitHub.mockRejectedValue(
      new TenantPackError('single-skill', 'not a pack'),
    )
    const result = await call(C.prepareGitHub, main, 'owner/repo@leave-form')
    expect(result).toMatchObject({ ok: false, reason: 'single-skill' })
  })

  it('requires the rights confirmation and installs only after it', async () => {
    engine.prepareTenantPackZip.mockResolvedValue(prepared())
    const first = await call(C.prepareZip, main)
    expect(first.ok).toBe(true)

    const refused = await call(C.confirmInstall, main, first.prepareToken, false)
    expect(refused).toEqual({ ok: false, reason: 'attestation-required' })
    expect(engine.installPreparedTenantPack).not.toHaveBeenCalled()

    const installed = await call(C.confirmInstall, main, first.prepareToken, true, 'tenant-b')
    expect(installed).toMatchObject({ ok: true })
    expect(engine.installPreparedTenantPack).toHaveBeenCalledTimes(1)
    expect(engine.disposeTenantPack).toHaveBeenCalledTimes(1)

    // the token is single-use
    const reused = await call(C.confirmInstall, main, first.prepareToken, true)
    expect(reused).toEqual({ ok: false, reason: 'not-found' })
  })

  it('refuses to install a preview with problems even after the confirmation', async () => {
    engine.prepareTenantPackZip.mockResolvedValue(prepared({ problems: ['bad hash'] }))
    const first = await call(C.prepareZip, main)
    const result = await call(C.confirmInstall, main, first.prepareToken, true)
    expect(result).toMatchObject({ ok: false, reason: 'invalid-pack' })
    expect(engine.installPreparedTenantPack).not.toHaveBeenCalled()
  })

  it('disposes only the canceled prepared pack', async () => {
    engine.prepareTenantPackZip.mockResolvedValue(prepared())
    const first = await call(C.prepareZip, main)
    const second = await call(C.prepareZip, main)
    expect(first.prepareToken).not.toBe(second.prepareToken)

    const canceled = await call(C.cancelPrepare, main, first.prepareToken)
    expect(canceled).toEqual({ ok: true })
    expect(engine.disposeTenantPack).toHaveBeenCalledTimes(1)

    const installed = await call(C.confirmInstall, main, second.prepareToken, true)
    expect(installed.ok).toBe(true)
    expect(engine.disposeTenantPack).toHaveBeenCalledTimes(2)
  })

  it('opens a verified form from a document window without a tenant argument', async () => {
    engine.installedFormPath.mockResolvedValue(
      '/userData/tenants/tenant-a/template-packs/acme-pack/forms/leave/assets/leave.hwpx',
    )
    const result = await call(
      C.openForm,
      editor,
      { packId: 'acme-pack', entryId: 'leave-form', text: 'fill it' },
      'tenant-b',
    )
    expect(result).toEqual({ ok: true, tabId: 'tab-1' })
    expect(engine.installedFormPath).toHaveBeenCalledWith(
      '/userData/tenants/tenant-a/template-packs',
      'acme-pack',
      'leave-form',
    )
    expect(openFormCopy).toHaveBeenCalledWith({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: 'leave.hwpx',
      title: 'Leave request form',
      text: 'fill it',
    })
    expect(JSON.stringify(result)).not.toContain('/userData/')
  })

  it('refuses to open a form whose hash re-check failed, before copying anything', async () => {
    engine.installedFormPath.mockResolvedValue(undefined)
    const result = await call(C.openForm, editor, { packId: 'acme-pack', entryId: 'leave-form' })
    expect(result).toMatchObject({ ok: false, reason: 'tampered' })
    expect(fs.readFile).not.toHaveBeenCalled()
    expect(openFormCopy).not.toHaveBeenCalled()
  })

  it('re-hashes the bytes and refuses a form changed after installedFormPath', async () => {
    engine.installedFormPath.mockResolvedValue(
      '/userData/tenants/tenant-a/template-packs/acme-pack/forms/leave/assets/leave.hwpx',
    )
    engine.readTenantPackIndex.mockResolvedValue({
      schemaVersion: 1,
      packs: [
        {
          id: 'acme-pack',
          entries: [
            {
              id: 'leave-form',
              kind: 'form-skill',
              name: 'Leave request form',
              license: 'proprietary-tenant',
              author: 'Acme',
              skillPath: 'forms/leave',
              formAsset: 'assets/leave.hwpx',
              sha256: 'b'.repeat(64),
            },
          ],
        },
      ],
    })
    const result = await call(C.openForm, editor, { packId: 'acme-pack', entryId: 'leave-form' })
    expect(result).toMatchObject({ ok: false, reason: 'tampered' })
    expect(openFormCopy).not.toHaveBeenCalled()
  })

  it('opens an installed form without a fill instruction when text is absent', async () => {
    engine.installedFormPath.mockResolvedValue(
      '/userData/tenants/tenant-a/template-packs/acme-pack/forms/leave/assets/leave.hwpx',
    )
    const result = await call(C.openForm, editor, { packId: 'acme-pack', entryId: 'leave-form' })
    expect(result).toEqual({ ok: true, tabId: 'tab-1' })
    expect(openFormCopy).toHaveBeenCalledWith({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: 'leave.hwpx',
      title: 'Leave request form',
    })
  })
})
