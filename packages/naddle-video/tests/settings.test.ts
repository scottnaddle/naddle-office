import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_REMOTE_LABEL,
  INSECURE_LAN_HTTP,
  VIDEO_SETTINGS_ERRORS,
  VIDEO_SETTINGS_FILE,
  VideoSettingsStoreError,
  isLanHostname,
  readVideoSettings,
  readVideoSettingsReport,
  redactTokenRef,
  redactVideoSettings,
  serializeVideoSettingsForLog,
  validateRemoteEndpoint,
  validateTokenRef,
  validateVideoSettings,
  videoRenderSettingsView,
  videoSettingsPath,
  writeVideoSettings,
} from '../src/settings'

const TOKEN_ENV_REF = 'env:NADDLE_VIDEO_TEST_TOKEN'
const TOKEN_FILE_REF = 'file:/tmp/naddle-video-test-token'

const directories: string[] = []

async function tempDir(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'naddle-video-settings-'))
  directories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

describe('video settings defaults', () => {
  it('defaults to in-app', () => {
    const result = validateVideoSettings({})
    expect(result.ok).toBe(true)
    expect(result.value).toEqual({ renderTarget: 'in-app' })
    expect(result.warnings).toEqual([])
  })

  it('returns the default when the file is missing', async () => {
    const directory = await tempDir()
    expect(await readVideoSettings(directory)).toEqual({ renderTarget: 'in-app' })
    const report = await readVideoSettingsReport(directory)
    expect(report.source).toBe('default')
    expect(report.errors).toEqual([])
  })
})

describe('remote endpoint validation', () => {
  it('accepts an https endpoint without a warning', () => {
    const result = validateVideoSettings({
      renderTarget: 'in-app',
      remote: { endpoint: 'https://render.example.com/v1' },
    })
    expect(result.ok).toBe(true)
    expect(result.value?.remote?.endpoint).toBe('https://render.example.com/v1')
    expect(result.warnings).toEqual([])
  })

  it('accepts LAN http endpoints with a warning', () => {
    const endpoints = [
      'http://localhost:8080',
      'http://127.0.0.1:8080',
      'http://10.1.2.3',
      'http://172.16.0.5',
      'http://172.31.255.254',
      'http://192.168.0.10',
      'http://169.254.10.20',
      'http://studio.local',
      'http://[::1]:8080',
      'http://[fd00::1]',
      'http://[fe80::1]',
    ]
    for (const endpoint of endpoints) {
      const result = validateVideoSettings({ renderTarget: 'in-app', remote: { endpoint } })
      expect(result.ok, endpoint).toBe(true)
      expect(result.warnings, endpoint).toEqual([INSECURE_LAN_HTTP])
    }
  })

  it('rejects public or non-LAN http endpoints', () => {
    const endpoints = [
      'http://example.com',
      'http://8.8.8.8',
      'http://172.32.0.1',
      'http://[2001:db8::1]',
    ]
    for (const endpoint of endpoints) {
      const result = validateVideoSettings({ renderTarget: 'in-app', remote: { endpoint } })
      expect(result.ok, endpoint).toBe(false)
      expect(result.errors, endpoint).toContain(VIDEO_SETTINGS_ERRORS.endpointPublicHttp)
    }
  })

  it('rejects other schemes, relative URLs and credentials', () => {
    expect(validateRemoteEndpoint('ftp://example.com').error).toBe(
      VIDEO_SETTINGS_ERRORS.endpointSchemeUnsupported,
    )
    expect(validateRemoteEndpoint('file:///tmp/x').error).toBe(
      VIDEO_SETTINGS_ERRORS.endpointSchemeUnsupported,
    )
    expect(validateRemoteEndpoint('example.com').error).toBe(VIDEO_SETTINGS_ERRORS.endpointInvalid)
    expect(validateRemoteEndpoint('https://user:pass@example.com').error).toBe(
      VIDEO_SETTINGS_ERRORS.endpointCredentials,
    )
  })

  it('classifies local hostnames', () => {
    expect(isLanHostname('localhost')).toBe(true)
    expect(isLanHostname('printer.local')).toBe(true)
    expect(isLanHostname('192.168.1.20')).toBe(true)
    expect(isLanHostname('172.15.0.1')).toBe(false)
    expect(isLanHostname('example.com')).toBe(false)
  })
})

