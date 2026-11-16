import { describe, expect, it } from 'vitest'
import { hasBlockingFindings, lintHtml } from '../src/lint'

function codes(html: string): string[] {
  return lintHtml(html).map((finding) => finding.code)
}

describe('lintHtml', () => {
  it('passes a self-contained scene', () => {
    const html = `<!doctype html><html><head><style>body{margin:0}</style></head>
      <body><canvas id="c"></canvas><script>
        const canvas = document.getElementById('c')
        const context = canvas.getContext('2d')
        requestAnimationFrame(function draw() {
          context.fillRect(0, 0, 10, 10)
          requestAnimationFrame(draw)
        })
      </script></body></html>`
    expect(lintHtml(html)).toEqual([])
    expect(hasBlockingFindings(lintHtml(html))).toBe(false)
  })

  it('detects external urls and protocol-relative urls', () => {
    expect(codes('<img src="https://example.com/a.png">')).toContain('external-url')
    expect(codes('<script src="//cdn.example.com/x.js"></script>')).toContain(
      'protocol-relative-url',
    )
  })

  it('detects embedded media and frames', () => {
    expect(codes('<iframe src="x.html"></iframe>')).toContain('iframe')
    expect(codes('<video src="clip.mp4"></video>')).toContain('video')
    expect(codes('<audio src="sound.mp3"></audio>')).toContain('audio')
    expect(codes('<object data="x.svg"></object>')).toContain('object-embed')
  })

  it('detects network APIs', () => {
    expect(codes('<script>fetch("/api")</script>')).toContain('fetch')
    expect(codes('<script>new XMLHttpRequest()</script>')).toContain('xmlhttprequest')
    expect(codes('<script>new WebSocket("wss://x")</script>')).toContain('websocket')
    expect(codes('<script>new EventSource("/events")</script>')).toContain('eventsource')
    expect(codes('<script>navigator.sendBeacon("/log")</script>')).toContain('send-beacon')
  })

  it('detects remote imports but allows the bundled library scheme', () => {
    expect(codes('<script type="module">import("https://x/y.js")</script>')).toContain(
      'remote-import',
    )
    expect(
      codes(
        '<script type="module">import * as THREE from "naddle-video-lib://lib/vendor/three/three.module.min.js"</script>',
      ),
    ).not.toContain('remote-import')
  })

  it('detects eval and new Function', () => {
    expect(codes('<script>eval("1 + 1")</script>')).toContain('eval')
    expect(codes('<script>new Function("return 1")</script>')).toContain('new-function')
  })

  it('detects window.open and navigation', () => {
    expect(codes('<script>window.open("https://x")</script>')).toContain('window-open')
    expect(codes('<script>location.href = "/other"</script>')).toContain('navigation')
    expect(codes('<script>location.replace("/other")</script>')).toContain('navigation')
  })

  it('marks blocking findings', () => {
    expect(hasBlockingFindings(lintHtml('<iframe></iframe>'))).toBe(true)
  })
})
