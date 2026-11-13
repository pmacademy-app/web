import type { Instrumentation } from 'next'

/**
 * Next.js instrumentation hook (ENG-11).
 *
 * `withRoute` already records an incident for a fault inside an API handler and
 * answers with a 500 itself, so those errors never reach this hook. What does reach
 * it is everything else the server catches: a Server Component that throws while
 * rendering, a Server Action, a route handler outside the wrapper, the proxy. Before
 * this file those failures appeared only in the platform log as raw text.
 *
 * Signature (Next 16.4, `node_modules/next/dist/docs/.../instrumentation.md`):
 *   onRequestError(error: unknown,
 *                  request: { path, method, headers },
 *                  context: { routerKind, routePath, routeType, renderSource,
 *                             revalidateReason, renderType })
 *
 * What is recorded: the route file pattern, the method, the route type, the request
 * id when the caller sent a well-formed one, and the error's name, digest and
 * redacted message. What is never recorded: the query string (reset and verification
 * links carry tokens there), request bodies, cookies, the Authorization header or any
 * other header.
 */

/** Nothing to set up. Exported so the hook's shape matches the documented file. */
export function register(): void {}

/** Longest error message kept in `details`. The logger redacts it before persisting. */
const MAX_MESSAGE_LENGTH = 500

/** Same allowlist as `lib/monitoring/request-id.ts`, so an unsafe header is dropped. */
const VALID_REQUEST_ID = /^[A-Za-z0-9_-]{8,128}$/

/**
 * Digests Next.js uses for control flow (`redirect()`, `notFound()`, dynamic bailout).
 * They are thrown on purpose and are not faults.
 */
const CONTROL_FLOW_DIGEST = /^(NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK|DYNAMIC_SERVER_USAGE|BAILOUT_TO_CLIENT_SIDE_RENDERING)/

function readDigest(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'digest' in error) {
    const digest = (error as { digest?: unknown }).digest
    return typeof digest === 'string' && digest ? digest : undefined
  }
  return undefined
}

function readRequestId(headers: { [key: string]: string | string[] | undefined }): string | undefined {
  const raw = headers['x-request-id']
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim()
  return value && VALID_REQUEST_ID.test(value) ? value : undefined
}

/** The path without its query string or hash. */
function pathOnly(path: string): string {
  return path.split(/[?#]/, 1)[0] || '/'
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  // The logger needs Node's `crypto` and the Supabase service client. No route in
  // this app runs on the Edge runtime, and the guard keeps an Edge bundle from ever
  // pulling them in.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const digest = readDigest(error)
  if (digest && CONTROL_FLOW_DIGEST.test(digest)) return

  try {
    const { logErrorReport } = await import('@/lib/monitoring/logger')

    const name = error instanceof Error ? error.name : 'Error'
    const rawMessage =
      error instanceof Error
        ? error.message
        : error && typeof error === 'object' && 'message' in error
          ? String((error as { message: unknown }).message)
          : String(error)

    // `routePath` is the route's file pattern (`/app/blog/[slug]`), so it carries no
    // ids and keeps one incident per broken route rather than one per request.
    await logErrorReport({
      domain: 'api',
      kind: 'unexpected',
      operation: `next.${context.routeType}`,
      summary: `Unhandled ${context.routeType} error in ${context.routePath}`,
      requestId: readRequestId(request.headers),
      details: {
        method: request.method,
        path: pathOnly(request.path),
        routePath: context.routePath,
        routeType: context.routeType,
        routerKind: context.routerKind,
        ...(context.renderSource ? { renderSource: context.renderSource } : {}),
        ...(digest ? { digest } : {}),
        errorName: name,
        // Redacted by value shape and key name inside `logErrorReport`.
        message: rawMessage.slice(0, MAX_MESSAGE_LENGTH),
      },
    })
  } catch {
    // The original error has already been handled by Next.js. A failure to record it
    // must not throw a second error from the hook.
  }
}
