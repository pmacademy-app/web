/**
 * The typed API client (B10-B).
 *
 * ## Why
 *
 * `F-03`: 133 call sites each hand-roll the same six steps — call `fetch`, decide
 * whether `res.ok` is enough, parse JSON that might not be JSON, guess which field
 * holds the message, and invent a story for a network failure. They disagree with
 * each other, and most of them are subtly wrong in the same way: `await res.json()`
 * on an HTML error page throws, and the catch that follows reports it as a network
 * problem.
 *
 * B7-H made the server side uniform — every route now answers with the ADR-006
 * envelope — which is what makes one client possible. `resolveApiAuthError()` in
 * `lib/auth/errors.ts` already does this correctly for the auth screens; this is
 * the same idea without the auth-specific classification.
 *
 * ## What it is
 *
 * A thin wrapper that turns every outcome into one discriminated union, so a caller
 * writes `if (!result.ok)` instead of a decision tree. Deliberately small: no
 * caching, no retries, no request deduplication, no framework. SWR adoption is
 * B10-C and call-site migration is B10-C/B10-D — this batch ships the foundation
 * and is imported by nothing.
 *
 * ## What it does not do
 *
 * It never decides authorization. A 401 or a 403 is reported with its code and
 * left to the caller; duplicating the server's actor policy on the client would
 * create a second answer to a question that already has one.
 *
 * It does not change authentication either. `credentials: 'same-origin'` is the
 * browser default that every existing `fetch('/api/...')` call site already gets,
 * stated explicitly here so it is a decision rather than an inheritance — the
 * session lives in httpOnly cookies and must keep riding along unchanged.
 */

import { REQUEST_ID_HEADER } from '@/lib/monitoring/request-id'

/** Why a request failed. The caller branches on this before touching `code`. */
export type ApiFailureKind =
  /** The request never completed: offline, DNS, CORS, aborted. */
  | 'network'
  /** A non-2xx response carrying the ADR-006 envelope. The normal failure. */
  | 'http'
  /** A response whose body was not JSON at all — an HTML error page, a proxy 502. */
  | 'parse'
  /** JSON that does not match the contract. A route escaping the envelope. */
  | 'contract'

/**
 * A normalized failure.
 *
 * `code` is the server's stable machine-readable code where one exists, so a caller
 * branches on `code` rather than on the message — which is copy and will change.
 * Synthetic codes are used for the failures that never reached a route.
 */
export interface ApiError {
  kind: ApiFailureKind
  /** ADR-006 `code`, or a synthetic one for network/parse failures. */
  code: string
  /** Safe, user-facing copy. Server copy where the contract supplied it. */
  message: string
  /** HTTP status, or 0 when the request never completed. */
  status: number
  /** Correlation id for one failure, from `apiInternalError`. Quote it to support. */
  errorId?: string
  /** B9-B correlation id for the request, present whether or not anything failed. */
  requestId?: string
  /** Route-specific envelope additions, e.g. `requiresVerification`, `resetInMs`. */
  extra?: Record<string, unknown>
}

export type ApiResult<T> =
  | { ok: true; data: T; status: number; requestId?: string }
  | { ok: false; error: ApiError }

/** Synthetic codes for failures that never reached a route handler. */
export const API_CLIENT_CODES = {
  network: 'NETWORK_ERROR',
  parse: 'MALFORMED_RESPONSE',
  contract: 'UNEXPECTED_RESPONSE',
  aborted: 'REQUEST_ABORTED',
} as const

const GENERIC_NETWORK_MESSAGE =
  'Could not reach the server. Check your connection and try again.'
const GENERIC_MALFORMED_MESSAGE = 'The server returned an unexpected response. Please try again.'

export interface ApiRequestOptions extends Omit<RequestInit, 'body' | 'method'> {
  /** Serialized as JSON unless it is already a `FormData`/`Blob`/string. */
  body?: unknown
  /** Correlation id to send upstream. B9-B validates and echoes it. */
  requestId?: string
  signal?: AbortSignal
}

function isRawBody(body: unknown): boolean {
  return (
    typeof body === 'string' ||
    (typeof FormData !== 'undefined' && body instanceof FormData) ||
    (typeof Blob !== 'undefined' && body instanceof Blob) ||
    (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams)
  )
}

/** Pulls the envelope's non-contract fields out, so a caller can still read them. */
function extractExtra(body: Record<string, unknown>): Record<string, unknown> | undefined {
  const known = new Set(['success', 'error', 'code', 'errorId', 'requestId'])
  const extra: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) {
    if (!known.has(k)) extra[k] = v
  }
  return Object.keys(extra).length > 0 ? extra : undefined
}

function readRequestId(response: Response, body: unknown): string | undefined {
  // The header is authoritative: B9-B stamps it on success and failure alike,
  // whereas the body only carries it on an error envelope.
  const header = response.headers?.get?.(REQUEST_ID_HEADER)
  if (header) return header
  if (body && typeof body === 'object' && typeof (body as { requestId?: unknown }).requestId === 'string') {
    return (body as { requestId: string }).requestId
  }
  return undefined
}

/**
 * Issues one request and normalizes every outcome.
 *
 * `T` is the caller's expectation of the success body. It is not validated at
 * runtime: the server owns the shape, and re-validating every response on the
 * client would duplicate the route's schema and disagree with it the first time
 * one changed. Callers that need a runtime guarantee should parse `data`
 * themselves with the same schema the route uses.
 */