describe('token references', () => {
  it('accepts env and absolute file references only', () => {
    expect(validateTokenRef(TOKEN_ENV_REF)).toEqual({ ok: true, value: TOKEN_ENV_REF })
    expect(validateTokenRef(TOKEN_FILE_REF)).toEqual({ ok: true, value: TOKEN_FILE_REF })
  })

  it('rejects raw values, unsupported schemes, relative paths and empty names', () => {
    for (const ref of [
      'raw-value',
      'secret:render-token',
      'ref:render-token',
      'env:',
      'file:',
      'file:relative/path',
    ]) {
      const result = validateTokenRef(ref)
      expect(result.ok, ref).toBe(false)
    }
    expect(validateTokenRef('secret:x').error).toBe(VIDEO_SETTINGS_ERRORS.tokenRefUnsupported)
    expect(validateTokenRef('ref:x').error).toBe(VIDEO_SETTINGS_ERRORS.tokenRefUnsupported)
  })

  it('does not read or resolve the referenced env var or file', async () => {
    const directory = await tempDir()
    const settings = {
      renderTarget: 'in-app',
      remote: { endpoint: 'https://render.example.com', tokenRef: TOKEN_FILE_REF },
    }
    const saved = await writeVideoSettings(directory, settings)
    expect(saved.remote?.tokenRef).toBe(TOKEN_FILE_REF)
  })
})

describe('remote target is disabled in this slice', () => {
  it('rejects saving renderTarget=remote instead of coercing it', () => {
    const result = validateVideoSettings({
      renderTarget: 'remote',
      remote: { endpoint: 'https://render.example.com', tokenRef: TOKEN_ENV_REF },
    })
    expect(result.ok).toBe(false)
    expect(result.value).toBeNull()
    expect(result.errors).toContain(VIDEO_SETTINGS_ERRORS.targetRemoteUnavailable)
  })

  it('does not write a rejected remote target', async () => {
    const directory = await tempDir()
    const savedDefault = await writeVideoSettings(directory, { renderTarget: 'in-app' })
    const before = await readFile(videoSettingsPath(directory), 'utf8')

    await expect(
      writeVideoSettings(directory, {
        renderTarget: 'remote',
        remote: { endpoint: 'https://render.example.com', tokenRef: TOKEN_ENV_REF },
      }),
    ).rejects.toBeInstanceOf(VideoSettingsStoreError)

    expect(savedDefault).toEqual({ renderTarget: 'in-app' })
    expect(await readFile(videoSettingsPath(directory), 'utf8')).toBe(before)
  })

  it('shows the remote option as disabled with a reason', () => {
    const view = videoRenderSettingsView({ renderTarget: 'in-app' })
    const remote = view.targetOptions.find((option) => option.id === 'remote')
    expect(remote?.disabled).toBe(true)
    expect(remote?.disabledReason).toBe('Available after server approval')
    expect(view.selectedTarget).toBe('in-app')
  })
})

describe('settings view model', () => {
  it('shows a LAN http warning in English and Korean', () => {
    const settings = {
      renderTarget: 'in-app' as const,
      remote: { endpoint: 'http://192.168.0.20:8080' },
    }
    const en = videoRenderSettingsView(settings, 'en')
    expect(en.warning).toEqual({
      code: INSECURE_LAN_HTTP,
      message: expect.stringContaining('plain http'),
    })

    const ko = videoRenderSettingsView(settings, 'ko')
    expect(ko.warning?.message).toContain('암호화되지 않습니다')
  })

  it('defaults the remote label and has no warning for https', () => {
    const view = videoRenderSettingsView({
      renderTarget: 'in-app',
      remote: { endpoint: 'https://render.example.com' },
    })
    expect(view.label).toBe(DEFAULT_REMOTE_LABEL)
    expect(view.warning).toBeNull()
  })
})

