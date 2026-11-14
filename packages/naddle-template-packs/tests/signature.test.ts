import { mkdir, mkdtemp, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  PACK_SIGNATURE_FILE,
  buildPackPayload,
  canonicalPayloadBytes,
  installedFormPath,
  installTenantPack,
  listTenantPacks,
  loadSignatureTrust,
  packSkillFolders,
  registerTrustedPackKey,
  revokePackKey,
  tenantPackStoreDir,
  validateTenantPack,
  verifyPackSignature,
  type PackPayload,
  type PackSignatureTrust,
  type TenantPackPreview,
} from '../src/index'
import { makeForm, sha256, writePack } from './helpers'
import { makeTestKey, signPackWithKey, trustOf } from './sign-helpers'

let work: string
let storeDir: string
let packRoot: string

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'naddle-signature-test-'))
  storeDir = tenantPackStoreDir(join(work, 'userData'), 'tenant-a')
  packRoot = join(work, 'pack')
})

afterEach(async () => {
  await rm(work, { recursive: true, force: true })
})

async function validate(root: string, trust: PackSignatureTrust): Promise<TenantPackPreview> {
  const folders = await packSkillFolders(root)
  return validateTenantPack(root, {
    origin: { kind: 'folder', folder: root },
    candidates: folders.map((rel) => ({ rel })),
    signatureTrust: trust,
  })
}

async function install(
  root: string,
  preview: TenantPackPreview,
  targetStore = storeDir,
): Promise<void> {
  await installTenantPack(root, preview, targetStore, { attested: true })
}

async function signedPack(signedAt?: string) {
  const key = makeTestKey()
  await writePack(packRoot)
  await signPackWithKey(packRoot, key, signedAt)
  return { key, trust: trustOf([key]) }
}

describe('signature acceptance', () => {
  it('accepts a valid signature, installs and records it in the index', async () => {
    const { key, trust } = await signedPack()
    const preview = await validate(packRoot, trust)
    expect(preview.problems).toEqual([])
    expect(preview.signature.status).toBe('valid')
    expect(preview.signature.keyId).toBe(key.keyId)
    expect(preview.signature.keyLabel).toBe(key.label)

    await registerTrustedPackKey(storeDir, { publicKeyPem: key.publicPem, label: key.label })
    await install(packRoot, preview)

    const [pack] = await listTenantPacks(storeDir)
    expect(pack?.verified).toBe(true)
    expect(pack?.signatureStatus).toBe('valid')
    expect(pack?.signatureInfo.keyId).toBe(key.keyId)
    expect(await installedFormPath(storeDir, 'acme-pack', 'leave-form')).toContain('leave.hwpx')
  })

  it('keeps unsigned packs installable under the default policy', async () => {
    await writePack(packRoot)
    const preview = await validate(packRoot, trustOf([]))
    expect(preview.signature.status).toBe('unsigned')
    expect(preview.problems).toEqual([])
    await install(packRoot, preview)
    const [pack] = await listTenantPacks(storeDir)
    expect(pack?.verified).toBe(true)
    expect(pack?.signatureStatus).toBe('unsigned')
  })

  it('rejects a signature made with another key', async () => {
    const keyA = makeTestKey('A')
    const keyB = makeTestKey('B')
    await writePack(packRoot)
    const signed = await signPackWithKey(packRoot, keyA)
    const forged = {
      ...signed.sidecar,
      payload: { ...signed.sidecar.payload, keyId: keyB.keyId },
    }
    await writeFile(join(packRoot, PACK_SIGNATURE_FILE), JSON.stringify(forged))
    const info = await verifyPackSignature(packRoot, trustOf([keyB]))
    expect(info.status).toBe('bad-signature')
  })

  it('rejects a flipped signature bit, a truncated signature and bad base64', async () => {
    const key = makeTestKey()
    await writePack(packRoot)
    const signed = await signPackWithKey(packRoot, key)
    const signature = Buffer.from(signed.sidecar.signature, 'base64')
    signature[0] = (signature[0]! ^ 0xff) & 0xff
    await writeFile(
      join(packRoot, PACK_SIGNATURE_FILE),
      JSON.stringify({ ...signed.sidecar, signature: signature.toString('base64') }),
    )
    expect((await verifyPackSignature(packRoot, trustOf([key]))).status).toBe('bad-signature')

    await writeFile(
      join(packRoot, PACK_SIGNATURE_FILE),
      JSON.stringify({
        ...signed.sidecar,
        signature: Buffer.alloc(63).toString('base64'),
      }),
    )
    expect((await verifyPackSignature(packRoot, trustOf([key]))).status).toBe('malformed')

    await writeFile(
      join(packRoot, PACK_SIGNATURE_FILE),
      JSON.stringify({ ...signed.sidecar, signature: 'not base64!' }),
    )
    expect((await verifyPackSignature(packRoot, trustOf([key]))).status).toBe('malformed')
  })

  it('rejects sidecars with unknown keys or a non-Ed25519 algorithm', async () => {
    const key = makeTestKey()
    await writePack(packRoot)
    const signed = await signPackWithKey(packRoot, key)
    await writeFile(
      join(packRoot, PACK_SIGNATURE_FILE),
      JSON.stringify({ ...signed.sidecar, extra: true }),
    )
    expect((await verifyPackSignature(packRoot, trustOf([key]))).status).toBe('malformed')

    await writeFile(
      join(packRoot, PACK_SIGNATURE_FILE),
      JSON.stringify({
        ...signed.sidecar,
        payload: { ...signed.sidecar.payload, alg: 'rsa' },
      }),
    )
    expect((await verifyPackSignature(packRoot, trustOf([key]))).status).toBe('malformed')
  })

  it('refuses a sidecar in a subfolder', async () => {
    const key = makeTestKey()
    await writePack(packRoot, { extraFiles: { 'nested/manifest.sig.json': '{}' } })
    const preview = await validate(packRoot, trustOf([key]))
    expect(preview.problems.join('\n')).toContain('file is not allowed')
  })
})

