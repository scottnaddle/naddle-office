import { describe, expect, it } from 'vitest'
import { rendererUrl } from '../src/renderer-scheme'

describe('rendererUrl for the video host', () => {
  it('builds the app-scheme URL for the video renderer', () => {
    expect(rendererUrl(undefined, 'video')).toBe('genoffice-app://video/index.html')
  })
})