export async function apiRequest<T = unknown>(
  path: string,
  options: ApiRequestOptions & { method?: string } = {}
): Promise<ApiResult<T>> {
  const { body, requestId, headers, method = 'GET', ...rest } = options

  const requestHeaders = new Headers(headers)
  if (requestId) requestHeaders.set(REQUEST_ID_HEADER, requestId)

  let payload: BodyInit | undefined
  if (body !== undefined && body !== null) {
    if (isRawBody(body)) {
      payload = body as BodyInit
    } else {
      payload = JSON.stringify(body)
      if (!requestHeaders.has('content-type')) {
        requestHeaders.set('content-type', 'application/json')
      }
    }
  }

  let response: Response
  try {
    response = await fetch(path, {
      ...rest,
      method,
      headers: requestHeaders,
      // Stated rather than inherited — see the module note. The session is an
      // httpOnly cookie and must keep riding along exactly as it does today.
      credentials: rest.credentials ?? 'same-origin',
      ...(payload !== undefined ? { body: payload } : {}),
    })
  } catch (cause) {
    // `fetch` rejects only when the request never completed. An HTTP error is a
    // resolved response, and conflating the two is the mistake this replaces.
    const aborted = cause instanceof Error && cause.name === 'AbortError'
    return {
      ok: false,
      error: {
        kind: 'network',
        code: aborted ? API_CLIENT_CODES.aborted : API_CLIENT_CODES.network,
        message: GENERIC_NETWORK_MESSAGE,
        status: 0,
        ...(requestId ? { requestId } : {}),
      },
    }
  }

  // 204 and 205 have no body by definition; reading one would throw.
  if (response.status === 204 || response.status === 205) {
    const id = readRequestId(response, null)
    return { ok: true, data: undefined as T, status: response.status, ...(id ? { requestId: id } : {}) }
  }

  const raw = await response.text().catch(() => '')

  let parsed: unknown
  if (raw.trim() === '') {
    parsed = null
  } else {
    try {
      parsed = JSON.parse(raw)
    } catch {
      // An HTML error page from a proxy, or a gateway timeout. The status still
      // tells the caller what happened, so it is preserved rather than flattened.
      return {
        ok: false,
        error: {
          kind: 'parse',
          code: API_CLIENT_CODES.parse,
          message: GENERIC_MALFORMED_MESSAGE,
          status: response.status,
          ...(readRequestId(response, null) ? { requestId: readRequestId(response, null) } : {}),
        },
      }
    }
  }

  const id = readRequestId(response, parsed)

  if (response.ok) {
    return { ok: true, data: parsed as T, status: response.status, ...(id ? { requestId: id } : {}) }
  }

  // Non-2xx. The envelope is the expected shape; anything else is a route that
  // escaped the contract, which is reported as such rather than guessed at.
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const envelope = parsed as Record<string, unknown>
    const message = typeof envelope.error === 'string' ? envelope.error : undefined
    const code = typeof envelope.code === 'string' ? envelope.code : undefined

    if (message || code) {
      return {
        ok: false,
        error: {
          kind: 'http',
          code: code ?? API_CLIENT_CODES.contract,
          message: message ?? GENERIC_MALFORMED_MESSAGE,
          status: response.status,
          ...(typeof envelope.errorId === 'string' ? { errorId: envelope.errorId } : {}),
          ...(id ? { requestId: id } : {}),
          ...(extractExtra(envelope) ? { extra: extractExtra(envelope) } : {}),
        },
      }
    }
  }

  return {
    ok: false,
    error: {
      kind: 'contract',
      code: API_CLIENT_CODES.contract,
      message: GENERIC_MALFORMED_MESSAGE,
      status: response.status,
      ...(id ? { requestId: id } : {}),
    },
  }
}

export const apiGet = <T = unknown>(path: string, options?: ApiRequestOptions) =>
  apiRequest<T>(path, { ...options, method: 'GET' })

export const apiPost = <T = unknown>(path: string, body?: unknown, options?: ApiRequestOptions) =>
  apiRequest<T>(path, { ...options, method: 'POST', body })

export const apiPatch = <T = unknown>(path: string, body?: unknown, options?: ApiRequestOptions) =>
  apiRequest<T>(path, { ...options, method: 'PATCH', body })

export const apiPut = <T = unknown>(path: string, body?: unknown, options?: ApiRequestOptions) =>
  apiRequest<T>(path, { ...options, method: 'PUT', body })

export const apiDelete = <T = unknown>(path: string, options?: ApiRequestOptions) =>
  apiRequest<T>(path, { ...options, method: 'DELETE' })

/**
 * A request/response pair for one endpoint.
 *
 * The shape B10-C builds on. `TBody` should be derived from the route's own schema
 * — `z.input<typeof profileUpdateSchema>` — rather than restated, so the client and
 * the server cannot drift.
 *
 * No endpoint is declared here yet, on purpose. The route modules that own those
 * schemas also import the server data layer, and importing one from client code
 * pulls that whole graph into the browser bundle — the defect B9-C had to fix in
 * `PortfolioSettingsForm`. Declaring endpoints means first moving the schemas into
 * client-safe modules, which is call-site work and belongs with B10-C.
 */
export interface ApiEndpoint<TBody, TResponse> {
  path: string
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  /** Present only so `TBody` is used; never read at runtime. */
  readonly __body?: TBody
  readonly __response?: TResponse
}

/** Calls a declared endpoint with its declared body type. */
export function callEndpoint<TBody, TResponse>(
  endpoint: ApiEndpoint<TBody, TResponse>,
  body?: TBody,
  options?: ApiRequestOptions
): Promise<ApiResult<TResponse>> {
  return apiRequest<TResponse>(endpoint.path, { ...options, method: endpoint.method, body })
}