describe('logging redaction', () => {
  it('keeps only the tokenRef kind', () => {
    const settings = {
      renderTarget: 'in-app' as const,
      remote: {
        endpoint: 'https://render.example.com',
        tokenRef: TOKEN_ENV_REF,
        label: 'Mac Studio',
      },
    }

    expect(redactTokenRef(TOKEN_ENV_REF)).toBe('env')
    expect(redactTokenRef(TOKEN_FILE_REF)).toBe('file')
    const redacted = redactVideoSettings(settings)
    expect(redacted.remote?.tokenRefKind).toBe('env')

    const text = serializeVideoSettingsForLog(settings)
    expect(text).not.toContain('NADDLE_VIDEO_TEST_TOKEN')
    expect(text).not.toContain('/tmp/naddle-video-test-token')
    expect(text).not.toContain('env:')
    expect(text).toContain('"tokenRefKind":"env"')
  })

  it('redacts a file path', () => {
    const text = serializeVideoSettingsForLog({
      renderTarget: 'in-app',
      remote: { tokenRef: TOKEN_FILE_REF },
    })
    expect(text).not.toContain('/tmp/naddle-video-test-token')
    expect(text).toContain('"tokenRefKind":"file"')
  })
})

describe('settings file store', () => {
  it('round-trips settings through a temp directory', async () => {
    const directory = await tempDir()
    const written = await writeVideoSettings(directory, {
      renderTarget: 'in-app',
      remote: {
        endpoint: 'https://render.example.com/v1',
        tokenRef: TOKEN_ENV_REF,
        label: 'Studio',
      },
    })

    expect(await readVideoSettings(directory)).toEqual(written)
    expect(await readVideoSettingsReport(directory)).toMatchObject({
      source: 'file',
      errors: [],
      warnings: [],
    })
  })

  it('ignores unknown keys and defaults an unknown label', async () => {
    const directory = await tempDir()
    await writeFile(
      videoSettingsPath(directory),
      JSON.stringify({
        renderTarget: 'in-app',
        unknownTopLevel: true,
        remote: { endpoint: 'https://render.example.com', unknownRemote: 'x' },
      }),
    )

    const settings = await readVideoSettings(directory)
    expect(settings).toEqual({
      renderTarget: 'in-app',
      remote: { endpoint: 'https://render.example.com', label: DEFAULT_REMOTE_LABEL },
    })
  })

  it('writes the reference string but no token value', async () => {
    const directory = await tempDir()
    await writeVideoSettings(directory, {
      renderTarget: 'in-app',
      remote: {
        endpoint: 'https://render.example.com',
        tokenRef: TOKEN_ENV_REF,
        label: 'Mac Studio',
      },
    })

    const raw = await readFile(videoSettingsPath(directory), 'utf8')
    expect(raw).toContain(`"tokenRef": "${TOKEN_ENV_REF}"`)
    expect(raw).not.toContain('token-value')
    expect(raw).not.toContain('secret')
    expect(raw).not.toContain('password')
  })

  it('falls back to defaults for invalid JSON without rewriting the file', async () => {
    const directory = await tempDir()
    const path = videoSettingsPath(directory)
    await writeFile(path, '{not json')

    const report = await readVideoSettingsReport(directory)
    expect(report.source).toBe('invalid')
    expect(report.errors).toContain('settings-invalid-json')
    expect(report.settings).toEqual({ renderTarget: 'in-app' })
    expect(await readFile(path, 'utf8')).toBe('{not json')
  })

  it('falls back to defaults for a stored remote target', async () => {
    const directory = await tempDir()
    await writeFile(
      videoSettingsPath(directory),
      JSON.stringify({ renderTarget: 'remote', remote: { endpoint: 'https://x.example' } }),
    )

    const report = await readVideoSettingsReport(directory)
    expect(report.source).toBe('invalid')
    expect(report.errors).toContain(VIDEO_SETTINGS_ERRORS.targetRemoteUnavailable)
    expect(report.settings).toEqual({ renderTarget: 'in-app' })
  })

  it('uses the overlay-owned file name', async () => {
    const directory = await tempDir()
    await writeVideoSettings(directory, { renderTarget: 'in-app' })
    expect(VIDEO_SETTINGS_FILE).toBe('naddle-video.json')
    expect(videoSettingsPath(directory).endsWith(VIDEO_SETTINGS_FILE)).toBe(true)
    expect(await readFile(join(directory, VIDEO_SETTINGS_FILE), 'utf8')).toContain('in-app')
  })
})
