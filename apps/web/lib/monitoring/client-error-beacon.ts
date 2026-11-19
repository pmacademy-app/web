/**
 * Client error beacon (ENG-11).
 *
 * The error boundaries used to log to the browser console and nowhere else, so a
 * crash a learner hit was invisible to us. This posts a small, bounded report to
 * `/api/client-errors`, which records it as a `system_errors` row.
 *
 * Three sources feed it: the error boundaries (`source: 'boundary'`), and the
 * window-level `error` and `unhandledrejection` listeners that catch what no
 * boundary sees (event handlers, timers, rejected promises). All three share one
 * per-page cap and one dedupe set.
 *
 * What it sends, and nothing more: the error message (truncated), the Next.js
 * digest when there is one, the page path WITHOUT its query string (a reset or
 * verification link carries its token in the query), which boundary or listener
 * caught it, the stack (truncated, with query strings stripped from its URLs; the
 * server redacts it again) and the release (commit SHA) the page was built from.
 * No cookies and no user id: the server never trusts an identity a client sends.
 *
 * Shared by the browser and the route (it imports the limits, the names and the
 * stack scrubber), so the two cannot drift apart.
 */

export const CLIENT_ERROR_ENDPOINT = '/api/client-errors'

/** Which boundary caught the error. Mirrors the boundary files under `app/`. */
export const CLIENT_ERROR_BOUNDARIES = ['root', 'global', 'app', 'admin'] as const
export type ClientErrorBoundary = (typeof CLIENT_ERROR_BOUNDARIES)[number]

/** What captured the error. Shared contract with the admin repo. */
export const CLIENT_ERROR_SOURCES = ['boundary', 'window.onerror', 'unhandledrejection'] as const
export type ClientErrorSource = (typeof CLIENT_ERROR_SOURCES)[number]

/** Which app sent the report. The admin repo sends 'admin' to its own endpoint. */
export const CLIENT_ERROR_APP = 'web'

export const MAX_CLIENT_ERROR_MESSAGE_LENGTH = 500
export const MAX_CLIENT_ERROR_DIGEST_LENGTH = 64
export const MAX_CLIENT_ERROR_PATH_LENGTH = 300
export const MAX_CLIENT_ERROR_STACK_LENGTH = 4000
export const MAX_CLIENT_ERROR_RELEASE_LENGTH = 40

/**
 * Upper bound on the serialized report, enforced by the route before it parses.
 * The capped fields plus the JSON framing fit inside it: a 4000-character stack
 * can grow when JSON escapes it, which is why this is 8 KB and not 5.
 */
export const MAX_CLIENT_ERROR_BODY_BYTES = 8192

/** At most this many reports leave one page load, however often a boundary re-renders. */
export const MAX_REPORTS_PER_PAGE = 5

/** The commit this bundle was built from. Inlined at build time (see next.config.ts). */
const CLIENT_RELEASE = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA

export interface ClientErrorPayload {
  message: string
  digest?: string
  path: string
  /** Present for `source: 'boundary'`. */
  boundary?: ClientErrorBoundary
  source: ClientErrorSource
  app: typeof CLIENT_ERROR_APP
  stack?: string
  release?: string
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value
}

/**
 * Drops the query string and hash from every URL inside a stack. An inline-script
 * frame names the page URL, query included, and a reset link carries its token
 * there. Run in the browser before sending and again on the server, which does not
 * trust the browser to have done it.
 */
