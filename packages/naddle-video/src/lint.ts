/**
 * Static, advisory checks on generated scene HTML. The real boundary is the
 * sandboxed hidden stage plus its CSP and session request guard; this only
 * tells a person what to ask the model to fix.
 */
export type LintLevel = 'block' | 'warn'

export interface LintFinding {
  code: string
  level: LintLevel
  message: string
  /** First offset of the offending text, or -1 when the finding is structural. */
  index: number
}

interface LintRule {
  code: string
  level: LintLevel
  message: string
  pattern: RegExp
}

const RULES: readonly LintRule[] = [
  {
    code: 'external-url',
    level: 'block',
    message: 'External http(s) URLs are not allowed; the scene must run offline.',
    pattern: /\bhttps?:\/\/[^\s"'`<>)]+/i,
  },
  {
    code: 'protocol-relative-url',
    level: 'block',
    message: 'Protocol-relative URLs reach the network; use a local or data URL.',
    pattern: /(?:^|[\s("'=])\/\/(?:[a-z0-9-]+\.)+[a-z]{2,}/i,
  },
  {
    code: 'iframe',
    level: 'block',
    message: 'Embedded frames are not allowed in a scene.',
    pattern: /<iframe\b/i,
  },
  {
    code: 'video',
    level: 'block',
    message: 'Video elements are not allowed; animate the page itself.',
    pattern: /<video\b/i,
  },
  {
    code: 'audio',
    level: 'block',
    message: 'Audio elements are not allowed; v1 videos have no audio.',
    pattern: /<audio\b/i,
  },
  {
    code: 'object-embed',
    level: 'block',
    message: 'Object and embed elements are not allowed.',
    pattern: /<(?:object|embed)\b/i,
  },
  {
    code: 'fetch',
    level: 'block',
    message: 'fetch() is not allowed; a scene must not make requests.',
    pattern: /\bfetch\s*\(/i,
  },
  {
    code: 'xmlhttprequest',
    level: 'block',
    message: 'XMLHttpRequest is not allowed; a scene must not make requests.',
    pattern: /\bXMLHttpRequest\b/i,
  },
  {
    code: 'websocket',
    level: 'block',
    message: 'WebSocket is not allowed; a scene must not make requests.',
    pattern: /\bWebSocket\b/i,
  },
  {
    code: 'eventsource',
    level: 'block',
    message: 'EventSource is not allowed; a scene must not make requests.',
    pattern: /\bEventSource\b/i,
  },
  {
    code: 'send-beacon',
    level: 'block',
    message: 'sendBeacon() is not allowed; a scene must not make requests.',
    pattern: /\bsendBeacon\s*\(/i,
  },
  {
    code: 'remote-import',
    level: 'block',
    message: 'Remote import() and importScripts() are not allowed.',
    pattern: /\b(?:import\s*\(\s*|importScripts\s*\(\s*)['"`](?:https?:)?\/\//i,
  },
  {
    code: 'eval',
    level: 'block',
    message: 'eval() is not allowed.',
    pattern: /\beval\s*\(/i,
  },
  {
    code: 'new-function',
    level: 'block',
    message: 'new Function() is not allowed.',
    pattern: /\bnew\s+Function\s*\(/i,
  },
  {
    code: 'window-open',
    level: 'block',
    message: 'window.open() is not allowed in a scene.',
    pattern: /\bwindow\s*\.\s*open\s*\(/i,
  },
  {
    code: 'navigation',
    level: 'block',
    message: 'Navigating the page away is not allowed.',
    pattern: /\b(?:location\s*\.\s*(?:href|assign|replace)|window\s*\.\s*location)\b/i,
  },
  {
    code: 'form-submit',
    level: 'warn',
    message: 'Forms cannot submit anywhere in a scene.',
    pattern: /<form\b[^>]*\baction\s*=/i,
  },
]

/** Finds every rule that matches at least once, with one finding per rule. */
export function lintHtml(html: string): LintFinding[] {
  const findings: LintFinding[] = []
  for (const rule of RULES) {
    const match = rule.pattern.exec(html)
    if (match) {
      findings.push({
        code: rule.code,
        level: rule.level,
        message: rule.message,
        index: match.index,
      })
    }
  }
  return findings.sort((a, b) => a.index - b.index)
}

/** Whether any finding is hard enough that the UI should not offer to render yet. */
export function hasBlockingFindings(findings: readonly LintFinding[]): boolean {
  return findings.some((finding) => finding.level === 'block')
}
