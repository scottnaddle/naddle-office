/**
 * Log-safe views of video settings. Only the tokenRef kind is kept; the env
 * name, file path and any raw value never reach a log line or error payload.
 */
import type { VideoRemoteSettings, VideoSettings } from './types'

export type TokenRefKind = 'env' | 'file' | 'none'

export interface RedactedRemoteSettings {
  endpoint?: string
  tokenRefKind: TokenRefKind
  label?: string
}

export interface RedactedVideoSettings {
  renderTarget: VideoSettings['renderTarget']
  remote?: RedactedRemoteSettings
}

/** Returns `env`, `file` or `none` without exposing the reference contents. */
export function tokenRefKind(ref: unknown): TokenRefKind {
  if (typeof ref !== 'string') return 'none'
  if (ref.startsWith('env:')) return 'env'
  if (ref.startsWith('file:')) return 'file'
  return 'none'
}

/** Returns just the kind, suitable for a log field. */
export function redactTokenRef(ref: unknown): TokenRefKind {
  return tokenRefKind(ref)
}

function redactRemote(remote: VideoRemoteSettings): RedactedRemoteSettings {
  return {
    ...(remote.endpoint !== undefined ? { endpoint: remote.endpoint } : {}),
    tokenRefKind: tokenRefKind(remote.tokenRef),
    ...(remote.label !== undefined ? { label: remote.label } : {}),
  }
}

/** Builds a settings copy with the tokenRef replaced by its kind. */
export function redactVideoSettings(settings: VideoSettings): RedactedVideoSettings {
  return {
    renderTarget: settings.renderTarget,
    ...(settings.remote ? { remote: redactRemote(settings.remote) } : {}),
  }
}

/** Serializes settings for logs with the tokenRef name and path removed. */
export function serializeVideoSettingsForLog(settings: VideoSettings): string {
  return JSON.stringify(redactVideoSettings(settings))
}
