/**
 * Parse, normalize and validate video render settings. Validation is pure:
 * it never reads environment variables or files referenced by a tokenRef.
 */
import { DEFAULT_REMOTE_LABEL, INSECURE_LAN_HTTP, REMOTE_TARGET_ENABLED } from './types'
import type { VideoRemoteSettings, VideoSettingsValidation } from './types'

export const VIDEO_SETTINGS_ERRORS = {
  notObject: 'settings-not-object',
  targetInvalid: 'render-target-invalid',
  targetRemoteUnavailable: 'render-target-remote-unavailable',
  remoteNotObject: 'remote-not-object',
  endpointInvalid: 'endpoint-invalid',
  endpointSchemeUnsupported: 'endpoint-scheme-unsupported',
  endpointCredentials: 'endpoint-credentials-not-allowed',
  endpointPublicHttp: 'endpoint-public-http-not-allowed',
  tokenRefInvalid: 'token-ref-invalid',
  tokenRefUnsupported: 'token-ref-unsupported-scheme',
  labelInvalid: 'label-invalid',
} as const

export interface FieldValidation {
  ok: boolean
  value?: string
  error?: string
  warning?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasControlChars(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

function parseIpv4(host: string): number[] | null {
  const parts = host.split('.')
  if (parts.length !== 4) return null
  const octets: number[] = []
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const value = Number(part)
    if (value > 255) return null
    octets.push(value)
  }
  return octets
}

function hextet(value: string): number | null {
  return /^[0-9a-f]{1,4}$/i.test(value) ? Number.parseInt(value, 16) : null
}

function parseIpv6(host: string): number[] | null {
  let text = host
  const zone = text.indexOf('%')
  if (zone !== -1) text = text.slice(0, zone)
  if (!text.includes(':')) return null

  let inlineIpv4: number[] = []
  if (text.includes('.')) {
    const lastColon = text.lastIndexOf(':')
    if (lastColon === -1) return null
    const ipv4 = parseIpv4(text.slice(lastColon + 1))
    if (!ipv4) return null
    inlineIpv4 = [(ipv4[0] << 8) | ipv4[1], (ipv4[2] << 8) | ipv4[3]]
    text = text.slice(0, lastColon + 1)
    text = text.slice(0, -1)
  }

  const doubleIndex = text.indexOf('::')
  if (doubleIndex !== -1 && text.indexOf('::', doubleIndex + 2) !== -1) return null

  const headText = doubleIndex === -1 ? text : text.slice(0, doubleIndex)
  const tailText = doubleIndex === -1 ? '' : text.slice(doubleIndex + 2)
  const headParts = headText ? headText.split(':') : []
  const tailParts = tailText ? tailText.split(':') : []

  const head: number[] = []
  for (const part of headParts) {
    const value = hextet(part)
    if (value === null) return null
    head.push(value)
  }
  const tail: number[] = []
  for (const part of tailParts) {
    const value = hextet(part)
    if (value === null) return null
    tail.push(value)
  }

  const total = head.length + tail.length + inlineIpv4.length
  if (doubleIndex === -1) {
    if (total !== 8) return null
    return [...head, ...tail, ...inlineIpv4]
  }
  if (total >= 8) return null
  return [...head, ...new Array<number>(8 - total).fill(0), ...tail, ...inlineIpv4]
}

function isLoopbackIpv6(parts: number[]): boolean {
  return parts.every((value, index) => (index === 7 ? value === 1 : value === 0))
}

function isLanIpv6(parts: number[]): boolean {
  if (isLoopbackIpv6(parts)) return true
  const first = parts[0]
  if ((first & 0xfe00) === 0xfc00) return true
  if ((first & 0xffc0) === 0xfe80) return true
  return false
}

function normalizeHostname(hostname: string): string {
  let host = hostname.trim().toLowerCase()
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1)
  if (host.endsWith('.')) host = host.slice(0, -1)
  return host
}

/** Whether a hostname belongs to a local network allowed for plain http. */
export function isLanHostname(hostname: string): boolean {
  const host = normalizeHostname(hostname)
  if (!host) return false
  if (host === 'localhost') return true
  if (host.endsWith('.local')) return true

  const ipv4 = parseIpv4(host)
  if (ipv4) {
    const [a, b] = ipv4
    if (a === 127 && b === 0 && ipv4[2] === 0 && ipv4[3] === 1) return true
    if (a === 10) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 169 && b === 254) return true
    return false
  }

  const ipv6 = parseIpv6(host)
  return ipv6 ? isLanIpv6(ipv6) : false
}