describe('canonical payload', () => {
  it('serializes a fixed payload to the exact golden bytes', () => {
    const payload: PackPayload = {
      alg: 'ed25519',
      files: [{ path: 'manifest.json', sha256: 'a'.repeat(64), size: 12 }],
      format: 'naddle-pack-signature-payload',
      keyId: `ed25519:${'b'.repeat(32)}`,
      pack: { id: 'acme-pack', version: '1.0.0' },
      signedAt: '2026-01-02T03:04:05.000Z',
      v: 1,
    }
    const expected =
      '{"alg":"ed25519","files":[{"path":"manifest.json","sha256":"' +
      'a'.repeat(64) +
      '","size":12}],"format":"naddle-pack-signature-payload","keyId":"ed25519:' +
      'b'.repeat(32) +
      '","pack":{"id":"acme-pack","version":"1.0.0"},"signedAt":"2026-01-02T03:04:05.000Z","v":1}'
    expect(canonicalPayloadBytes(payload).toString('utf8')).toBe(expected)
  })

  it('sorts paths by UTF-8 bytes, not UTF-16 code units', async () => {
    await writePack(packRoot, {
      extraFiles: {
        '\uE000.txt': 'private use',
        '😀.txt': 'emoji',
      },
    })
    const payload = await buildPackPayload(packRoot, {
      keyId: `ed25519:${'c'.repeat(32)}`,
      signedAt: '2026-01-02T03:04:05.000Z',
      pack: { id: 'acme-pack', version: '1.0.0' },
    })
    const paths = payload.files.map((file) => file.path)
    expect(paths.indexOf('\uE000.txt')).toBeLessThan(paths.indexOf('😀.txt'))
  })

  it('rejects two paths that normalize to the same NFC name', async () => {
    await writePack(packRoot, {
      extraFiles: {
        'e\u0301.txt': 'decomposed',
        '\u00e9.txt': 'composed',
      },
    })
    await expect(
      buildPackPayload(packRoot, {
        keyId: `ed25519:${'d'.repeat(32)}`,
        signedAt: '2026-01-02T03:04:05.000Z',
        pack: { id: 'acme-pack', version: '1.0.0' },
      }),
    ).rejects.toMatchObject({ code: 'bad-signature' })
  })
})

