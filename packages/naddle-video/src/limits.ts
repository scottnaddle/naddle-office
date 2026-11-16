import { VideoError } from './errors'

/**
 * Hard caps for one render. They are deliberately generous for a short
 * explainer and tight enough that a slow PC can still finish:
 * at most 90 seconds, 30 fps, 1080p, and a 1 MiB generated HTML document.
 */
export const MAX_DURATION_MS = 90_000
export const MAX_FPS = 30
export const MAX_HTML_BYTES = 1_048_576
export const MAX_FRAME_WIDTH = 1920
export const MAX_FRAME_HEIGHT = 1920
export const MAX_FRAME_PIXELS = MAX_FRAME_WIDTH * MAX_FRAME_HEIGHT
export const MIN_FRAME_DIMENSION = 2

/** Defaults used when the caller leaves a field out. */
export const DEFAULT_WIDTH = 1920
export const DEFAULT_HEIGHT = 1080
export const DEFAULT_FPS = 30
export const DEFAULT_DURATION_MS = 10_000

/** UTF-8 length, which is what the 1 MiB cap counts. */
export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength
}

/** Rejects a document over the cap before it is staged. */
export function assertHtmlWithinLimit(html: string): void {
  const bytes = utf8ByteLength(html)
  if (bytes > MAX_HTML_BYTES) {
    throw new VideoError(
      'html_too_large',
      `Generated HTML is ${bytes} bytes; the cap is ${MAX_HTML_BYTES}`,
    )
  }
}

/** Rounds a positive dimension down to an even number; encoders prefer even sizes. */
export function evenFloor(value: number): number {
  const whole = Math.max(MIN_FRAME_DIMENSION, Math.floor(value))
  return whole - (whole % 2)
}

/**
 * Fits a requested size inside the 1080p pixel budget without changing its
 * aspect ratio. Both dimensions stay even so H.264 encoding can accept them.
 */
export function fitFrameSize(
  width: number,
  height: number,
): { width: number; height: number; scaled: boolean } {
  const areaScale = Math.sqrt(MAX_FRAME_PIXELS / (width * height))
  const scale = Math.min(1, MAX_FRAME_WIDTH / width, MAX_FRAME_HEIGHT / height, areaScale)
  const w = evenFloor(width * scale)
  const h = evenFloor(height * scale)
  return { width: w, height: h, scaled: w !== width || h !== height }
}
