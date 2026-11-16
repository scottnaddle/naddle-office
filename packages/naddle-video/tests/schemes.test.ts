import { describe, expect, it } from 'vitest'
import {
  CLOCK_SCRIPT_URL,
  LIB_ORIGIN,
  STAGE_ORIGIN,
  VIDEO_SCHEME_PRIVILEGES,
  VIDEO_STAGE_CSP,
  buildStagedDocument,
  libUrlFor,
  mimeTypeFor,
  securityHeaders,
  stageUrlFor,
} from '../src/schemes'

describe('schemes and CSP', () => {
  it('tightens every directive the plan requires', () => {
    for (const directive of [
      "default-src 'none'",
      "script-src naddle-video-stage: naddle-video-lib: 'unsafe-inline'",
      "style-src naddle-video-stage: 'unsafe-inline'",
      'img-src naddle-video-stage: data: blob:',
      'font-src naddle-video-lib: data:',
      "connect-src 'none'",
      "media-src 'none'",
      "frame-src 'none'",
      "object-src 'none'",
      'worker-src blob:',
      "base-uri 'none'",
      "form-action 'none'",
    ]) {
      expect(VIDEO_STAGE_CSP).toContain(directive)
    }
    expect(VIDEO_STAGE_CSP).not.toContain('unsafe-eval')
  })

  it('declares standard, secure stage and library schemes', () => {
    expect(VIDEO_SCHEME_PRIVILEGES.map((scheme) => scheme.scheme)).toEqual([
      'naddle-video-stage',
      'naddle-video-lib',
    ])
    for (const scheme of VIDEO_SCHEME_PRIVILEGES) {
      expect(scheme.privileges?.standard).toBe(true)
      expect(scheme.privileges?.secure).toBe(true)
    }
  })

  it('builds stage and library urls', () => {
    expect(stageUrlFor('abc')).toBe(`${STAGE_ORIGIN}/abc`)
    expect(libUrlFor('/vendor/three/three.module.min.js')).toBe(
      `${LIB_ORIGIN}/vendor/three/three.module.min.js`,
    )
    expect(CLOCK_SCRIPT_URL).toBe(`${LIB_ORIGIN}/runtime/clock.js`)
  })

  it('puts the clock script first in head', () => {
    const staged = buildStagedDocument(
      '<!doctype html><html><head><style>body{}</style></head><body></body></html>',
    )
    expect(staged.indexOf(CLOCK_SCRIPT_URL)).toBeLessThan(staged.indexOf('<style>'))
    expect(staged.startsWith('<!doctype html><html><head><script')).toBe(true)
  })

  it('does not inject the clock twice', () => {
    const once = buildStagedDocument('<html><head></head><body></body></html>')
    expect(buildStagedDocument(once)).toBe(once)
  })

  it('serves security headers with no-store and nosniff', () => {
    const headers = securityHeaders('text/html; charset=utf-8')
    expect(headers['Content-Security-Policy']).toBe(VIDEO_STAGE_CSP)
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Cache-Control']).toBe('no-store')
  })

  it('maps library file types', () => {
    expect(mimeTypeFor('/vendor/three/three.module.min.js')).toContain('text/javascript')
    expect(mimeTypeFor('/vendor/anime/LICENSE.md')).toContain('text/plain')
  })
})
