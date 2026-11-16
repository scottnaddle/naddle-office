import { mkdir, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { VideoError, throwIfAborted } from './errors'
import { assertHtmlWithinLimit } from './limits'
import { normalizeVideoRequest } from './schedule'
import type {
  EncoderCreateOptions,
  FrameEncoder,
  StageCapture,
  StageOpenOptions,
  VideoRenderResult,
} from './types'

export interface RenderVideoDeps {
  openStage?: (options: StageOpenOptions) => Promise<StageCapture>
  createEncoder?: (options: EncoderCreateOptions) => Promise<FrameEncoder>
}

export interface RenderVideoOptions {
  /** Generated scene HTML, already extracted from the model reply. */
  html: string
  width?: number
  height?: number
  fps?: number
  durationMs?: number
  outPath: string
  signal?: AbortSignal
  partition?: string
  vendorDir?: string
  perFrameTimeoutMs?: number
  /** Overrides the default `frameCount` seconds overall budget, for tests. */
  overallTimeoutMs?: number
  onProgress?: (done: number, total: number) => void
  /** Test seam: stand-ins for the hidden window and the encoder. */
  deps?: RenderVideoDeps
}

/**
 * Renders one HTML scene to a local video. The hidden stage captures frames
 * with a virtual clock and streams them straight into WebCodecs through
 * Mediabunny: MP4 (H.264) when supported, WebM (VP9) otherwise. No audio, no
 * ffmpeg, no model call.
 */
export async function renderVideo(options: RenderVideoOptions): Promise<VideoRenderResult> {
  throwIfAborted(options.signal)
  assertHtmlWithinLimit(options.html)

  const schedule = normalizeVideoRequest({
    width: options.width,
    height: options.height,
    fps: options.fps,
    durationMs: options.durationMs,
  })
  const overallTimeoutMs = options.overallTimeoutMs ?? Math.max(1_000, schedule.frameCount * 1_000)

  const openStage = options.deps?.openStage ?? (await import('./main/stage.js')).openStage
  const createEncoder =
    options.deps?.createEncoder ?? (await import('./encode/webcodecs.js')).createWebCodecsEncoder
  const { stepFrames } = await import('./main/stepper.js')

  await mkdir(dirname(options.outPath), { recursive: true })

  let stage: StageCapture | undefined
  let encoder: FrameEncoder | undefined
  let finished = false

  try {
    stage = await openStage({
      html: options.html,
      width: schedule.width,
      height: schedule.height,
      overallTimeoutMs,
      perFrameTimeoutMs: options.perFrameTimeoutMs,
      partition: options.partition,
      vendorDir: options.vendorDir,
      signal: options.signal,
    })
    encoder = await createEncoder({
      width: schedule.width,
      height: schedule.height,
      fps: schedule.fps,
      outPath: options.outPath,
      signal: options.signal,
    })

    await stepFrames(stage, {
      fps: schedule.fps,
      durationMs: schedule.durationMs,
      signal: options.signal,
      onFrame: (frame) => encoder!.addFrame(frame),
      onProgress: (done, total) => options.onProgress?.(done, total),
    })

    const result = await encoder.finish()
    finished = true
    return {
      path: options.outPath,
      mime: result.mime,
      codec: result.codec,
      usedFallback: result.usedFallback,
      width: schedule.width,
      height: schedule.height,
      frameCount: schedule.frameCount,
      durationMs: schedule.durationMs,
      clamped: schedule.clamped,
    }
  } catch (error) {
    if (encoder && !finished) await encoder.cancel().catch(() => {})
    await rm(options.outPath, { force: true }).catch(() => {})
    if (options.signal?.aborted) {
      throw new VideoError('canceled', 'Video render canceled', { cause: error })
    }
    throw error
  } finally {
    stage?.dispose()
  }
}
