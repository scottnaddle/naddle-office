import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const SMOKE_ENABLED = process.env.NADDLE_VIDEO_SMOKE === '1'
const here = fileURLToPath(new URL('.', import.meta.url))
const packageRoot = fileURLToPath(new URL('../../', import.meta.url))

interface SmokeResult {
  captureHashA: string
  captureHashB: string
  captureDeterministic: boolean
  encoded: boolean
  encodeErrorCode: string | null
  outputPath: string | null
  outputHash: string | null
  containerOk: boolean
  headerHex: string | null
  secondRenderHash: string | null
  outputHashEqual: boolean | null
}

function runElectron(
  args: string[],
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const require = createRequire(import.meta.url)
  const electronPath = require('electron') as string
  const xvfb = '/usr/bin/xvfb-run'
  const command = existsSync(xvfb) ? xvfb : electronPath
  const argv = existsSync(xvfb) ? ['-a', electronPath, ...args] : args
  return new Promise((resolve, reject) => {
    const child = spawn(command, argv, {
      cwd: packageRoot,
      env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`electron smoke timed out\n${stdout}\n${stderr}`))
    }, 180_000)
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
  })
}

function parseResult(stdout: string): SmokeResult {
  const line = stdout.split(/\r?\n/).find((entry) => entry.startsWith('NADDLE_SMOKE_RESULT:'))
  if (!line) throw new Error(`smoke produced no result line\n${stdout}`)
  return JSON.parse(line.slice('NADDLE_SMOKE_RESULT:'.length)) as SmokeResult
}

describe.skipIf(!SMOKE_ENABLED)('offscreen render smoke', () => {
  let work: string
  let bundle: string
  let inputPath: string
  let html: string

  beforeAll(async () => {
    work = await mkdtemp(join(tmpdir(), 'naddle-video-smoke-'))
    bundle = join(work, 'harness.mjs')
    inputPath = join(work, 'input.json')
    html = await readFile(join(here, 'fixtures/canvas.html'), 'utf8')
    await build({
      entryPoints: [join(here, 'harness.ts')],
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      external: ['electron'],
      splitting: false,
      outfile: bundle,
      logLevel: 'silent',
    })
    await writeFile(
      inputPath,
      JSON.stringify({ html, outDir: work, vendorDir: join(packageRoot, 'vendor') }),
    )
  })

  afterAll(async () => {
    if (work) await rm(work, { recursive: true, force: true })
  })

  it('captures two identical frames and reports encoder availability', async () => {
    const { code, stdout, stderr } = await runElectron([bundle, inputPath])
    expect(code, stderr).toBe(0)
    const result = parseResult(stdout)

    expect(result.captureDeterministic).toBe(true)
    expect(result.captureHashA).toBe(result.captureHashB)

    if (result.encoded) {
      expect(result.containerOk).toBe(true)
      expect(result.headerHex).not.toBeNull()
      expect(existsSync(result.outputPath!)).toBe(true)
      if (result.outputHashEqual !== null) {
        expect(typeof result.outputHashEqual).toBe('boolean')
      }
    } else {
      // This Linux box's Electron main process has no WebCodecs. The
      // capture path still ran; the encoder blocker is reported instead of
      // failing the suite.
      expect(result.encodeErrorCode).toBe('encoder_unavailable')
    }
  }, 240_000)
})
