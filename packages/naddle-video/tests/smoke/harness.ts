/**
 * Electron main entry for the render smoke. The vitest test bundles this file
 * with esbuild and launches it under xvfb; it is not part of the unit suite.
 */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, protocol } from 'electron'
import { openStage } from '../../src/main/stage'
import { renderVideo } from '../../src/render-job'
import { VIDEO_SCHEME_PRIVILEGES } from '../../src/schemes'

interface SmokeInput {
  html: string
  outDir: string
  vendorDir: string
}

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

app.on('window-all-closed', () => {})
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu')

protocol.registerSchemesAsPrivileged([...VIDEO_SCHEME_PRIVILEGES])

async function hashFrame(input: SmokeInput): Promise<string> {
  const stage = await openStage({
    html: input.html,
    width: 320,
    height: 180,
    overallTimeoutMs: 120_000,
    perFrameTimeoutMs: 20_000,
    vendorDir: input.vendorDir,
  })
  try {
    const frame = await stage.seekFrame(500)
    return createHash('sha256').update(frame.data).digest('hex')
  } finally {
    stage.dispose()
  }
}

async function hashFile(path: string): Promise<string> {
  const bytes = await readFile(path)
  return createHash('sha256').update(bytes).digest('hex')
}

function containerLooksValid(bytes: Uint8Array): boolean {
  const head = Buffer.from(bytes.subarray(0, 16)).toString('latin1')
  if (head.slice(4, 8) === 'ftyp') {
    return Buffer.from(bytes).includes(Buffer.from('moov'))
  }
  // EBML magic for WebM/Matroska
  return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3
}

async function run(): Promise<SmokeResult> {
  const inputPath = process.argv[2]
  if (!inputPath) throw new Error('missing smoke input path')
  const input = JSON.parse(await readFile(inputPath, 'utf8')) as SmokeInput

  const captureHashA = await hashFrame(input)
  const captureHashB = await hashFrame(input)

  const outputPath = join(input.outDir, 'smoke-output.mp4')
  const result: SmokeResult = {
    captureHashA,
    captureHashB,
    captureDeterministic: captureHashA === captureHashB,
    encoded: false,
    encodeErrorCode: null,
    outputPath: null,
    outputHash: null,
    containerOk: false,
    headerHex: null,
    secondRenderHash: null,
    outputHashEqual: null,
  }

  try {
    const rendered = await renderVideo({
      html: input.html,
      width: 320,
      height: 180,
      fps: 15,
      durationMs: 2_000,
      outPath: outputPath,
      vendorDir: input.vendorDir,
      perFrameTimeoutMs: 20_000,
      overallTimeoutMs: 120_000,
    })
    const bytes = await readFile(rendered.path)
    result.encoded = true
    result.outputPath = rendered.path
    result.outputHash = await hashFile(rendered.path)
    result.containerOk = containerLooksValid(bytes)
    result.headerHex = Buffer.from(bytes.subarray(0, 16)).toString('hex')

    const secondPath = join(input.outDir, 'smoke-output-2.mp4')
    const second = await renderVideo({
      html: input.html,
      width: 320,
      height: 180,
      fps: 15,
      durationMs: 2_000,
      outPath: secondPath,
      vendorDir: input.vendorDir,
      perFrameTimeoutMs: 20_000,
      overallTimeoutMs: 120_000,
    })
    result.secondRenderHash = await hashFile(second.path)
    result.outputHashEqual = result.secondRenderHash === result.outputHash
  } catch (error) {
    result.encodeErrorCode =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code: unknown }).code)
        : String(error)
  }
  return result
}

app
  .whenReady()
  .then(run)
  .then(async (result) => {
    process.stdout.write(`NADDLE_SMOKE_RESULT:${JSON.stringify(result)}\n`)
    app.quit()
  })
  .catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined
    const cause =
      error && typeof error === 'object' && 'cause' in error
        ? String((error as { cause: unknown }).cause)
        : null
    process.stdout.write(`NADDLE_SMOKE_ERROR:${JSON.stringify({ message, stack, cause })}\n`)
    process.exitCode = 1
    app.quit()
  })
