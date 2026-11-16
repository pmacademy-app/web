/**
 * Client error beacon (ENG-11).
 *
 * The error boundaries used to log to the browser console and nowhere else, so a
 * crash a learner hit was invisible to us. This posts a small, bounded report to
 * `/api/client-errors`, which records it as a `system_errors` row.
 *
 * What it sends, and nothing more: the error message (truncated), the Next.js
 * digest when there is one, the page path WITHOUT its query string (a reset or
 * verification link carries its token in the query) and which boundary caught it.
 * No stack, no cookies, no user id: the server resolves nothing from this request
 * and the report does not need it.
 *
 * Shared by the browser (the boundaries call `reportClientError`) and the route
 * (it imports the limits and boundary names), so the two cannot drift apart.
 */

export const CLIENT_ERROR_ENDPOINT = '/api/client-errors'

/** Which boundary caught the error. Mirrors the boundary files under `app/`. */
export const CLIENT_ERROR_BOUNDARIES = ['root', 'global', 'app', 'admin'] as const
export type ClientErrorBoundary = (typeof CLIENT_ERROR_BOUNDARIES)[number]

export const MAX_CLIENT_ERROR_MESSAGE_LENGTH = 500
export const MAX_CLIENT_ERROR_DIGEST_LENGTH = 64
export const MAX_CLIENT_ERROR_PATH_LENGTH = 300

/**
 * Upper bound on the serialized report, enforced by the route before it parses.
 * The three capped fields plus the JSON framing fit well inside it.
 */
export const MAX_CLIENT_ERROR_BODY_BYTES = 2048

/** At most this many reports leave one page load, however often a boundary re-renders. */
const MAX_REPORTS_PER_PAGE = 5

export interface ClientErrorPayload {
  message: string
  digest?: string
  path: string
  boundary: ClientErrorBoundary
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value
}

/**
 * Reads the message and digest off whatever was thrown.
 *
 * Next.js passes a value thrown in a Client Component through as-is, so it may not
 * be an `Error` at all. A string, an object with a `message`, or anything else must
 * still produce a report rather than a second crash inside the boundary.
 */
function describeThrown(error: unknown): { message: string; digest?: string } {
  if (error && typeof error === 'object') {
    const record = error as { message?: unknown; digest?: unknown }
    const message = typeof record.message === 'string' ? record.message : String(error)
    const digest = typeof record.digest === 'string' && record.digest ? record.digest : undefined
    return { message, digest }
  }
  return { message: String(error) }
}

/** Path only: the query and hash are dropped because they can carry tokens. */
function normalizePath(path: string): string {
  const pathname = path.split(/[?#]/, 1)[0] || '/'
  return truncate(pathname.startsWith('/') ? pathname : `/${pathname}`, MAX_CLIENT_ERROR_PATH_LENGTH)
}

/** Builds the bounded report. Exported so the truncation rules can be tested directly. */
export function buildClientErrorPayload(
  error: unknown,
  boundary: ClientErrorBoundary,
  path: string
): ClientErrorPayload {
  const { message, digest } = describeThrown(error)
  return {
    message: truncate(message || 'Unknown error', MAX_CLIENT_ERROR_MESSAGE_LENGTH),
    ...(digest ? { digest: truncate(digest, MAX_CLIENT_ERROR_DIGEST_LENGTH) } : {}),
    path: normalizePath(path),
    boundary,
  }
}

const sentKeys = new Set<string>()

/** Test hook: forgets which reports this page load already sent. */
export function resetClientErrorBeaconForTests(): void {
  sentKeys.clear()
}

/**
 * Sends one report, best effort. Never throws: it runs inside an error boundary,
 * and a failure here must not replace the fallback UI with a second error.
 *
 * `navigator.sendBeacon` first, because it survives the learner navigating away
 * from the broken page; `fetch` with `keepalive` when the beacon is unavailable or
 * the browser refuses to queue it.
 */
export function reportClientError(error: unknown, boundary: ClientErrorBoundary): void {
  try {
    if (typeof window === 'undefined') return

    const payload = buildClientErrorPayload(error, boundary, window.location?.pathname ?? '/')

    // A boundary can re-render with the same error, and React runs effects twice in
    // development. One report per distinct error per page load is enough.
    const key = `${payload.boundary}|${payload.digest ?? payload.message}`
    if (sentKeys.has(key) || sentKeys.size >= MAX_REPORTS_PER_PAGE) return
    sentKeys.add(key)

    const body = JSON.stringify(payload)

    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const queued = navigator.sendBeacon(
        CLIENT_ERROR_ENDPOINT,
        new Blob([body], { type: 'application/json' })
      )
      if (queued) return
    }

    if (typeof fetch === 'function') {
      void fetch(CLIENT_ERROR_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: true,
        credentials: 'omit',
      }).catch(() => {})
    }
  } catch {
    // Reporting is best effort by design.
  }
}
