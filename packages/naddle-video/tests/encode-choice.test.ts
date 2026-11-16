import { afterEach, describe, expect, it, vi } from 'vitest'
import { VideoError } from '../src/errors'

interface FakeSupport {
  supported: boolean
}

class FakeVideoEncoder {
  static supportedPrefixes: string[] = []

  static async isConfigSupported(config: { codec: string }): Promise<FakeSupport> {
    return {
      supported: FakeVideoEncoder.supportedPrefixes.some((prefix) =>
        config.codec.startsWith(prefix),
      ),
    }
  }
}

async function choose(supportedPrefixes: string[]) {
  FakeVideoEncoder.supportedPrefixes = supportedPrefixes
  vi.stubGlobal('VideoEncoder', FakeVideoEncoder)
  const { chooseVideoCodec } = await import('../src/encode/webcodecs')
  return chooseVideoCodec({ width: 320, height: 180, fps: 15 })
}

afterEach(() => {
  vi.unstubAllGlobals()
  FakeVideoEncoder.supportedPrefixes = []
  vi.resetModules()
})

describe('chooseVideoCodec', () => {
  it('prefers H.264 in MP4 when WebCodecs reports it', async () => {
    await expect(choose(['avc1'])).resolves.toEqual({
      codec: 'avc',
      container: 'mp4',
      mime: 'video/mp4',
      usedFallback: false,
    })
  })

  it('falls back to VP9 in WebM and reports the fallback', async () => {
    await expect(choose(['vp09'])).resolves.toEqual({
      codec: 'vp9',
      container: 'webm',
      mime: 'video/webm',
      usedFallback: true,
    })
  })

  it('fails clearly when neither codec is supported', async () => {
    FakeVideoEncoder.supportedPrefixes = []
    vi.stubGlobal('VideoEncoder', FakeVideoEncoder)
    const { chooseVideoCodec } = await import('../src/encode/webcodecs')
    await expect(chooseVideoCodec({ width: 320, height: 180, fps: 15 })).rejects.toMatchObject({
      code: 'encoder_unavailable',
    })
  })

  it('fails clearly when WebCodecs is absent', async () => {
    vi.stubGlobal('VideoEncoder', undefined)
    const { chooseVideoCodec } = await import('../src/encode/webcodecs')
    try {
      await chooseVideoCodec({ width: 320, height: 180, fps: 15 })
      throw new Error('expected an encoder error')
    } catch (error) {
      expect((error as VideoError).code).toBe('encoder_unavailable')
    }
  })
})
