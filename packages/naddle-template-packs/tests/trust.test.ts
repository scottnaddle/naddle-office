import { generateKeyPairSync } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  BUILTIN_PACK_KEYS,
  REVOKED_PACK_KEYS,
  inspectPublicKeyPem,
  loadSignatureTrust,
  readRevokedPackKeys,
  readTrustedPackKeys,
  registerTrustedPackKey,
  removeTrustedPackKey,
  revokePackKey,
  tenantPackStoreDir,
} from '../src/index'
import { makeTestKey } from './sign-helpers'

let work: string
let storeDir: string

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'naddle-trust-test-'))
  storeDir = tenantPackStoreDir(join(work, 'userData'), 'tenant-a')
})

afterEach(async () => {
  await rm(work, { recursive: true, force: true })
})

const keysDir = fileURLToPath(new URL('../keys', import.meta.url))

describe('trusted key registration', () => {
  it('registers a public key and reads its key id back', async () => {
    const key = makeTestKey()
    const registered = await registerTrustedPackKey(storeDir, {
      publicKeyPem: key.publicPem,
      label: 'Acme',
      now: new Date('2026-01-01T00:00:00.000Z'),
    })
    expect(registered.keyId).toBe(key.keyId)
    const keys = await readTrustedPackKeys(storeDir)
    expect(keys).toHaveLength(1)
    expect(keys[0]?.keyId).toBe(key.keyId)
    expect(keys[0]?.label).toBe('Acme')
    const raw = await readFile(join(storeDir, 'trusted-keys.json'), 'utf8')
    expect(raw).toContain(key.keyId)
    expect(raw).not.toContain('PRIVATE KEY')
  })

  it('rejects a private key and writes nothing', async () => {
    const key = makeTestKey()
    await expect(
      registerTrustedPackKey(storeDir, { publicKeyPem: key.privatePem, label: 'nope' }),
    ).rejects.toMatchObject({ code: 'bad-key' })
    await expect(readFile(join(storeDir, 'trusted-keys.json'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('rejects RSA and EC public keys', async () => {
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const rsaPem = rsa.publicKey.export({ type: 'spki', format: 'pem' }).toString()
    await expect(registerTrustedPackKey(storeDir, { publicKeyPem: rsaPem })).rejects.toMatchObject({
      code: 'bad-key',
    })

    const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    const ecPem = ec.publicKey.export({ type: 'spki', format: 'pem' }).toString()
    await expect(registerTrustedPackKey(storeDir, { publicKeyPem: ecPem })).rejects.toMatchObject({
      code: 'bad-key',
    })
  })

  it('stores the same key id once', async () => {
    const key = makeTestKey()
    await registerTrustedPackKey(storeDir, { publicKeyPem: key.publicPem })
    await registerTrustedPackKey(storeDir, { publicKeyPem: key.publicPem })
    expect(await readTrustedPackKeys(storeDir)).toHaveLength(1)
  })

  it('removes and revokes a key', async () => {
    const key = makeTestKey()
    await registerTrustedPackKey(storeDir, { publicKeyPem: key.publicPem })
    expect(await removeTrustedPackKey(storeDir, key.keyId)).toBe(true)
    expect(await readTrustedPackKeys(storeDir)).toHaveLength(0)

    await revokePackKey(storeDir, key.keyId, {
      reason: 'lost laptop',
      now: new Date('2026-01-02T00:00:00.000Z'),
    })
    const revoked = await readRevokedPackKeys(storeDir)
    expect(revoked.unreadable).toBe(false)
    expect(revoked.keys[0]?.keyId).toBe(key.keyId)
    expect(revoked.keys[0]?.reason).toBe('lost laptop')
  })
})

describe('built-in key material', () => {
  it('ships no official key', () => {
    expect(BUILTIN_PACK_KEYS).toEqual([])
    expect(REVOKED_PACK_KEYS).toEqual([])
  })

  it('contains no private key in the keys folder', async () => {
    const files = await readdir(keysDir)
    expect(files.sort()).toEqual(['README.md'])
    for (const file of files) {
      const text = await readFile(join(keysDir, file), 'utf8')
      expect(text).not.toContain('PRIVATE KEY')
    }
  })
})

describe('corrupt trust files', () => {
  it('reads a corrupt trusted-keys file as no tenant keys', async () => {
    await mkdir(storeDir, { recursive: true })
    await writeFile(join(storeDir, 'trusted-keys.json'), '{broken')
    expect(await readTrustedPackKeys(storeDir)).toEqual([])
    const trust = await loadSignatureTrust(storeDir)
    expect(trust.trustedKeys).toEqual([])
    expect(trust.revokedUnreadable).toBe(false)
  })

  it('marks a corrupt revoked-keys file as unreadable', async () => {
    await mkdir(storeDir, { recursive: true })
    await writeFile(join(storeDir, 'revoked-keys.json'), '{broken')
    const revoked = await readRevokedPackKeys(storeDir)
    expect(revoked.unreadable).toBe(true)
    expect((await loadSignatureTrust(storeDir)).revokedUnreadable).toBe(true)
  })

  it('reads a malformed key entry as skipped, not as trust', async () => {
    const key = makeTestKey()
    await mkdir(storeDir, { recursive: true })
    await writeFile(
      join(storeDir, 'trusted-keys.json'),
      JSON.stringify({
        schemaVersion: 1,
        keys: [{ keyId: 'ed25519:not-hex', publicKeyPem: key.publicPem, label: 'bad' }],
      }),
    )
    expect(await readTrustedPackKeys(storeDir)).toEqual([])
  })

  it('computes the key id from the PEM, not the stored claim', () => {
    const key = makeTestKey()
    expect(inspectPublicKeyPem(key.publicPem).keyId).toBe(key.keyId)
  })
})
