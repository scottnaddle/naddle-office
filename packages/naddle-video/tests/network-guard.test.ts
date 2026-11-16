import { describe, expect, it } from 'vitest'
import {
  REFUSED_ADDRESSES_KEPT,
  isAllowedNavigation,
  isAllowedVideoRequest,
  newRequestLog,
  screenRequest,
  windowOpenAction,
} from '../src/main/network-guard'

describe('video request guard', () => {
  const allowed = [
    'naddle-video-stage://render/abc',
    'naddle-video-lib://lib/runtime/clock.js',
    'naddle-video-lib://lib/vendor/three/three.module.min.js',
    'data:text/html,<p>x</p>',
    'blob:null/1234',
  ]
  const denied = [
    'https://example.com/x.js',
    'http://localhost:5173/x.js',
    'file:///etc/passwd',
    'about:blank',
    'ws://localhost:5173/socket',
    'ftp://example.com/x',
    'not a url',
  ]

  it.each(allowed)('allows %s', (url) => {
    expect(isAllowedVideoRequest(url)).toBe(true)
  })

  it.each(denied)('denies %s', (url) => {
    expect(isAllowedVideoRequest(url)).toBe(false)
  })

  it('counts allowed and refused requests and keeps refused addresses short', () => {
    const log = newRequestLog()
    expect(screenRequest(log, 'naddle-video-stage://render/a')).toBe(true)
    expect(screenRequest(log, 'https://example.com/secret?token=1')).toBe(false)
    expect(log.allowed).toBe(1)
    expect(log.refused).toBe(1)
    expect(log.schemes.has('naddle-video-stage:')).toBe(true)
    expect(log.blocked[0]).toBe('https://example.com/secret')
  })

  it('keeps only the newest refused addresses', () => {
    const log = newRequestLog()
    for (let index = 0; index < REFUSED_ADDRESSES_KEPT + 5; index++) {
      screenRequest(log, `https://example.com/${index}`)
    }
    expect(log.refused).toBe(REFUSED_ADDRESSES_KEPT + 5)
    expect(log.blocked).toHaveLength(REFUSED_ADDRESSES_KEPT)
    expect(log.blocked[0]).toBe('https://example.com/5')
  })

  it('denies new windows and every navigation away from the staged page', () => {
    expect(windowOpenAction()).toEqual({ action: 'deny' })
    expect(
      isAllowedNavigation({
        url: 'naddle-video-stage://render/a',
        currentUrl: 'naddle-video-stage://render/a',
        isMainFrame: true,
      }),
    ).toBe(true)
    expect(
      isAllowedNavigation({
        url: 'https://example.com',
        currentUrl: 'naddle-video-stage://render/a',
        isMainFrame: true,
      }),
    ).toBe(false)
    expect(
      isAllowedNavigation({
        url: 'naddle-video-stage://render/b',
        currentUrl: 'naddle-video-stage://render/a',
        isMainFrame: false,
      }),
    ).toBe(false)
  })
})
