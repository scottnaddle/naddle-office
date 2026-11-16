/**
 * The hidden stage sends nothing off this PC. Two layers cooperate:
 * the generated page's CSP, and this session guard, which refuses every
 * request whose scheme is not the stage, the library scheme, `data:` or
 * `blob:`. Every request is counted so a scripted run can prove that a clean
 * scene never tried to reach the network.
 */
import { LIB_SCHEME, STAGE_SCHEME } from '../schemes'

const ALWAYS_ALLOWED_SCHEMES: ReadonlySet<string> = new Set([
  `${STAGE_SCHEME}:`,
  `${LIB_SCHEME}:`,
  'data:',
  'blob:',
])

/** Whether the stage session lets a request through. */
export function isAllowedVideoRequest(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  return ALWAYS_ALLOWED_SCHEMES.has(parsed.protocol)
}

/** New windows from a scene: never. */
export function windowOpenAction(): { action: 'deny' } {
  return { action: 'deny' }
}

/**
 * The stage's own document is the only navigation it may load. Frames are
 * not allowed by CSP, so every sub-frame navigation is refused too.
 */
export function isAllowedNavigation(input: {
  url: string
  currentUrl: string
  isMainFrame: boolean
}): boolean {
  return input.isMainFrame && input.url === input.currentUrl
}

/** Every permission request (camera, microphone, clipboard, notifications, …) is refused. */
export function denyPermission(): false {
  return false
}

/** How many refused addresses the log keeps (the newest); `refused` counts them all. */
export const REFUSED_ADDRESSES_KEPT = 100

export interface RequestLog {
  allowed: number
  /** every refused request since the log began */
  refused: number
  /** the last `REFUSED_ADDRESSES_KEPT` refused addresses, oldest first */
  blocked: string[]
  /** schemes seen among allowed requests */
  schemes: Set<string>
}

export function newRequestLog(): RequestLog {
  return { allowed: 0, refused: 0, blocked: [], schemes: new Set() }
}

/** Notes one request in the log and answers whether it may go. */
export function screenRequest(log: RequestLog, url: string): boolean {
  if (isAllowedVideoRequest(url)) {
    log.allowed++
    try {
      log.schemes.add(new URL(url).protocol)
    } catch {
      // already allowed and counted
    }
    return true
  }
  // keep the address short and never the query: it might carry content
  log.refused++
  log.blocked.push(url.split('?')[0]!.slice(0, 200))
  if (log.blocked.length > REFUSED_ADDRESSES_KEPT) log.blocked.shift()
  return false
}
