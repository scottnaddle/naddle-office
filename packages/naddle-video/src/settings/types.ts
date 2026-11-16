/**
 * Video render settings shape. This slice only stores and validates remote
 * render configuration; nothing here sends a request or resolves a token.
 */

/** Where a render runs. Remote is reserved but cannot be selected yet. */
export type VideoRenderTarget = 'in-app' | 'remote'

/** Remote render server configuration. Tokens are references, never values. */
export interface VideoRemoteSettings {
  /** Render server URL. https anywhere, http only on a local network. */
  endpoint?: string
  /** `env:NAME` or `file:/absolute/path`; never a raw token value. */
  tokenRef?: string
  /** Display name shown to the user. Defaults to `Mac Studio`. */
  label?: string
}

/** Settings stored in the overlay-owned `naddle-video.json` file. */
export interface VideoSettings {
  renderTarget: VideoRenderTarget
  remote?: VideoRemoteSettings
}

/** A validation outcome. Error and warning entries are stable code strings. */
export interface VideoSettingsValidation {
  ok: boolean
  value: VideoSettings | null
  errors: string[]
  warnings: string[]
}

/** Default display name for a remote render server. */
export const DEFAULT_REMOTE_LABEL = 'Mac Studio'

/** Warning code for a plain-http endpoint on a local network. */
export const INSECURE_LAN_HTTP = 'insecure-lan-http'

/** Remote rendering stays off until a later, separately approved slice. */
export const REMOTE_TARGET_ENABLED = false

/** The settings used when the file is missing or invalid. */
export const DEFAULT_VIDEO_SETTINGS: VideoSettings = Object.freeze({ renderTarget: 'in-app' })

/** Returns a fresh default settings object. */
export function defaultVideoSettings(): VideoSettings {
  return { renderTarget: 'in-app' }
}
