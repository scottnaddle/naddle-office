import { describe, expect, it } from 'vitest'
import { VideoError } from '../src/errors'
import { extractHtmlDocument } from '../src/extract'
import { MAX_HTML_BYTES } from '../src/limits'

const DOC = '<!doctype html><html><body><p>hello</p></body></html>'

describe('extractHtmlDocument', () => {
  it('takes the body of a single html fence', () => {
    const result = extractHtmlDocument(`Here is the scene:\n\`\`\`html\n${DOC}\n\`\`\`\nDone.`)
    expect(result.html).toBe(DOC)
    expect(result.source).toBe('fence')
    expect(result.language).toBe('html')
  })

  it('prefers the html fence when several fences exist', () => {
    const reply = [
      'First a note:',
      '```js',
      'console.log("not a scene")',
      '```',
      'Then the scene:',
      '```HTML',
      DOC,
      '```',
      '```css',
      'body { margin: 0 }',
      '```',
    ].join('\n')
    const result = extractHtmlDocument(reply)
    expect(result.html).toBe(DOC)
    expect(result.language).toBe('HTML')
  })

  it('falls back to the first fence when none is html', () => {
    const reply = '```\n<div>one</div>\n```\n```\n<div>two</div>\n```'
    expect(extractHtmlDocument(reply).html).toBe('<div>one</div>')
  })

  it('accepts a bare document with no fence', () => {
    const result = extractHtmlDocument(`  ${DOC}  `)
    expect(result.html).toBe(DOC)
    expect(result.source).toBe('document')
  })

  it('accepts tilde fences', () => {
    const reply = `~~~html\n${DOC}\n~~~`
    expect(extractHtmlDocument(reply).html).toBe(DOC)
  })

  it('rejects a reply that is not an HTML document', () => {
    try {
      extractHtmlDocument('Sure, here is a plan: first do this, then do that.')
      throw new Error('expected a VideoError')
    } catch (error) {
      expect(error).toBeInstanceOf(VideoError)
      expect((error as VideoError).code).toBe('not_html')
    }
  })

  it('rejects a document over 1 MiB', () => {
    const huge = `${'<div>'.padEnd(0)}${'a'.repeat(MAX_HTML_BYTES + 1)}`
    const reply = `\`\`\`html\n${huge}\n\`\`\``
    try {
      extractHtmlDocument(reply)
      throw new Error('expected a VideoError')
    } catch (error) {
      expect(error).toBeInstanceOf(VideoError)
      expect((error as VideoError).code).toBe('html_too_large')
    }
  })
})
