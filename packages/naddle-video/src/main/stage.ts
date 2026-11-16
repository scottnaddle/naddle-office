import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, session, type Session } from 'electron'
import { VideoError } from '../errors'
import { CLOCK_RUNTIME_SCRIPT } from '../runtime/clock'
import {
  CLOCK_SCRIPT_PATH,
  LIB_HOST,
  LIB_SCHEME,
  STAGE_HOST,
  STAGE_SCHEME,
  VIDEO_STAGE_PARTITION,
  buildStagedDocument,
  mimeTypeFor,
  securityHeaders,
  stageUrlFor,
} from '../schemes'
import type { StageFrame, StageOpenOptions, StageCapture } from '../types'
import {
  denyPermission,
  isAllowedNavigation,
  newRequestLog,
  screenRequest,
  windowOpenAction,
  type RequestLog,
} from './network-guard'
import { STAGE_FLUSH_SCRIPT, STAGE_READY_SCRIPT, frameSeekScript } from './stage-scripts'

const DEFAULT_PER_FRAME_TIMEOUT_MS = 5_000
const DEFAULT_VENDOR_DIR = fileURLToPath(new URL('../../vendor/', import.meta.url))
const VENDOR_PREFIX = '/vendor/'

/** Documents are held in memory only, keyed by a random id that is also the URL. */
const documents = new Map<string, string>()
/** One protocol/guard install per session partition. */
const installedSessions = new Set<string>()
/** Request counts per partition, for tests and diagnostics. */
const requestLogs = new Map<string, RequestLog>()

export interface StageRequestStats {
  allowed: number
  refused: number
  schemes: string[]
  blocked: string[]
}

export interface StageHandle extends StageCapture {
  readonly width: number
  readonly height: number
  /** Captures the current paint without seeking, for previews. */
  captureStill(): Promise<StageFrame>
  stats(): StageRequestStats
  dispose(): void
}

async function serveStage(request: Request): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405 })
  }
  let url: URL
  try {
    url = new URL(request.url)
  } catch {
    return new Response(null, { status: 400 })
  }
  if (url.host !== STAGE_HOST) return new Response(null, { status: 404 })
  const id = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
  const html = documents.get(id)
  if (html === undefined) return new Response(null, { status: 404 })
  const body = buildStagedDocument(html)
  return new Response(request.method === 'HEAD' ? null : body, {
    status: 200,
    headers: securityHeaders('text/html; charset=utf-8'),
  })
}

function safeVendorFile(vendorDir: string, relative: string): string | null {
  if (relative.includes('\0') || relative.includes('\\')) return null
  const base = resolve(vendorDir)
  const file = resolve(base, relative)
  return file.startsWith(base + sep) ? file : null
}

async function serveLib(request: Request, vendorDir: string): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405 })
  }
  let url: URL
  try {
    url = new URL(request.url)
  } catch {
    return new Response(null, { status: 400 })
  }
  if (url.host !== LIB_HOST) return new Response(null, { status: 404 })

  let pathname: string
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    return new Response(null, { status: 400 })
  }

  if (pathname === CLOCK_SCRIPT_PATH) {
    return new Response(request.method === 'HEAD' ? null : CLOCK_RUNTIME_SCRIPT, {
      status: 200,
      headers: securityHeaders('text/javascript; charset=utf-8'),
    })
  }

  if (!pathname.startsWith(VENDOR_PREFIX)) return new Response(null, { status: 404 })
  const file = safeVendorFile(vendorDir, pathname.slice(VENDOR_PREFIX.length))
  if (!file) return new Response(null, { status: 404 })
  try {
    const bytes = await readFile(file)
    return new Response(request.method === 'HEAD' ? null : new Uint8Array(bytes), {
      status: 200,
      headers: securityHeaders(mimeTypeFor(file)),
    })
  } catch {
    return new Response(null, { status: 404 })
  }
}