describe('files changed after signing', () => {
  it('reports added, removed and changed files as a mismatch', async () => {
    const key = makeTestKey()
    await writePack(packRoot)
    await signPackWithKey(packRoot, key)
    const trust = trustOf([key])

    await writeFile(join(packRoot, 'extra.txt'), 'extra')
    expect((await verifyPackSignature(packRoot, trust)).status).toBe('files-mismatch')
    await unlink(join(packRoot, 'extra.txt'))

    await unlink(join(packRoot, 'forms/leave/assets/leave.hwpx'))
    expect((await verifyPackSignature(packRoot, trust)).status).toBe('files-mismatch')

    await writePack(packRoot)
    await signPackWithKey(packRoot, key)
    await writeFile(join(packRoot, 'forms/leave/assets/leave.hwpx'), 'changed')
    expect((await verifyPackSignature(packRoot, trust)).status).toBe('files-mismatch')
  })

  it('reports a changed pack version as a pack mismatch', async () => {
    const key = makeTestKey()
    await writePack(packRoot)
    await signPackWithKey(packRoot, key)
    const manifest = JSON.parse(await readFile(join(packRoot, 'manifest.json'), 'utf8')) as {
      pack: { version: string }
    }
    manifest.pack.version = '9.9.9'
    await writeFile(join(packRoot, 'manifest.json'), JSON.stringify(manifest))
    expect((await verifyPackSignature(packRoot, trustOf([key]))).status).toBe('pack-mismatch')
  })
})

describe('trust, revocation and expiry', () => {
  it('reports an unregistered key', async () => {
    const key = makeTestKey()
    await writePack(packRoot)
    await signPackWithKey(packRoot, key)
    expect((await verifyPackSignature(packRoot, trustOf([]))).status).toBe('unknown-key')
  })

  it('fails a revoked key regardless of signed time', async () => {
    const key = makeTestKey()
    await writePack(packRoot)
    await signPackWithKey(packRoot, key)
    expect((await verifyPackSignature(packRoot, trustOf([key], [key.keyId]))).status).toBe(
      'revoked-key',
    )
  })

  it('rejects a pack signed after notAfter but keeps earlier packs valid', async () => {
    const key = makeTestKey()
    await writePack(packRoot)
    await signPackWithKey(packRoot, key, '2026-02-01T00:00:00.000Z')
    const expired = trustOf([key], [], {
      notAfterByKey: { [key.keyId]: '2026-01-01T00:00:00.000Z' },
    })
    expect((await verifyPackSignature(packRoot, expired)).status).toBe('expired-key')
    const stillFine = trustOf([key], [], {
      notAfterByKey: { [key.keyId]: '2026-03-01T00:00:00.000Z' },
    })
    expect((await verifyPackSignature(packRoot, stillFine)).status).toBe('valid')
  })

  it('fails closed when the revocation store cannot be read', async () => {
    const key = makeTestKey()
    await writePack(packRoot)
    await signPackWithKey(packRoot, key)
    await mkdir(storeDir, { recursive: true })
    await writeFile(join(storeDir, 'revoked-keys.json'), '{broken')
    const trust = await loadSignatureTrust(storeDir)
    expect(trust.revokedUnreadable).toBe(true)
    expect((await verifyPackSignature(packRoot, trust)).status).toBe('trust-store-unreadable')
  })
})

