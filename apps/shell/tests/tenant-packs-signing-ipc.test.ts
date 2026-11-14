import { generateKeyPairSync } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TENANT_PACKS_CHANNELS as C } from '../src/shared/tenant-packs-api'

/**
 * Signing-key IPC: main window only, no tenant argument, and a private-key PEM
 * is refused before anything is written. Preview payloads carry key ids and
 * labels only, never PEM or an absolute path.
 */

type Handler = (event: unknown, ...args: unknown[]) => unknown

const fs = vi.hoisted(() => ({ readFile: vi.fn() }))

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  showOpenDialog: vi.fn(),
  showMessageBox: vi.fn(),
}))

const engine = vi.hoisted(() => ({
  listTenantPacks: vi.fn(),
  prepareTenantPackFolder: vi.fn(),
  disposeTenantPack: vi.fn(),
  installedFormPath: vi.fn(),
  readTenantPackIndex: vi.fn(),
  inspectPublicKeyPem: vi.fn(),
  readTrustedPackKeys: vi.fn(),
  readRevokedPackKeys: vi.fn(),
  registerTrustedPackKey: vi.fn(),
  removeTrustedPackKey: vi.fn(),
  revokePackKey: vi.fn(),
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
    prepareTenantPackFolder: engine.prepareTenantPackFolder,
    disposeTenantPack: engine.disposeTenantPack,
    installedFormPath: engine.installedFormPath,
    readTenantPackIndex: engine.readTenantPackIndex,
    inspectPublicKeyPem: engine.inspectPublicKeyPem,
    readTrustedPackKeys: engine.readTrustedPackKeys,
    readRevokedPackKeys: engine.readRevokedPackKeys,
    registerTrustedPackKey: engine.registerTrustedPackKey,
    removeTrustedPackKey: engine.removeTrustedPackKey,
    revokePackKey: engine.revokePackKey,
  }
})

const { registerTenantPacksIpc } = await import('../src/main/tenant-packs')

const main = { id: 1 }
const editor = { id: 2 }
const store = '/userData/tenants/tenant-a/template-packs'
const keyId = `ed25519:${'a'.repeat(32)}`

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
  fs.readFile.mockReset()
  for (const fn of Object.values(engine)) fn.mockReset()
  engine.readTrustedPackKeys.mockResolvedValue([])
  engine.readRevokedPackKeys.mockResolvedValue({ keys: [], unreadable: false })
  engine.disposeTenantPack.mockResolvedValue(undefined)
})

describe('signing-key IPC', () => {
  it('rejects every key method outside the main window', async () => {
    expect(await call(C.listKeys, editor)).toEqual({ ok: false, reason: 'not-allowed' })
    expect(await call(C.registerKey, editor)).toEqual({ ok: false, reason: 'not-allowed' })
    expect(await call(C.removeKey, editor, keyId)).toEqual({ ok: false, reason: 'not-allowed' })
    expect(await call(C.revokeKey, editor, keyId)).toEqual({ ok: false, reason: 'not-allowed' })
    expect(mocks.showOpenDialog).not.toHaveBeenCalled()
    expect(engine.registerTrustedPackKey).not.toHaveBeenCalled()
    expect(engine.removeTrustedPackKey).not.toHaveBeenCalled()
    expect(engine.revokePackKey).not.toHaveBeenCalled()
  })

  it('lists the current tenant keys and revocations, ignoring a tenant argument', async () => {
    engine.readTrustedPackKeys.mockResolvedValue([
      { keyId, label: 'Acme', publicKeyPem: 'PUBLIC', addedAt: '2026-01-01T00:00:00.000Z' },
    ])
    engine.readRevokedPackKeys.mockResolvedValue({
      keys: [{ keyId, revokedAt: '2026-01-02T00:00:00.000Z', reason: 'lost' }],
      unreadable: false,
    })
    const result = await call(C.listKeys, main, 'tenant-b')
    expect(result).toMatchObject({
      ok: true,
      keys: [{ keyId, label: 'Acme' }],
      revoked: [{ keyId, reason: 'lost' }],
    })
    expect(engine.readTrustedPackKeys).toHaveBeenCalledWith(store)
    expect(engine.readRevokedPackKeys).toHaveBeenCalledWith(store)
    expect(JSON.stringify(result)).not.toContain('PUBLIC')
  })

  it('refuses a private key PEM without writing anything', async () => {
    mocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/private.pem'] })
    const { privateKey } = generateKeyPairSync('ed25519')
    fs.readFile.mockResolvedValue(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString())
    const { TenantPackError } = await import('@naddle/template-packs')
    engine.inspectPublicKeyPem.mockImplementation(() => {
      throw new TenantPackError('bad-key', 'A private key cannot be registered as a trust root')
    })

    const result = await call(C.registerKey, main)
    expect(result).toMatchObject({ ok: false, reason: 'bad-key' })
    expect(engine.registerTrustedPackKey).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain('BEGIN')
  })

  it('registers a public key after the key-id confirmation', async () => {
    mocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/acme.pub.pem'] })
    const { publicKey } = generateKeyPairSync('ed25519')
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
    fs.readFile.mockResolvedValue(publicKeyPem)
    engine.inspectPublicKeyPem.mockReturnValue({ keyId, publicKeyPem })
    engine.registerTrustedPackKey.mockResolvedValue({ keyId, label: 'acme.pub', publicKeyPem: '' })

    const result = await call(C.registerKey, main)
    expect(result.ok).toBe(true)
    expect(mocks.showMessageBox).toHaveBeenCalledTimes(1)
    expect(engine.registerTrustedPackKey).toHaveBeenCalledWith(store, {
      publicKeyPem,
      label: 'acme.pub',
    })
    expect(JSON.stringify(result)).not.toContain('BEGIN')
  })

  it('removes and revokes a key by id only', async () => {
    engine.removeTrustedPackKey.mockResolvedValue(true)
    engine.revokePackKey.mockResolvedValue({ keyId })

    expect(await call(C.removeKey, main, keyId, 'tenant-b')).toMatchObject({ ok: true })
    expect(engine.removeTrustedPackKey).toHaveBeenCalledWith(store, keyId)

    expect(await call(C.revokeKey, main, keyId)).toMatchObject({ ok: true })
    expect(engine.revokePackKey).toHaveBeenCalledWith(store, keyId)
  })

  it('keeps PEM and absolute paths out of a prepared preview', async () => {
    engine.prepareTenantPackFolder.mockResolvedValue({
      preview: {
        pack: { id: 'acme-pack', name: 'Acme', version: '1.0.0' },
        origin: { kind: 'folder', folder: '/tmp/secret-folder/pack' },
        license: 'proprietary-tenant',
        licenseNormalized: false,
        author: 'Acme',
        entries: [],
        problems: [],
        requiresAttestation: true,
        replacesExisting: false,
        signature: {
          status: 'valid',
          keyId,
          keyLabel: 'Acme',
          signedAt: '2026-01-01T00:00:00.000Z',
          trustSource: 'tenant',
          problems: [],
        },
      },
      root: '/tmp/secret-folder/pack',
      storeDir: store,
      cleanup: [],
    })
    mocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/tmp/secret-folder/pack'],
    })

    const result = await call(C.prepareFolder, main)
    expect(result).toMatchObject({
      ok: true,
      preview: {
        origin: { kind: 'folder', folder: 'pack' },
        signature: { status: 'valid', keyId, keyLabel: 'Acme' },
      },
    })
    const text = JSON.stringify(result)
    expect(text).not.toContain('/tmp/secret-folder')
    expect(text).not.toContain('BEGIN')
  })
})