/**
 * Installs the two scheme handlers and the request/permission guards on the
 * stage's in-memory session. The shell registers the schemes as privileged
 * before app ready; this package never does that itself.
 */
function installSession(partition: string, vendorDir: string): Session {
  const ses = session.fromPartition(partition)
  if (installedSessions.has(partition)) return ses
  installedSessions.add(partition)
  requestLogs.set(partition, newRequestLog())

  ses.protocol.handle(STAGE_SCHEME, async (request) => {
    try {
      return await serveStage(request)
    } catch {
      return new Response(null, { status: 500 })
    }
  })
  ses.protocol.handle(LIB_SCHEME, (request) => serveLib(request, vendorDir))

  ses.webRequest.onBeforeRequest((details, callback) => {
    const log = requestLogs.get(partition)!
    callback({ cancel: !screenRequest(log, details.url) })
  })
  ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(denyPermission()))
  ses.setPermissionCheckHandler(() => denyPermission())
  ses.setSpellCheckerEnabled(false)
  ses.on('will-download', (event) => event.preventDefault())
  return ses
}

function requestStats(partition: string): StageRequestStats {
  const log = requestLogs.get(partition)
  if (!log) return { allowed: 0, refused: 0, schemes: [], blocked: [] }
  return {
    allowed: log.allowed,
    refused: log.refused,
    schemes: [...log.schemes].sort(),
    blocked: [...log.blocked],
  }
}

function withDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      onTimeout()
      reject(new VideoError('stage_timeout', message))
    }, timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer)
  })
}

/**
 * Opens a hidden, sandboxed offscreen window for one document. There is no
 * preload and no IPC: the main process drives the page only with the fixed
 * scripts in `stage-scripts.ts`. Every timeout, cancel, error or `dispose()`
 * destroys the window, so no process outlives the render.
 */
