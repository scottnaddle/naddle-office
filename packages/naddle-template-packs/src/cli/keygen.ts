/**
 * Generate an Ed25519 key pair for signing tenant packs, offline.
 *
 * The private key is written with mode 0600 next to its public half. The
 * command refuses an output folder inside a git work tree, so keys cannot be
 * created in the repository by accident. It prints only the key id and paths.
 */
import { generateKeyPairSync } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { keyIdOfPublicKey, publicKeyPemOf } from '../signature'
import { CliError, type CliIo } from './sign-pack'

function hasGitAncestor(path: string): boolean {
  let current = resolve(path)
  while (true) {
    if (existsSync(join(current, '.git'))) return true
    const parent = dirname(current)
    if (parent === current) return false
    current = parent
  }
}

/** File name part: key ids use `:`, which Windows file names cannot hold. */
function keyFileStem(keyId: string): string {
  const hex = keyId.includes(':') ? keyId.slice(keyId.indexOf(':') + 1) : keyId
  return `ed25519-${hex}`
}

export interface GeneratedKey {
  keyId: string
  publicKeyPath: string
  privateKeyPath: string
}

/** Generate a key pair in `outDir`. The private key file is mode 0600. */
export async function generatePackKey(outDir: string): Promise<GeneratedKey> {
  const target = resolve(outDir)
  if (hasGitAncestor(target)) {
    throw new CliError('Refusing to write keys inside a git work tree', 2)
  }
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const keyId = keyIdOfPublicKey(publicKey)
  const stem = keyFileStem(keyId)
  const publicKeyPath = join(target, `${stem}.pub.pem`)
  const privateKeyPath = join(target, `${stem}.key.pem`)
  await mkdir(target, { recursive: true })
  await writeFile(privateKeyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), {
    mode: 0o600,
    flag: 'wx',
  })
  await writeFile(publicKeyPath, publicKeyPemOf(publicKey), { flag: 'wx' })
  return { keyId, publicKeyPath, privateKeyPath }
}

function parseFlag(argv: readonly string[], name: string): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!
    if (arg === name) return argv[index + 1]
    const prefix = `${name}=`
    if (arg.startsWith(prefix)) return arg.slice(prefix.length)
  }
  return undefined
}

export async function runKeygenCli(
  argv: readonly string[],
  io: CliIo = {
    out: (message) => process.stdout.write(`${message}\n`),
    err: (message) => process.stderr.write(`${message}\n`),
  },
): Promise<number> {
  try {
    const outDir = parseFlag(argv, '--out-dir')
    if (!outDir) throw new CliError('Usage: keygen --out-dir <folder>', 2)
    const generated = await generatePackKey(outDir)
    io.out(`keyId: ${generated.keyId}`)
    io.out(`public: ${generated.publicKeyPath}`)
    io.out(`private: ${generated.privateKeyPath}`)
    return 0
  } catch (error) {
    if (error instanceof CliError) {
      io.err(error.message)
      return error.exitCode
    }
    io.err('Could not generate the key pair')
    return 1
  }
}

const invokedDirectly =
  Boolean(process.argv[1]) && resolve(process.argv[1]!) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  void runKeygenCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code
  })
}
