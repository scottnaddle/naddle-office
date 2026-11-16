import { VideoError } from './errors'
import { assertHtmlWithinLimit } from './limits'

export interface ExtractedHtml {
  html: string
  /** Where the document came from: a fenced block or the whole reply. */
  source: 'fence' | 'document'
  /** The fence's info string, when a fence was used. */
  language: string | null
}

interface FenceBlock {
  language: string
  body: string
}

const HTML_LANGUAGES = new Set(['html', 'htm', 'html5', 'xhtml'])

function isHtmlLanguage(info: string): boolean {
  return HTML_LANGUAGES.has(info.trim().toLowerCase())
}

/** Splits a reply into fenced code blocks, accepting both backtick and tilde fences. */
function fencedBlocks(text: string): FenceBlock[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  const blocks: FenceBlock[] = []
  let index = 0
  while (index < lines.length) {
    const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(lines[index]!)
    if (!opening) {
      index++
      continue
    }
    const marker = opening[1]!
    const char = marker[0]!
    const language = opening[2]!.trim().split(/\s+/)[0] ?? ''
    const body: string[] = []
    index++
    while (index < lines.length) {
      const closing = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(lines[index]!)
      if (closing && closing[1]![0] === char && closing[1]!.length >= marker.length) {
        index++
        break
      }
      body.push(lines[index]!)
      index++
    }
    blocks.push({ language, body: body.join('\n') })
  }
  return blocks
}

/** Whether a reply without a fence is obviously an HTML document. */
function looksLikeHtmlDocument(text: string): boolean {
  return /<(?:!doctype\s+html|html[\s>]|head[\s>]|body[\s>]|svg[\s>]|canvas[\s>]|div[\s>]|style[\s>]|script[\s>])/i.test(
    text.trimStart(),
  )
}

/**
 * Pulls the single HTML document out of a model reply.
 *
 * - One fence: use its body.
 * - Several fences: prefer the first `html`/`htm` fence, else the first fence.
 * - No fence: use the whole reply when it looks like an HTML document.
 */
export function extractHtmlDocument(reply: string): ExtractedHtml {
  const text = reply.replace(/^\uFEFF/, '')
  const blocks = fencedBlocks(text)
  let html: string
  let source: ExtractedHtml['source']
  let language: string | null = null

  if (blocks.length > 0) {
    const chosen = blocks.find((block) => isHtmlLanguage(block.language)) ?? blocks[0]!
    html = chosen.body
    language = chosen.language || null
    source = 'fence'
  } else {
    if (!looksLikeHtmlDocument(text)) {
      throw new VideoError('not_html', 'The model reply does not contain an HTML document')
    }
    html = text
    source = 'document'
  }

  const trimmed = html.trim()
  if (trimmed.length === 0) {
    throw new VideoError('not_html', 'The extracted HTML document is empty')
  }
  assertHtmlWithinLimit(trimmed)
  return { html: trimmed, source, language }
}