export async function openStage(options: StageOpenOptions): Promise<StageHandle> {
  if (!Number.isInteger(options.width) || !Number.isInteger(options.height)) {
    throw new VideoError('limits', 'Stage size must be whole pixels')
  }
  if (options.width < 2 || options.height < 2) {
    throw new VideoError('limits', 'Stage size must be at least 2x2')
  }

  const partition = options.partition ?? VIDEO_STAGE_PARTITION
  const vendorDir = options.vendorDir ?? DEFAULT_VENDOR_DIR
  const perFrameTimeoutMs = options.perFrameTimeoutMs ?? DEFAULT_PER_FRAME_TIMEOUT_MS
  const id = randomUUID()
  documents.set(id, options.html)

  let win: BrowserWindow | undefined
  let disposed = false
  let failure: VideoError | null = null
  let overallTimer: ReturnType<typeof setTimeout> | undefined
  const signal = options.signal

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    documents.delete(id)
    if (overallTimer !== undefined) clearTimeout(overallTimer)
    signal?.removeEventListener('abort', onAbort)
    if (win && !win.isDestroyed()) win.destroy()
  }

  const fail = (error: VideoError): void => {
    if (!failure) failure = error
    dispose()
  }

  const onAbort = (): void => {
    fail(new VideoError('canceled', 'Video render canceled'))
  }

  const deadline =
    (message: string): (() => void) =>
    () => {
      fail(new VideoError('stage_timeout', message))
    }

  const ensureLive = (): void => {
    if (failure) throw failure
    if (disposed) throw new VideoError('stage_failed', 'Stage is closed')
  }

  const execute = async (script: string): Promise<void> => {
    ensureLive()
    const target = win
    if (!target || target.isDestroyed()) throw new VideoError('stage_failed', 'Stage is closed')
    try {
      await withDeadline(
        target.webContents.executeJavaScript(script, true),
        perFrameTimeoutMs,
        deadline('A stage script exceeded its time limit'),
        'A stage script exceeded its time limit',
      )
    } catch (error) {
      if (failure) throw failure
      throw new VideoError('stage_failed', 'A stage script failed', { cause: error })
    }
    ensureLive()
  }

  const capture = async (timestampMs: number): Promise<StageFrame> => {
    ensureLive()
    const target = win
    if (!target || target.isDestroyed()) throw new VideoError('stage_failed', 'Stage is closed')
    let image
    try {
      image = await withDeadline(
        target.webContents.capturePage({
          x: 0,
          y: 0,
          width: options.width,
          height: options.height,
        }),
        perFrameTimeoutMs,
        deadline('Capturing a frame exceeded its time limit'),
        'Capturing a frame exceeded its time limit',
      )
    } catch (error) {
      if (failure) throw failure
      throw new VideoError('stage_failed', 'Capturing a frame failed', { cause: error })
    }
    ensureLive()
    const size = image.getSize()
    const normalized =
      size.width === options.width && size.height === options.height
        ? image
        : image.resize({ width: options.width, height: options.height, quality: 'best' })
    const bitmap = normalized.toBitmap()
    return {
      data: Uint8Array.from(bitmap),
      width: options.width,
      height: options.height,
      format: 'BGRA',
      timestampMs,
    }
  }

  try {
    if (signal?.aborted) onAbort()
    ensureLive()
    signal?.addEventListener('abort', onAbort, { once: true })
    overallTimer = setTimeout(
      () =>
        fail(new VideoError('stage_timeout', 'The video render exceeded its overall time limit')),
      Math.max(1, options.overallTimeoutMs),
    )

    installSession(partition, vendorDir)

    win = new BrowserWindow({
      show: false,
      frame: false,
      width: options.width,
      height: options.height,
      webPreferences: {
        offscreen: true,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        partition,
        backgroundThrottling: false,
        spellcheck: false,
        zoomFactor: 1,
      },
    })
    win.webContents.setZoomFactor(1)
    win.webContents.setWindowOpenHandler(windowOpenAction)
    win.webContents.on('will-navigate', (event, url) => {
      if (
        !isAllowedNavigation({
          url,
          currentUrl: win!.webContents.getURL(),
          isMainFrame: true,
        })
      ) {
        event.preventDefault()
      }
    })
    win.webContents.on('will-redirect', (event, url) => {
      if (
        !isAllowedNavigation({
          url,
          currentUrl: win!.webContents.getURL(),
          isMainFrame: true,
        })
      ) {
        event.preventDefault()
      }
    })
    win.webContents.on('will-attach-webview', (event) => event.preventDefault())

    try {
      await withDeadline(
        win.loadURL(stageUrlFor(id)),
        perFrameTimeoutMs,
        deadline('Loading the staged document exceeded its time limit'),
        'Loading the staged document exceeded its time limit',
      )
    } catch (error) {
      if (failure) throw failure
      throw new VideoError('stage_failed', 'The staged document did not load', { cause: error })
    }
    ensureLive()

    await execute(STAGE_READY_SCRIPT)
    await execute(STAGE_FLUSH_SCRIPT)
    // capturePage forces a paint; the first frame is thrown away on purpose
    await capture(0)
  } catch (error) {
    if (failure) {
      dispose()
      throw failure
    }
    dispose()
    if (error instanceof VideoError) throw error
    throw new VideoError('stage_failed', 'The stage could not start', { cause: error })
  }

  return {
    width: options.width,
    height: options.height,
    async seekFrame(ms: number): Promise<StageFrame> {
      ensureLive()
      if (!Number.isFinite(ms) || ms < 0) throw new VideoError('limits', 'Frame time is invalid')
      await execute(frameSeekScript(ms))
      return capture(Math.round(ms))
    },
    async captureStill(): Promise<StageFrame> {
      await execute(STAGE_READY_SCRIPT)
      await execute(STAGE_FLUSH_SCRIPT)
      return capture(0)
    },
    stats: () => requestStats(partition),
    dispose,
  }
}