/** Validate a remote endpoint URL and return a normalized copy. */
export function validateRemoteEndpoint(value: unknown): FieldValidation {
  if (typeof value !== 'string') {
    return { ok: false, error: VIDEO_SETTINGS_ERRORS.endpointInvalid }
  }
  const text = value.trim()
  if (!text) return { ok: false, error: VIDEO_SETTINGS_ERRORS.endpointInvalid }

  let url: URL
  try {
    url = new URL(text)
  } catch {
    return { ok: false, error: VIDEO_SETTINGS_ERRORS.endpointInvalid }
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: VIDEO_SETTINGS_ERRORS.endpointSchemeUnsupported }
  }
  if (url.username || url.password) {
    return { ok: false, error: VIDEO_SETTINGS_ERRORS.endpointCredentials }
  }
  if (url.protocol === 'https:') return { ok: true, value: text }
  if (!isLanHostname(url.hostname)) {
    return { ok: false, error: VIDEO_SETTINGS_ERRORS.endpointPublicHttp }
  }
  return { ok: true, value: text, warning: INSECURE_LAN_HTTP }
}

const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Validate a token reference. Only `env:NAME` and `file:/absolute` pass. */
export function validateTokenRef(value: unknown): FieldValidation {
  if (typeof value !== 'string') {
    return { ok: false, error: VIDEO_SETTINGS_ERRORS.tokenRefInvalid }
  }
  const text = value.trim()
  if (!text || text.length > 512 || hasControlChars(text)) {
    return { ok: false, error: VIDEO_SETTINGS_ERRORS.tokenRefInvalid }
  }

  if (text.startsWith('env:')) {
    const name = text.slice('env:'.length)
    if (!ENV_NAME_RE.test(name)) {
      return { ok: false, error: VIDEO_SETTINGS_ERRORS.tokenRefInvalid }
    }
    return { ok: true, value: `env:${name}` }
  }

  if (text.startsWith('file:')) {
    const path = text.slice('file:'.length)
    if (!path.startsWith('/') || path.trim() !== path) {
      return { ok: false, error: VIDEO_SETTINGS_ERRORS.tokenRefInvalid }
    }
    return { ok: true, value: `file:${path}` }
  }

  if (text.startsWith('secret:') || text.startsWith('ref:')) {
    return { ok: false, error: VIDEO_SETTINGS_ERRORS.tokenRefUnsupported }
  }

  return { ok: false, error: VIDEO_SETTINGS_ERRORS.tokenRefInvalid }
}

function validateLabel(value: unknown): FieldValidation {
  if (value === undefined) return { ok: true, value: DEFAULT_REMOTE_LABEL }
  if (typeof value !== 'string') {
    return { ok: false, error: VIDEO_SETTINGS_ERRORS.labelInvalid }
  }
  const label = value.trim()
  if (!label || label.length > 80 || hasControlChars(label)) {
    return { ok: false, error: VIDEO_SETTINGS_ERRORS.labelInvalid }
  }
  return { ok: true, value: label }
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function validateRemote(value: Record<string, unknown>): {
  value?: VideoRemoteSettings
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []
  const remote: VideoRemoteSettings = {}

  if (value.endpoint !== undefined) {
    const result = validateRemoteEndpoint(value.endpoint)
    if (result.ok && result.value !== undefined) remote.endpoint = result.value
    if (result.error) errors.push(result.error)
    if (result.warning) warnings.push(result.warning)
  }

  if (value.tokenRef !== undefined) {
    const result = validateTokenRef(value.tokenRef)
    if (result.ok && result.value !== undefined) remote.tokenRef = result.value
    if (result.error) errors.push(result.error)
  }

  const label = validateLabel(value.label)
  if (label.ok && label.value !== undefined) remote.label = label.value
  if (label.error) errors.push(label.error)

  return { value: remote, errors, warnings }
}

/**
 * Validate settings from disk or UI input. Unknown keys are ignored. A
 * `renderTarget` of `remote` is rejected in this slice instead of being
 * silently coerced, so it cannot be enabled by a stray file.
 */
export function validateVideoSettings(input: unknown): VideoSettingsValidation {
  if (!isRecord(input)) {
    return {
      ok: false,
      value: null,
      errors: [VIDEO_SETTINGS_ERRORS.notObject],
      warnings: [],
    }
  }

  const errors: string[] = []
  const warnings: string[] = []

  const target = input.renderTarget === undefined ? 'in-app' : input.renderTarget
  if (target !== 'in-app' && target !== 'remote') {
    errors.push(VIDEO_SETTINGS_ERRORS.targetInvalid)
  } else if (target === 'remote' && !REMOTE_TARGET_ENABLED) {
    errors.push(VIDEO_SETTINGS_ERRORS.targetRemoteUnavailable)
  }

  let remote: VideoRemoteSettings | undefined
  if (input.remote !== undefined) {
    if (!isRecord(input.remote)) {
      errors.push(VIDEO_SETTINGS_ERRORS.remoteNotObject)
    } else {
      const result = validateRemote(input.remote)
      remote = result.value
      errors.push(...result.errors)
      warnings.push(...result.warnings)
    }
  }

  const normalizedErrors = unique(errors)
  const normalizedWarnings = unique(warnings)
  if (normalizedErrors.length > 0) {
    return { ok: false, value: null, errors: normalizedErrors, warnings: normalizedWarnings }
  }

  return {
    ok: true,
    value: {
      renderTarget: target === 'remote' ? 'remote' : 'in-app',
      ...(remote ? { remote } : {}),
    },
    errors: [],
    warnings: normalizedWarnings,
  }
}
