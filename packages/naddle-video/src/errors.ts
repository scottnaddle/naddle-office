/** Error codes the video pipeline reports to its caller. */
export type VideoErrorCode =
  | 'not_html'
  | 'html_too_large'
  | 'limits'
  | 'stage_failed'
  | 'stage_timeout'
  | 'encoder_unavailable'
  | 'canceled'

/** A failure the caller can tell apart without reading a message string. */
export class VideoError extends Error {
  readonly code: VideoErrorCode

  constructor(code: VideoErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'VideoError'
    this.code = code
  }
}

/** Whether an unknown value is a video failure with the given code. */
export function isVideoError(value: unknown, code?: VideoErrorCode): value is VideoError {
  return value instanceof VideoError && (code === undefined || value.code === code)
}

/** Throws a `canceled` failure when the caller's signal has fired. */
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new VideoError('canceled', 'Video render canceled')
  }
}
