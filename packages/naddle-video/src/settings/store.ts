/**
 * Overlay-owned settings file (`naddle-video.json`). This module never reads
 * the env var or file named by a tokenRef; it only persists the reference.
 */
import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { defaultVideoSettings } from './types'
import type { VideoSettings } from './types'
import { validateVideoSettings } from './validate'

export const VIDEO_SETTINGS_FILE = 'naddle-video.json'

export type VideoSettingsSource = 'file' | 'default' | 'invalid'

export interface VideoSettingsReadResult {
  settings: VideoSettings
  source: VideoSettingsSource
  errors: string[]
  warnings: string[]
}

/** A write rejected by validation. Codes are safe to show or log. */
export class VideoSettingsStoreError extends Error {
  readonly codes: string[]

  constructor(codes: string[]) {
    super(`invalid video settings: ${codes.join(', ')}`)
    this.name = 'VideoSettingsStoreError'
    this.codes = codes
  }
}

/** Absolute path of the settings file inside a provided user-data directory. */
export function videoSettingsPath(directory: string): string {
  return join(directory, VIDEO_SETTINGS_FILE)
}

/**
 * Reads and validates the settings file. A missing or invalid file falls back
 * to `{ renderTarget: "in-app" }`; invalid files are never rewritten here.
 */
export async function readVideoSettingsReport(directory: string): Promise<VideoSettingsReadResult> {
  let raw: string
  try {
    raw = await readFile(videoSettingsPath(directory), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { settings: defaultVideoSettings(), source: 'default', errors: [], warnings: [] }
    }
    throw error
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {
      settings: defaultVideoSettings(),
      source: 'invalid',
      errors: ['settings-invalid-json'],
      warnings: [],
    }
  }

  const result = validateVideoSettings(parsed)
  if (!result.ok || !result.value) {
    return {
      settings: defaultVideoSettings(),
      source: 'invalid',
      errors: result.errors,
      warnings: result.warnings,
    }
  }

  return {
    settings: result.value,
    source: 'file',
    errors: [],
    warnings: result.warnings,
  }
}

/** Convenience wrapper that returns only the safe settings value. */
export async function readVideoSettings(directory: string): Promise<VideoSettings> {
  const result = await readVideoSettingsReport(directory)
  return result.settings
}

/**
 * Validates and writes the settings file atomically. Unknown keys are dropped
 * and a `remote` render target is rejected. Returns the normalized value.
 */
export async function writeVideoSettings(
  directory: string,
  input: unknown,
): Promise<VideoSettings> {
  const result = validateVideoSettings(input)
  if (!result.ok || !result.value) {
    throw new VideoSettingsStoreError(result.errors)
  }

  await mkdir(directory, { recursive: true })
  const target = videoSettingsPath(directory)
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`
  const json = `${JSON.stringify(result.value, null, 2)}\n`

  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    handle = await open(temporary, 'w', 0o600)
    await handle.writeFile(json, 'utf8')
    await handle.sync()
    await handle.close()
    handle = undefined
    await rename(temporary, target)
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined)
    await unlink(temporary).catch(() => undefined)
    throw error
  }

  return result.value
}
