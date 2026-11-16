import type { CustomScheme } from 'electron'

/** The hidden stage document, one URL per render job. */
export const STAGE_SCHEME = 'naddle-video-stage'
/** Bundled libraries and the injected clock script. */
export const LIB_SCHEME = 'naddle-video-lib'
export const STAGE_HOST = 'render'
export const LIB_HOST = 'lib'
export const STAGE_ORIGIN = `${STAGE_SCHEME}://${STAGE_HOST}`
export const LIB_ORIGIN = `${LIB_SCHEME}://${LIB_HOST}`

/** In-memory session partition for the stage. Never persisted. */
export const VIDEO_STAGE_PARTITION = 'naddle-video-stage'

/** The clock script the stage injects before any page script. */
export const CLOCK_SCRIPT_PATH = '/runtime/clock.js'

/**
 * The policy on staged scenes. Scripts and styles may be inline because a
 * generated document is one file; libraries come only from our own scheme.
 * There is no `'unsafe-eval'`, no connection, no media, no frame and no form.
 */
export const VIDEO_STAGE_CSP = [
  "default-src 'none'",
  `script-src ${STAGE_SCHEME}: ${LIB_SCHEME}: 'unsafe-inline'`,
  `style-src ${STAGE_SCHEME}: 'unsafe-inline'`,
  `img-src ${STAGE_SCHEME}: data: blob:`,
  `font-src ${LIB_SCHEME}: data:`,
  "connect-src 'none'",
  "media-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  'worker-src blob:',
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ')

/** Standard, secure origins so scripts, fonts and fetch work inside the stage. */
export const STAGE_SCHEME_PRIVILEGE: CustomScheme = {
  scheme: STAGE_SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
  },
}

export const LIB_SCHEME_PRIVILEGE: CustomScheme = {
  scheme: LIB_SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true,
  },
}

/**
 * Pass these to the shell's single `registerSchemesAsPrivileged` call before
 * app ready. This package never registers schemes itself at import time.
 */
export const VIDEO_SCHEME_PRIVILEGES: readonly CustomScheme[] = [
  STAGE_SCHEME_PRIVILEGE,
  LIB_SCHEME_PRIVILEGE,
]

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  wasm: 'application/wasm',
  txt: 'text/plain; charset=utf-8',
}

/** Content type for a served library file; `LICENSE` files are plain text. */
export function mimeTypeFor(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1)
  if (name === 'LICENSE' || name === 'LICENSE.md') return 'text/plain; charset=utf-8'
  const dot = name.lastIndexOf('.')
  const extension = dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
  return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream'
}

export interface SecurityHeaders {
  [header: string]: string
  'Content-Type': string
  'Content-Security-Policy': string
  'X-Content-Type-Options': 'nosniff'
  'Cache-Control': 'no-store'
  'Referrer-Policy': 'no-referrer'
}

/** Every stage and library response carries CSP and `nosniff`. */
export function securityHeaders(contentType: string): SecurityHeaders {
  return {
    'Content-Type': contentType,
    'Content-Security-Policy': VIDEO_STAGE_CSP,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  }
}

/** `naddle-video-stage://render/<id>` for one job's document. */
export function stageUrlFor(id: string): string {
  return `${STAGE_ORIGIN}/${encodeURIComponent(id)}`
}

/** `naddle-video-lib://lib/<path>` for a bundled file or the clock script. */
export function libUrlFor(path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`
  return `${LIB_ORIGIN}${clean}`
}

export const CLOCK_SCRIPT_URL = libUrlFor(CLOCK_SCRIPT_PATH)

/**
 * Puts the clock script first in the document so it runs before every page
 * script. A document that already names our clock URL is left alone.
 */
export function buildStagedDocument(html: string): string {
  if (html.includes(CLOCK_SCRIPT_PATH)) return html
  const tag = `<script src="${CLOCK_SCRIPT_URL}"></script>`
  const head = /<head\b[^>]*>/i.exec(html)
  if (head) {
    const at = head.index + head[0].length
    return `${html.slice(0, at)}${tag}${html.slice(at)}`
  }
  const root = /<html\b[^>]*>/i.exec(html)
  if (root) {
    const at = root.index + root[0].length
    return `${html.slice(0, at)}<head>${tag}</head>${html.slice(at)}`
  }
  return `${tag}${html}`
}
