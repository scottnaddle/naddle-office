/** One captured frame, as a raw pixel buffer ready for WebCodecs. */
export interface StageFrame {
  /** Raw pixels; Electron's `NativeImage.toBitmap()` is BGRA. */
  data: Uint8Array
  width: number
  height: number
  format: 'BGRA' | 'RGBA'
  /** Virtual-clock time of the frame within the scene. */
  timestampMs: number
}

/** What the stepper needs from a stage, so a fake capturer can stand in for tests. */
export interface StageCapture {
  readonly width: number
  readonly height: number
  /** Runs the fixed seek scripts for `ms`, waits for paint, then captures. */
  seekFrame(ms: number): Promise<StageFrame>
  /** Stops the hidden window and drops the staged document. Idempotent. */
  dispose(): void
}

export interface StageOpenOptions {
  html: string
  width: number
  height: number
  /** Overall budget; render jobs pass `frameCount` seconds. */
  overallTimeoutMs: number
  /** Wall-clock budget for one seek-and-capture. Defaults to 5 seconds. */
  perFrameTimeoutMs?: number
  partition?: string
  /** Directory holding the bundled three.js and anime.js builds. */
  vendorDir?: string
  signal?: AbortSignal
}

export type VideoCodecName = 'avc' | 'vp9'
export type VideoContainer = 'mp4' | 'webm'

export interface VideoCodecChoice {
  codec: VideoCodecName
  container: VideoContainer
  mime: 'video/mp4' | 'video/webm'
  /** True when H.264 was not available and VP9 in WebM was used instead. */
  usedFallback: boolean
}

export interface EncoderCreateOptions {
  width: number
  height: number
  fps: number
  outPath: string
  signal?: AbortSignal
  /** Lets a caller reuse an earlier support probe. */
  choice?: VideoCodecChoice
}

export interface FrameEncoderResult {
  mime: VideoCodecChoice['mime']
  codec: VideoCodecName
  usedFallback: boolean
}

export interface FrameEncoder {
  readonly choice: VideoCodecChoice
  addFrame(frame: StageFrame): Promise<void>
  finish(): Promise<FrameEncoderResult>
  cancel(): Promise<void>
}

export interface VideoRenderResult {
  path: string
  mime: VideoCodecChoice['mime']
  codec: VideoCodecName
  usedFallback: boolean
  width: number
  height: number
  frameCount: number
  durationMs: number
  /** Cap notes from `normalizeVideoRequest`, e.g. a 4K request fitted to 1080p. */
  clamped: string[]
}
