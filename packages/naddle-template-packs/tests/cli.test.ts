import { spawnSync } from 'node:child_process'
import { chmodSync, statSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writePack } from './helpers'
import { makeTestKey, writeKeyFiles } from './sign-helpers'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = join(packageRoot, '..', '..')
const signScript = join(packageRoot, 'src', 'cli', 'sign-pack.ts')
const keygenScript = join(packageRoot, 'src', 'cli', 'keygen.ts')

interface RunResult {
  status: number | null
  stdout: string
  stderr: string
}

function run(script: string, args: readonly string[], env: Record<string, string> = {}): RunResult {
  const result = spawnSync(process.execPath, ['--import', 'tsx', script, ...args], {
    cwd: packageRoot,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 90_000,
  })
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

function noKeyMaterial(result: RunResult): void {
  expect(`${result.stdout}${result.stderr}`).not.toContain('BEGIN')
  expect(`${result.stdout}${result.stderr}`).not.toContain('PRIVATE KEY')
}

let work: string
let packRoot: string
let keyDir: string

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'naddle-cli-test-'))
  packRoot = join(work, 'pack')
  keyDir = join(work, 'keys')
})

afterEach(async () => {
  await rm(work, { recursive: true, force: true })
})

describe('signing key input', () => {
  it('exits 2 when the key path is missing and prints no key material', async () => {
    await writePack(packRoot)
    const env = { ...process.env } as Record<string, string>
    delete env.NADDLE_PACK_SIGNING_KEY
    const result = run(signScript, ['sign', packRoot], env)
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('NADDLE_PACK_SIGNING_KEY')
    noKeyMaterial(result)
  })

  it('exits 2 when the key file does not exist', async () => {
    await writePack(packRoot)
    const result = run(signScript, ['sign', packRoot], {
      NADDLE_PACK_SIGNING_KEY: join(work, 'missing.pem'),
    })
    expect(result.status).toBe(2)
    noKeyMaterial(result)
  })

  it('exits 2 when handed a public key', async () => {
    await writePack(packRoot)
    const key = makeTestKey()
    const { publicKeyPath } = await writeKeyFiles(keyDir, key)
    const result = run(signScript, ['sign', packRoot, '--key-file', publicKeyPath])
    expect(result.status).toBe(2)
    noKeyMaterial(result)
  })

  it('refuses a key readable by group or others in strict mode', async () => {
    const key = makeTestKey()
    const { privateKeyPath } = await writeKeyFiles(keyDir, key)
    chmodSync(privateKeyPath, 0o644)
    await writePack(packRoot)
    const result = run(signScript, [
      'sign',
      packRoot,
      '--key-file',
      privateKeyPath,
      '--strict-perms',
    ])
    expect(result.status).toBe(2)
    noKeyMaterial(result)
  })
})

describe('sign', () => {
  it('refuses an invalid pack', async () => {
    const key = makeTestKey()
    const { privateKeyPath } = await writeKeyFiles(keyDir, key)
    await writePack(packRoot, { omitForm: true })
    const result = run(signScript, ['sign', packRoot, '--key-file', privateKeyPath])
    expect(result.status).toBe(1)
    noKeyMaterial(result)
  })

  it('refuses a pack containing a key file', async () => {
    const key = makeTestKey()
    const { privateKeyPath } = await writeKeyFiles(keyDir, key)
    await writePack(packRoot, { extraFiles: { 'leaked.pem': 'not a real key' } })
    const result = run(signScript, ['sign', packRoot, '--key-file', privateKeyPath])
    expect(result.status).toBe(1)
    noKeyMaterial(result)
  })

  it('signs and verifies a pack round-trip without leaking key material', async () => {
    const key = makeTestKey()
    const { privateKeyPath, publicKeyPath } = await writeKeyFiles(keyDir, key)
    await writePack(packRoot)

    const signed = run(signScript, ['sign', packRoot, '--key-file', privateKeyPath])
    expect(signed.status).toBe(0)
    expect(signed.stdout).toContain(key.keyId)
    expect(signed.stdout).toContain('sidecar:')
    noKeyMaterial(signed)

    const sidecar = await readFile(join(packRoot, 'manifest.sig.json'), 'utf8')
    expect(sidecar).not.toContain('PRIVATE KEY')
    expect(sidecar).not.toContain(key.privatePem)

    const verified = run(signScript, ['verify', packRoot, '--pub', publicKeyPath])
    expect(verified.status).toBe(0)
    expect(verified.stdout).toContain('valid')
    noKeyMaterial(verified)

    await writeFile(join(packRoot, 'forms/leave/assets/leave.hwpx'), 'changed')
    const tampered = run(signScript, ['verify', packRoot, '--pub', publicKeyPath])
    expect(tampered.status).toBe(1)
    noKeyMaterial(tampered)
  })
})

describe('keygen', () => {
  it('writes a key pair with a private mode and no output key bytes', async () => {
    const result = run(keygenScript, ['--out-dir', keyDir])
    expect(result.status).toBe(0)
    noKeyMaterial(result)
    const publicPath = /public: (.+)/.exec(result.stdout)?.[1]?.trim()
    const privatePath = /private: (.+)/.exec(result.stdout)?.[1]?.trim()
    expect(publicPath).toBeTruthy()
    expect(privatePath).toBeTruthy()
    if (process.platform !== 'win32') {
      const mode = statSync(privatePath!).mode & 0o777
      expect(mode & 0o077).toBe(0)
    }
  })

  it('refuses an output folder inside a git work tree', async () => {
    const result = run(keygenScript, ['--out-dir', repoRoot])
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('git work tree')
    noKeyMaterial(result)
  })
})