export function stripStackUrlQueries(stack: string): string {
  return stack.replace(
    /(\b[a-z][a-z0-9+.-]*:\/\/[^\s?#)]*)[?#][^\s)]*?(:\d+(?::\d+)?)?(?=[\s)]|$)/gim,
    '$1$2'
  )
}

/**
 * Reads the message, digest and stack off whatever was thrown.
 *
 * Next.js passes a value thrown in a Client Component through as-is, so it may not
 * be an `Error` at all. A string, an object with a `message`, or anything else must
 * still produce a report rather than a second crash inside the boundary.
 */
function describeThrown(error: unknown): { message: string; digest?: string; stack?: string } {
  if (error && typeof error === 'object') {
    const record = error as { message?: unknown; digest?: unknown; stack?: unknown }
    const message = typeof record.message === 'string' ? record.message : String(error)
    const digest = typeof record.digest === 'string' && record.digest ? record.digest : undefined
    const stack = typeof record.stack === 'string' && record.stack.trim() ? record.stack : undefined
    return { message, digest, stack }
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
  boundary: ClientErrorBoundary | undefined,
  path: string,
  source: ClientErrorSource = 'boundary'
): ClientErrorPayload {
  const { message, digest, stack } = describeThrown(error)
  const release = CLIENT_RELEASE ? truncate(CLIENT_RELEASE, MAX_CLIENT_ERROR_RELEASE_LENGTH) : undefined
  return {
    message: truncate(message || 'Unknown error', MAX_CLIENT_ERROR_MESSAGE_LENGTH),
    ...(digest ? { digest: truncate(digest, MAX_CLIENT_ERROR_DIGEST_LENGTH) } : {}),
    path: normalizePath(path),
    ...(boundary ? { boundary } : {}),
    source,
    app: CLIENT_ERROR_APP,
    ...(stack ? { stack: truncate(stripStackUrlQueries(stack), MAX_CLIENT_ERROR_STACK_LENGTH) } : {}),
    ...(release ? { release } : {}),
  }
}

const sentKeys = new Set<string>()

/**
 * Sends one report, best effort. Never throws.
 *
 * `navigator.sendBeacon` first, because it survives the learner navigating away
 * from the broken page; `fetch` with `keepalive` when the beacon is unavailable or
 * the browser refuses to queue it.
 */
function send(error: unknown, boundary: ClientErrorBoundary | undefined, source: ClientErrorSource): void {
  try {
    if (typeof window === 'undefined') return

    const payload = buildClientErrorPayload(error, boundary, window.location?.pathname ?? '/', source)

    // A boundary can re-render with the same error, React runs effects twice in
    // development, and a broken timer fires the same error every tick. One report
    // per distinct error per page load is enough, and five in total is plenty. The
    // key leaves out the source so one error seen by a boundary and a listener is
    // still one report.
    const key = payload.digest ?? payload.message
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

/**
 * Reports an error a boundary caught. It runs inside an error boundary, so a
 * failure here must not replace the fallback UI with a second error.
 */
export function reportClientError(error: unknown, boundary: ClientErrorBoundary): void {
  send(error, boundary, 'boundary')
}

// ─── Window listeners ─────────────────────────────────────────────────────────

const EXTENSION_URL = /\b(chrome|moz|safari|safari-web|ms-browser)-extension:\/\//i

/** True when `url` is a script served by some other origin than this site. */
function isForeignScript(url: string | undefined): boolean {
  if (!url || typeof window === 'undefined') return false
  try {
    return new URL(url, window.location.href).origin !== window.location.origin
  } catch {
    return true
  }
}

/**
 * Errors that are not ours to fix, so they would only burn the per-page budget:
 * the benign ResizeObserver loop warning, cross-origin "Script error." with no
 * detail, and anything thrown by a script the site did not serve (browser
 * extensions, injected third-party code).
 */
export function isNoiseClientError(input: { message?: string; filename?: string; stack?: string }): boolean {
  const message = input.message ?? ''
  if (/ResizeObserver loop/i.test(message)) return true
  if (/^Script error\.?$/i.test(message.trim()) && !input.stack) return true
  if (isForeignScript(input.filename)) return true
  if (input.stack && EXTENSION_URL.test(input.stack)) return true
  return false
}

function stackOf(value: unknown): string | undefined {
  return value && typeof value === 'object' && typeof (value as { stack?: unknown }).stack === 'string'
    ? (value as { stack: string }).stack
    : undefined
}

function messageOf(value: unknown): string {
  if (value && typeof value === 'object' && typeof (value as { message?: unknown }).message === 'string') {
    return (value as { message: string }).message
  }
  return String(value)
}

function onWindowError(event: ErrorEvent): void {
  try {
    const thrown = event.error ?? event.message
    const stack = stackOf(event.error)
    if (isNoiseClientError({ message: event.message || messageOf(thrown), filename: event.filename, stack })) return
    send(thrown, undefined, 'window.onerror')
  } catch {
    // Never throw from a global error handler.
  }
}

function onUnhandledRejection(event: PromiseRejectionEvent): void {
  try {
    const reason = event.reason
    if (isNoiseClientError({ message: messageOf(reason), stack: stackOf(reason) })) return
    send(reason, undefined, 'unhandledrejection')
  } catch {
    // Never throw from a global error handler.
  }
}

let listenersInstalled = false

/**
 * Adds the window `error` and `unhandledrejection` listeners, once per page load
 * however many times it is called (React runs effects twice in development, and a
 * provider can remount). Called from `ApiClientProvider`, which the root layout
 * renders on every page.
 */
export function installGlobalErrorListeners(): void {
  if (listenersInstalled || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return
  listenersInstalled = true
  window.addEventListener('error', onWindowError)
  window.addEventListener('unhandledrejection', onUnhandledRejection)
}

/** Test hook: forgets which reports this page load already sent and detaches the listeners. */
export function resetClientErrorBeaconForTests(): void {
  sentKeys.clear()
  if (listenersInstalled && typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
    window.removeEventListener('error', onWindowError)
    window.removeEventListener('unhandledrejection', onUnhandledRejection)
  }
  listenersInstalled = false
}
