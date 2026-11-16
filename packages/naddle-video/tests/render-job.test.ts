import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VideoError } from '../src/errors'
import { renderVideo } from '../src/render-job'
import type {
  EncoderCreateOptions,
  FrameEncoder,
  StageCapture,
  StageFrame,
  StageOpenOptions,
} from '../src/types'

const HTML = '<!doctype html><html><body><canvas></canvas></body></html>'

function frame(time: number): StageFrame {
  return {
    data: new Uint8Array(4),
    width: 320,
    height: 180,
    format: 'BGRA',
    timestampMs: time,
  }
}

let work: string
let outPath: string

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'naddle-video-job-'))
  outPath = join(work, 'out.mp4')
})

afterEach(async () => {
  await rm(work, { recursive: true, force: true })
})

describe('renderVideo', () => {
  it('open, steps every frame, finishes and disposes the stage', async () => {
    const openCalls: StageOpenOptions[] = []
    const encoderCalls: EncoderCreateOptions[] = []
    const frames: number[] = []
    const progress: Array<[number, number]> = []
    let disposed = 0

    const stage: StageCapture = {
      width: 320,
      height: 180,
      async seekFrame(ms) {
        return frame(ms)
      },
      dispose() {
        disposed++
      },
    }
    const encoder: FrameEncoder = {
      choice: { codec: 'avc', container: 'mp4', mime: 'video/mp4', usedFallback: false },
      async addFrame(captured) {
        frames.push(captured.timestampMs)
      },
      async finish() {
        return { mime: 'video/mp4', codec: 'avc', usedFallback: false }
      },
      async cancel() {},
    }

    const result = await renderVideo({
      html: HTML,
      width: 320,
      height: 180,
      fps: 10,
      durationMs: 300,
      outPath,
      onProgress: (done, total) => progress.push([done, total]),
      deps: {
        openStage: async (options) => {
          openCalls.push(options)
          return stage
        },
        createEncoder: async (options) => {
          encoderCalls.push(options)
          return encoder
        },
      },
    })

    expect(result).toMatchObject({
      path: outPath,
      mime: 'video/mp4',
      codec: 'avc',
      usedFallback: false,
      width: 320,
      height: 180,
      frameCount: 3,
      durationMs: 300,
    })
    expect(openCalls[0]).toMatchObject({ width: 320, height: 180, overallTimeoutMs: 3_000 })
    expect(encoderCalls[0]).toMatchObject({ width: 320, height: 180, fps: 10, outPath })
    expect(frames).toEqual([0, 100, 200])
    expect(progress).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ])
    expect(disposed).toBe(1)
  })

  it('reports the VP9 fallback from the encoder', async () => {
    const result = await renderVideo({
      html: HTML,
      width: 320,
      height: 180,
      fps: 10,
      durationMs: 100,
      outPath: join(work, 'out.webm'),
      deps: {
        openStage: async () => ({
          width: 320,
          height: 180,
          seekFrame: async (ms) => frame(ms),
          dispose() {},
        }),
        createEncoder: async () => ({
          choice: { codec: 'vp9', container: 'webm', mime: 'video/webm', usedFallback: true },
          async addFrame() {},
          async finish() {
            return { mime: 'video/webm', codec: 'vp9', usedFallback: true }
          },
          async cancel() {},
        }),
      },
    })
    expect(result).toMatchObject({ mime: 'video/webm', codec: 'vp9', usedFallback: true })
  })

  it('cancels the encoder, removes the partial file and disposes on failure', async () => {
    await writeFile(outPath, 'partial')
    let canceled = 0
    let disposed = 0
    try {
      await renderVideo({
        html: HTML,
        width: 320,
        height: 180,
        fps: 10,
        durationMs: 300,
        outPath,
        deps: {
          openStage: async () => ({
            width: 320,
            height: 180,
            async seekFrame() {
              throw new VideoError('stage_timeout', 'timed out')
            },
            dispose() {
              disposed++
            },
          }),
          createEncoder: async () => ({
            choice: { codec: 'avc', container: 'mp4', mime: 'video/mp4', usedFallback: false },
            async addFrame() {},
            async finish() {
              return { mime: 'video/mp4', codec: 'avc', usedFallback: false }
            },
            async cancel() {
              canceled++
            },
          }),
        },
      })
      throw new Error('expected a timeout error')
    } catch (error) {
      expect((error as VideoError).code).toBe('stage_timeout')
    }
    expect(canceled).toBe(1)
    expect(disposed).toBe(1)
    expect(existsSync(outPath)).toBe(false)
  })

  it('does not open a stage for an already-canceled job', async () => {
    const openStage = vi.fn()
    const controller = new AbortController()
    controller.abort()
    try {
      await renderVideo({
        html: HTML,
        outPath,
        signal: controller.signal,
        deps: { openStage, createEncoder: vi.fn() },
      })
      throw new Error('expected a canceled error')
    } catch (error) {
      expect((error as VideoError).code).toBe('canceled')
    }
    expect(openStage).not.toHaveBeenCalled()
  })

  it('rejects html over the cap before opening a window', async () => {
    const openStage = vi.fn()
    try {
      await renderVideo({
        html: 'a'.repeat(1_048_577),
        outPath,
        deps: { openStage, createEncoder: vi.fn() },
      })
      throw new Error('expected a size error')
    } catch (error) {
      expect((error as VideoError).code).toBe('html_too_large')
    }
    expect(openStage).not.toHaveBeenCalled()
  })
})
