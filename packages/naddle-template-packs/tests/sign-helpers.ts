import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
} from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PACK_SIGNATURE_FILE } from '../src/constants'
import {
  buildPackPayload,
  canonicalPayloadBytes,
  keyIdOfPublicKey,
  publicKeyPemOf,
  type PackPayload,
  type PackSignatureSidecar,
  type PackSignatureTrust,
} from '../src/signature'

export interface TestKey {
  privatePem: string
  publicPem: string
  keyId: string
  label: string
}

/** A runtime key pair; no key material is ever written into the repository. */
export function makeTestKey(label = 'Acme signing key'): TestKey {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  return {
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicPem: publicKeyPemOf(publicKey),
    keyId: keyIdOfPublicKey(publicKey),
    label,
  }
}

export function trustOf(
  keys: readonly TestKey[],
  revokedKeyIds: readonly string[] = [],
  options: { notAfterByKey?: Readonly<Record<string, string>>; revokedUnreadable?: boolean } = {},
): PackSignatureTrust {
  return {
    trustedKeys: keys.map((key) => ({
      keyId: key.keyId,
      label: key.label,
      publicKeyPem: key.publicPem,
      source: 'tenant' as const,
      ...(options.notAfterByKey?.[key.keyId] ? { notAfter: options.notAfterByKey[key.keyId] } : {}),
    })),
    revokedKeys: revokedKeyIds.map((keyId) => ({ keyId })),
    revokedUnreadable: options.revokedUnreadable === true,
  }
}

export interface SignedPack {
  payload: PackPayload
  sidecar: PackSignatureSidecar
  bytes: Buffer
  sidecarPath: string
}

/** Write `manifest.sig.json` over the current pack files. */
export async function signPackWithKey(
  root: string,
  key: TestKey,
  signedAt = '2026-01-02T03:04:05.000Z',
): Promise<SignedPack> {
  const raw = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8')) as {
    pack: { id: string; version: string }
  }
  const payload = await buildPackPayload(root, {
    keyId: key.keyId,
    signedAt,
    pack: { id: raw.pack.id, version: raw.pack.version },
  })
  const bytes = canonicalPayloadBytes(payload)
  const signature = cryptoSign(null, bytes, createPrivateKey(key.privatePem))
  const sidecar: PackSignatureSidecar = {
    format: 'naddle-pack-signature',
    v: 1,
    payload,
    signature: signature.toString('base64'),
  }
  const sidecarPath = join(root, PACK_SIGNATURE_FILE)
  await writeFile(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`)
  return { payload, sidecar, bytes, sidecarPath }
}

export async function writeKeyFiles(
  dir: string,
  key: TestKey,
): Promise<{ privateKeyPath: string; publicKeyPath: string }> {
  await mkdir(dir, { recursive: true })
  const privateKeyPath = join(dir, 'private.pem')
  const publicKeyPath = join(dir, 'public.pem')
  await writeFile(privateKeyPath, key.privatePem, { mode: 0o600 })
  await writeFile(publicKeyPath, key.publicPem)
  return { privateKeyPath, publicKeyPath }
}

/** Read a public key PEM and return it unchanged, for trust fixtures. */
export function publicKeyOf(key: TestKey): string {
  return publicKeyPemOf(createPublicKey(key.publicPem))
}
