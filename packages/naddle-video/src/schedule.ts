import {
  DEFAULT_DURATION_MS,
  DEFAULT_FPS,
  DEFAULT_HEIGHT,
  DEFAULT_WIDTH,
  MAX_DURATION_MS,
  MAX_FPS,
  fitFrameSize,
} from './limits'

export interface VideoRequestInput {
  width?: number
  height?: number
  fps?: number
  durationMs?: number
}

export interface NormalizedVideoRequest {
  width: number
  height: number
  fps: number
  durationMs: number
  frameCount: number
  /** Human-readable notes for every value the caps changed. */
  clamped: string[]
}

function positive(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

/** Frames for a duration at a frame rate; always at least one. */
export function frameCountFor(fps: number, durationMs: number): number {
  return Math.max(1, Math.round((durationMs / 1000) * fps))
}

/** The virtual-clock time of frame `index`. The last frame stays before the end. */
export function frameTimeMs(index: number, fps: number): number {
  return Math.round((index * 1000) / fps)
}

/**
 * Applies every cap and returns the values the renderer actually uses.
 * Oversized requests are clamped, not rejected, so the caller can show what
 * happened instead of failing a job after the model has already answered.
 */
export function normalizeVideoRequest(input: VideoRequestInput): NormalizedVideoRequest {
  const clamped: string[] = []

  const rawWidth = positive(input.width, DEFAULT_WIDTH)
  const rawHeight = positive(input.height, DEFAULT_HEIGHT)
  const size = fitFrameSize(rawWidth, rawHeight)
  if (size.scaled) {
    clamped.push(`frame size ${rawWidth}x${rawHeight} -> ${size.width}x${size.height}`)
  }

  const rawFps = positive(input.fps, DEFAULT_FPS)
  let fps = Math.min(rawFps, MAX_FPS)
  fps = Math.max(1, Math.round(fps))
  if (fps !== rawFps) clamped.push(`fps ${rawFps} -> ${fps}`)

  const rawDuration = positive(input.durationMs, DEFAULT_DURATION_MS)
  const durationMs = Math.min(Math.round(rawDuration), MAX_DURATION_MS)
  if (durationMs !== rawDuration) {
    clamped.push(`duration ${Math.round(rawDuration)}ms -> ${durationMs}ms`)
  }

  return {
    width: size.width,
    height: size.height,
    fps,
    durationMs,
    frameCount: frameCountFor(fps, durationMs),
    clamped,
  }
}
