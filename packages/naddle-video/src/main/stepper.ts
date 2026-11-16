import { throwIfAborted } from '../errors'
import { frameCountFor, frameTimeMs } from '../schedule'
import type { StageCapture, StageFrame } from '../types'

export interface StepperOptions {
  fps: number
  durationMs: number
  signal?: AbortSignal
  /** Receives each captured frame in decode order. */
  onFrame: (frame: StageFrame, index: number, total: number) => Promise<void> | void
  /** Lets a UI show progress without knowing the schedule. */
  onProgress?: (done: number, total: number) => void
}

export interface StepperResult {
  frameCount: number
}

/**
 * Walks the frame schedule. Per frame the stage runs the fixed seek script
 * (page `naddleVideo.seek`, Web Animations timelines, virtual clock and two
 * rAF flushes), then captures after paint. Frames are handed to `onFrame`
 * one at a time so the encoder can stream them to disk.
 */
export async function stepFrames(
  stage: StageCapture,
  options: StepperOptions,
): Promise<StepperResult> {
  const total = frameCountFor(options.fps, options.durationMs)
  for (let index = 0; index < total; index++) {
    throwIfAborted(options.signal)
    const frame = await stage.seekFrame(frameTimeMs(index, options.fps))
    throwIfAborted(options.signal)
    await options.onFrame(frame, index, total)
    options.onProgress?.(index + 1, total)
  }
  return { frameCount: total }
}