describe('installed packs', () => {
  it('fails list and use when an installed form changes', async () => {
    const { key, trust } = await signedPack()
    await registerTrustedPackKey(storeDir, { publicKeyPem: key.publicPem, label: key.label })
    await install(packRoot, await validate(packRoot, trust))

    await writeFile(join(storeDir, 'acme-pack', 'forms/leave/assets/leave.hwpx'), 'tampered')
    const [pack] = await listTenantPacks(storeDir)
    expect(pack?.verified).toBe(false)
    expect(await installedFormPath(storeDir, 'acme-pack', 'leave-form')).toBeUndefined()
  })

  it('reports a missing sidecar after installation', async () => {
    const { key, trust } = await signedPack()
    await registerTrustedPackKey(storeDir, { publicKeyPem: key.publicPem, label: key.label })
    await install(packRoot, await validate(packRoot, trust))
    await unlink(join(storeDir, 'acme-pack', PACK_SIGNATURE_FILE))
    const [pack] = await listTenantPacks(storeDir)
    expect(pack?.verified).toBe(false)
    expect(pack?.signatureStatus).toBe('missing-signature')
    expect(await installedFormPath(storeDir, 'acme-pack', 'leave-form')).toBeUndefined()
  })

  it('fails list and use after the key is revoked', async () => {
    const { key, trust } = await signedPack()
    await registerTrustedPackKey(storeDir, { publicKeyPem: key.publicPem, label: key.label })
    await install(packRoot, await validate(packRoot, trust))
    await revokePackKey(storeDir, key.keyId)
    const [pack] = await listTenantPacks(storeDir)
    expect(pack?.verified).toBe(false)
    expect(pack?.signatureStatus).toBe('revoked-key')
    expect(await installedFormPath(storeDir, 'acme-pack', 'leave-form')).toBeUndefined()
  })

  it('does not downgrade a corrupt index signature to unsigned', async () => {
    const { key, trust } = await signedPack()
    await registerTrustedPackKey(storeDir, { publicKeyPem: key.publicPem, label: key.label })
    await install(packRoot, await validate(packRoot, trust))
    const indexPath = join(storeDir, 'index.json')
    const index = JSON.parse(await readFile(indexPath, 'utf8')) as {
      packs: Array<{ signature: unknown }>
    }
    index.packs[0]!.signature = { alg: 'rsa', keyId: 'x' }
    await writeFile(indexPath, JSON.stringify(index))
    const [pack] = await listTenantPacks(storeDir)
    expect(pack?.verified).toBe(false)
    expect(pack?.signatureStatus).toBe('bad-signature')
    expect(await installedFormPath(storeDir, 'acme-pack', 'leave-form')).toBeUndefined()
  })

  it('keeps rejecting a signed pack that also carries a macro', async () => {
    const key = makeTestKey()
    const macroForm = await makeForm({ add: (zip) => zip.file('word/vbaProject.bin', 'macro') })
    await writePack(packRoot, { formBytes: macroForm, sha256: sha256(macroForm) })
    await signPackWithKey(packRoot, key)
    const preview = await validate(packRoot, trustOf([key]))
    expect(preview.signature.status).toBe('valid')
    expect(preview.problems.join('\n')).toContain('may not carry macros')
    await expect(install(packRoot, preview)).rejects.toMatchObject({ code: 'invalid-pack' })
  })

  it('keeps another tenant key unknown', async () => {
    const key = makeTestKey()
    await writePack(packRoot)
    const signed = await signPackWithKey(packRoot, key)
    expect(signed.sidecar.payload.keyId).toBe(key.keyId)
    const storeB = tenantPackStoreDir(join(work, 'userData'), 'tenant-b')
    const preview = await validate(packRoot, trustOf([key]))
    await expect(install(packRoot, preview, storeB)).rejects.toMatchObject({
      code: 'unknown-key',
    })
  })

  it('rejects an install whose files change between preview and staging check', async () => {
    const { key, trust } = await signedPack()
    await registerTrustedPackKey(storeDir, { publicKeyPem: key.publicPem, label: key.label })
    const preview = await validate(packRoot, trust)
    await writeFile(join(packRoot, 'forms/leave/assets/leave.hwpx'), 'changed later')
    await expect(install(packRoot, preview)).rejects.toMatchObject({ code: 'bad-signature' })
  })

  it('rejects a pack whose sidecar is renamed away before install', async () => {
    const { key, trust } = await signedPack()
    await registerTrustedPackKey(storeDir, { publicKeyPem: key.publicPem, label: key.label })
    const preview = await validate(packRoot, trust)
    await rename(join(packRoot, PACK_SIGNATURE_FILE), join(packRoot, 'manifest.sig.json.bak'))
    await expect(install(packRoot, preview)).rejects.toMatchObject({ code: 'bad-signature' })
  })
})
