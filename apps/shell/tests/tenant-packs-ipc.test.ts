import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TENANT_PACKS_CHANNELS as C } from '../src/shared/tenant-packs-api'

/**
 * Tenant template pack IPC: every call files under the main-process tenant
 * snapshot, an extra tenant argument is ignored, and only the main shell
 * window may import or remove.
 */

type Handler = (event: unknown, ...args: unknown[]) => unknown

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
  installPreparedTenantPack: vi.fn(),
  disposeTenantPack: vi.fn(),
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

vi.mock('@naddle/template-packs', async () => {
  const { join } = await import('node:path')
  return {
    TenantPackError: class TenantPackError extends Error {},
    tenantPackMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
    tenantPackStoreDir: (userData: string, tenantId: string | undefined) =>
      join(userData, 'tenants', tenantId ?? '_local', 'template-packs'),
    listTenantPacks: engine.listTenantPacks,
    removeTenantPack: engine.removeTenantPack,
    prepareTenantPackZip: engine.prepareTenantPackZip,
    prepareTenantPackFolder: engine.prepareTenantPackFolder,
    installPreparedTenantPack: engine.installPreparedTenantPack,
    disposeTenantPack: engine.disposeTenantPack,
  }
})

const { registerTenantPacksIpc } = await import('../src/main/tenant-packs')

const main = { id: 1 }
const editor = { id: 2 }

registerTenantPacksIpc({
  userDataDir: () => '/userData',
  tenantId: 'tenant-a',
  lang: () => 'en',
  parentWindow: () => null,
  isMainWindow: (sender) => sender === main,
})

const call = (channel: string, sender: object, ...args: unknown[]) =>
  mocks.handlers.get(channel)!({ sender }, ...args)

beforeEach(() => {
  mocks.showOpenDialog.mockReset()
  mocks.showMessageBox.mockReset()
  mocks.showMessageBox.mockResolvedValue({ response: 0, checkboxChecked: false })
  for (const fn of Object.values(engine)) fn.mockReset()
  engine.listTenantPacks.mockResolvedValue([])
})

describe('tenant template pack IPC', () => {
  it('lists only the configured tenant, ignoring a tenant argument', async () => {
    const result = await call(C.list, main, 'tenant-b')
    expect(result).toMatchObject({ ok: true, packs: [] })
    expect(engine.listTenantPacks).toHaveBeenCalledWith('/userData/tenants/tenant-a/template-packs')
  })

  it('refuses an import from a non-main window before any dialog', async () => {
    const result = await call(C.importZip, editor, 'tenant-b')
    expect(result).toEqual({ ok: false, reason: 'not-allowed' })
    expect(mocks.showOpenDialog).not.toHaveBeenCalled()
    expect(engine.prepareTenantPackZip).not.toHaveBeenCalled()
  })

  it('refuses a remove from a non-main window', async () => {
    const result = await call(C.remove, editor, 'acme-pack')
    expect(result).toEqual({ ok: false, reason: 'not-allowed' })
    expect(engine.removeTenantPack).not.toHaveBeenCalled()
  })

  it('imports from the main window under the configured tenant, ignoring extra arguments', async () => {
    mocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/pack.zip'] })
    engine.prepareTenantPackZip.mockResolvedValue({
      preview: {
        pack: { id: 'acme-pack', name: 'Acme', version: '1.0.0' },
        origin: { kind: 'zip', file: '/tmp/pack.zip' },
        license: 'proprietary-tenant',
        licenseNormalized: false,
        author: 'Acme',
        entries: [],
        problems: ['broken'],
        requiresAttestation: true,
        replacesExisting: false,
      },
      root: '/tmp/unpacked',
      storeDir: '/userData/tenants/tenant-a/template-packs',
      cleanup: [],
    })
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
})
