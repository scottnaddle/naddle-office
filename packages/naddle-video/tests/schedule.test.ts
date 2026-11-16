import { describe, expect, it } from 'vitest'
import { MAX_DURATION_MS, MAX_HTML_BYTES } from '../src/limits'
import { assertHtmlWithinLimit } from '../src/limits'
import { VideoError } from '../src/errors'
import { frameCountFor, frameTimeMs, normalizeVideoRequest } from '../src/schedule'

describe('frame schedule and caps', () => {
  it('multiplies fps by duration', () => {
    expect(frameCountFor(30, 2_000)).toBe(60)
    expect(frameCountFor(15, 2_000)).toBe(30)
    expect(frameCountFor(30, 1)).toBe(1)
  })

  it('places frames on the virtual clock', () => {
    expect(frameTimeMs(0, 30)).toBe(0)
    expect(frameTimeMs(1, 30)).toBe(33)
    expect(frameTimeMs(29, 30)).toBe(967)
  })

  it('keeps a normal 1080p request unchanged', () => {
    const request = normalizeVideoRequest({ width: 1920, height: 1080, fps: 30, durationMs: 2_000 })
    expect(request).toMatchObject({ width: 1920, height: 1080, fps: 30, durationMs: 2_000 })
    expect(request.clamped).toEqual([])
  })

  it('fits a 4K request into the 1080p budget', () => {
    const request = normalizeVideoRequest({ width: 3840, height: 2160, fps: 30, durationMs: 2_000 })
    expect(request.width).toBe(1920)
    expect(request.height).toBe(1080)
    expect(request.clamped.join(' ')).toContain('frame size')
  })

  it('allows portrait and square 1080p sizes', () => {
    expect(normalizeVideoRequest({ width: 1080, height: 1920 }).clamped).toEqual([])
    expect(normalizeVideoRequest({ width: 1080, height: 1080 }).clamped).toEqual([])
  })

  it('clamps 120 seconds to 90 and 60 fps to 30', () => {
    const request = normalizeVideoRequest({ fps: 60, durationMs: 120_000 })
    expect(request.fps).toBe(30)
    expect(request.durationMs).toBe(MAX_DURATION_MS)
    expect(request.clamped.join(' ')).toContain('fps 60 -> 30')
    expect(request.clamped.join(' ')).toContain('duration 120000ms -> 90000ms')
    expect(request.frameCount).toBe(2_700)
  })

  it('keeps small smoke-test sizes and makes them even', () => {
    expect(normalizeVideoRequest({ width: 320, height: 180 })).toMatchObject({
      width: 320,
      height: 180,
    })
    expect(normalizeVideoRequest({ width: 321, height: 181 })).toMatchObject({
      width: 320,
      height: 180,
    })
  })

  it('rejects html over the cap', () => {
    expect(() => assertHtmlWithinLimit('a'.repeat(MAX_HTML_BYTES + 1))).toThrow(VideoError)
    expect(() => assertHtmlWithinLimit('a'.repeat(MAX_HTML_BYTES))).not.toThrow()
  })
})
