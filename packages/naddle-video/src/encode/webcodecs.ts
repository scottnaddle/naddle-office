import {
  FilePathTarget,
  Mp4OutputFormat,
  Output,
  Quality,
  VideoSample,
  VideoSampleSource,
  WebMOutputFormat,
} from 'mediabunny'
import { throwIfAborted, VideoError } from '../errors'
import type {
  EncoderCreateOptions,
  FrameEncoder,
  FrameEncoderResult,
  StageFrame,
  VideoCodecChoice,
} from '../types'

const H264_CODECS = ['avc1.420028', 'avc1.4d0028', 'avc1.42001f', 'avc1.4d001f'] as const
const VP9_CODECS = ['vp09.00.40.08', 'vp09.00.31.08', 'vp09.00.10.08'] as const

function bitrateFor(width: number, height: number, fps: number): number {
  const pixelsPerSecond = width * height * fps
  return Math.min(24_000_000, Math.max(500_000, Math.round(pixelsPerSecond * 0.12)))
}

async function anySupported(
  codecs: readonly string[],
  width: number,
  height: number,
  fps: number,
): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined' || !VideoEncoder.isConfigSupported) return false
  const bitrate = bitrateFor(width, height, fps)
  for (const codec of codecs) {
    try {
      const result = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        bitrate,
        framerate: fps,
      })
      if (result.supported) return true
    } catch {
      // an unknown codec string is just another unsupported probe
    }
  }
  return false
}

/**
 * Picks the output policy: H.264 in MP4 when WebCodecs reports it, otherwise
 * VP9 in WebM. The fallback is reported so the caller can tell the person.
 */
export async function chooseVideoCodec(options: {
  width: number
  height: number
  fps: number
}): Promise<VideoCodecChoice> {
  const { width, height, fps } = options
  if (typeof VideoEncoder === 'undefined') {
    throw new VideoError(
      'encoder_unavailable',
      'WebCodecs VideoEncoder is not available in this environment',
    )
  }
  if (await anySupported(H264_CODECS, width, height, fps)) {
    return { codec: 'avc', container: 'mp4', mime: 'video/mp4', usedFallback: false }
  }
  if (await anySupported(VP9_CODECS, width, height, fps)) {
    return { codec: 'vp9', container: 'webm', mime: 'video/webm', usedFallback: true }
  }
  throw new VideoError(
    'encoder_unavailable',
    'Neither H.264 nor VP9 encoding is supported in this environment',
  )
}

/**
 * Creates a streaming encoder backed by Chromium's WebCodecs (through
 * Mediabunny, unmodified) and writes directly to `outPath`. Frames are not
 * accumulated in memory; `addFrame` awaits the muxer's backpressure.
 */
export async function createWebCodecsEncoder(options: EncoderCreateOptions): Promise<FrameEncoder> {
  throwIfAborted(options.signal)
  const choice = options.choice ?? (await chooseVideoCodec(options))
  const format = choice.container === 'mp4' ? new Mp4OutputFormat() : new WebMOutputFormat()
  const target = new FilePathTarget(options.outPath)
  const output = new Output({ format, target })
  const source = new VideoSampleSource({
    codec: choice.codec,
    quality: new Quality('high'),
    keyFrameInterval: 2,
    alpha: 'discard',
  })
  output.addVideoTrack(source, { frameRate: options.fps })

  let state: 'open' | 'finished' | 'canceled' = 'open'
  try {
    await output.start()
  } catch (error) {
    throw new VideoError('encoder_unavailable', 'The video encoder could not start', {
      cause: error,
    })
  }

  return {
    choice,
    async addFrame(frame: StageFrame): Promise<void> {
      throwIfAborted(options.signal)
      if (state !== 'open') throw new VideoError('stage_failed', 'The encoder is closed')
      const sample = new VideoSample(frame.data, {
        format: frame.format,
        codedWidth: options.width,
        codedHeight: options.height,
        timestamp: frame.timestampMs / 1000,
        duration: 1 / options.fps,
      })
      try {
        await source.add(sample)
      } finally {
        sample.close()
      }
    },
    async finish(): Promise<FrameEncoderResult> {
      if (state === 'finished') {
        return {
          mime: choice.mime,
          codec: choice.codec,
          usedFallback: choice.usedFallback,
        }
      }
      if (state === 'canceled') throw new VideoError('stage_failed', 'The encoder was canceled')
      state = 'finished'
      source.close()
      try {
        await output.finalize()
      } catch (error) {
        throw new VideoError('stage_failed', 'Finalizing the video file failed', { cause: error })
      }
      return {
        mime: choice.mime,
        codec: choice.codec,
        usedFallback: choice.usedFallback,
      }
    },
    async cancel(): Promise<void> {
      if (state !== 'open') return
      state = 'canceled'
      try {
        source.close()
      } catch {
        // already closed
      }
      try {
        await output.cancel()
      } catch {
        // a target that never started has nothing to cancel
      }
    },
  }
}
