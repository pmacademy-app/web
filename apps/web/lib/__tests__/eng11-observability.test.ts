import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * ENG-11 (AG-09): server errors outside `withRoute`, client-side crashes and route
 * timing used to be invisible. These tests pin the three pieces that fix that:
 *
 *   1. `instrumentation.ts` `onRequestError` records a redacted incident.
 *   2. The error-boundary beacon sends a bounded report, and `/api/client-errors`
 *      accepts it under a byte cap and a per-IP limit.
 *   3. `withRoute` emits one `route.timing` line per request.
 *
 * The real logger runs against a fake service-role client, so the assertions see
 * exactly the row that would be persisted, after redaction.
 */

const evaluatePersistentRateLimit = vi.fn()
const inserted: Array<Record<string, unknown>> = []

function fakeServiceClient() {
  const query: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'gte', 'order', 'neq', 'update']) {
    query[method] = () => query
  }
  query.limit = async () => ({ data: [], error: null })
  query.insert = (row: Record<string, unknown>) => {
    inserted.push(row)
    return { select: () => ({ maybeSingle: async () => ({ data: { id: 'incident-1' }, error: null }) }) }
  }
  return { from: () => query }
}

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: vi.fn(() => fakeServiceClient()),
}))

vi.mock('@/lib/rate-limit', () => ({
  evaluatePersistentRateLimit: (key: string, opts: unknown) => evaluatePersistentRateLimit(key, opts),
}))

vi.mock('@/lib/auth', () => ({
  getAuthenticatedUserFromRequest: vi.fn(async () => null),
}))

vi.mock('@/lib/admin/guard', () => ({
  requireAdminUser: vi.fn(async () => ({ authorized: false, error: 'Authentication required', statusCode: 401 })),
}))

const { onRequestError, register } = await import('../../instrumentation')
const beacon = await import('@/lib/monitoring/client-error-beacon')
const { POST } = await import('../../app/api/client-errors/route')
const { withRoute, SLOW_ROUTE_MS } = await import('@/lib/api/with-route')

// Synthetic test JWT for verifying log redaction (not a real credential)
// gitleaks:allow
const JWT = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', 'c2lnbmF0dXJlLXZhbHVl'].join('.')

type OnRequestErrorArgs = Parameters<typeof onRequestError>

function renderContext(overrides: Partial<OnRequestErrorArgs[2]> = {}): OnRequestErrorArgs[2] {
  return {
    routerKind: 'App Router',
    routePath: '/app/(app)/dashboard/page',
    routeType: 'render',
    renderSource: 'react-server-components',
    revalidateReason: undefined,
    ...overrides,
  }
}

beforeEach(() => {
  inserted.length = 0
  evaluatePersistentRateLimit.mockReset().mockResolvedValue({ success: true, remaining: 9, resetInMs: 60_000 })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubEnv('NEXT_RUNTIME', 'nodejs')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

// ─── 1. onRequestError ───────────────────────────────────────────────────────

describe('ENG-11: instrumentation onRequestError', () => {
  it('exports register as a no-op', () => {
    expect(register()).toBeUndefined()
  })

  it('records one incident with route, method, route type and request id', async () => {
    const error = Object.assign(new Error('render exploded'), { digest: '1234567890' })

    await onRequestError(
      error,
      { path: '/dashboard', method: 'GET', headers: { 'x-request-id': 'req_abc12345' } },
      renderContext()
    )

    expect(inserted).toHaveLength(1)
    const row = inserted[0]
    expect(row.operation).toBe('next.render')
    expect(row.message).toBe('Unhandled render error in /app/(app)/dashboard/page')
    expect(row.severity).toBe('error')
    expect(row.details).toMatchObject({
      method: 'GET',
      path: '/dashboard',
      routePath: '/app/(app)/dashboard/page',
      routeType: 'render',
      digest: '1234567890',
      errorName: 'Error',
      message: 'render exploded',
      requestId: 'req_abc12345',
    })
  })

  it('redacts secrets in the message and never records the query, cookies or auth header', async () => {
    await onRequestError(
      new Error(`token leaked: ${JWT} for learner@example.com`),
      {
        path: '/reset-password?token_hash=supersecretvalue&mode=update',
        method: 'POST',
        headers: {
          cookie: 'sb-access-token=cookie-secret-value',
          authorization: 'Bearer header-secret-value',
          'x-request-id': 'req_abc12345',
        },
      },
      renderContext({ routeType: 'action', routePath: '/app/(auth)/reset-password/page' })
    )

    expect(inserted).toHaveLength(1)
    const details = inserted[0].details as Record<string, unknown>
    expect(details.path).toBe('/reset-password')
    expect(details.message).not.toContain(JWT)
    expect(details.message).toContain('[REDACTED_JWT]')
    expect(details.message).not.toContain('learner@example.com')

    const serialized = JSON.stringify(inserted[0])
    expect(serialized).not.toContain('supersecretvalue')
    expect(serialized).not.toContain('cookie-secret-value')
    expect(serialized).not.toContain('header-secret-value')
  })

  it('drops a malformed request id header rather than logging it', async () => {
    await onRequestError(
      new Error('boom'),
      { path: '/x', method: 'GET', headers: { 'x-request-id': 'bad id\nforged-line' } },
      renderContext()
    )

    expect((inserted[0].details as Record<string, unknown>).requestId).toBeUndefined()
  })

  it('ignores Next.js control-flow errors such as redirect and notFound', async () => {
    for (const digest of ['NEXT_REDIRECT;replace;/login;307;', 'NEXT_HTTP_ERROR_FALLBACK;404']) {
      await onRequestError(Object.assign(new Error(digest), { digest }), { path: '/x', method: 'GET', headers: {} }, renderContext())
    }
    expect(inserted).toHaveLength(0)
  })

  it('does nothing on the Edge runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge')
    await onRequestError(new Error('edge'), { path: '/x', method: 'GET', headers: {} }, renderContext())
    expect(inserted).toHaveLength(0)
  })

  it('accepts a thrown value that is not an Error', async () => {
    await onRequestError('plain string', { path: '/x', method: 'GET', headers: {} }, renderContext())
    expect((inserted[0].details as Record<string, unknown>).message).toBe('plain string')
  })
})

// ─── 2a. The beacon ──────────────────────────────────────────────────────────

describe('ENG-11: client error beacon payload', () => {
  beforeEach(() => beacon.resetClientErrorBeaconForTests())

  it('truncates the message, the digest and the path', () => {
    const payload = beacon.buildClientErrorPayload(
      Object.assign(new Error('x'.repeat(5000)), { digest: 'd'.repeat(500) }),
      'app',
      `/${'p'.repeat(1000)}`
    )

    expect(payload.message).toHaveLength(beacon.MAX_CLIENT_ERROR_MESSAGE_LENGTH)
    expect(payload.digest).toHaveLength(beacon.MAX_CLIENT_ERROR_DIGEST_LENGTH)
    expect(payload.path).toHaveLength(beacon.MAX_CLIENT_ERROR_PATH_LENGTH)
    expect(JSON.stringify(payload).length).toBeLessThan(beacon.MAX_CLIENT_ERROR_BODY_BYTES)
  })

  it('drops the query string and hash from the path', () => {
    const payload = beacon.buildClientErrorPayload(new Error('x'), 'root', '/reset-password?token_hash=abc#frag')
    expect(payload.path).toBe('/reset-password')
  })

  it('handles a thrown value that is not an Error', () => {
    expect(beacon.buildClientErrorPayload('just a string', 'global', '/').message).toBe('just a string')
    expect(beacon.buildClientErrorPayload(null, 'global', '/').message).toBe('null')
  })

  it('sends with sendBeacon, once per distinct error', () => {
    const sendBeacon = vi.fn<(url: string, data?: BodyInit | null) => boolean>(() => true)
    const fetchSpy = vi.fn()
    vi.stubGlobal('window', { location: { pathname: '/dashboard' } })
    vi.stubGlobal('navigator', { sendBeacon })
    vi.stubGlobal('fetch', fetchSpy)

    const error = Object.assign(new Error('boom'), { digest: 'abc' })
    beacon.reportClientError(error, 'app')
    beacon.reportClientError(error, 'app')

    expect(sendBeacon).toHaveBeenCalledTimes(1)
    expect(sendBeacon.mock.calls[0][0]).toBe('/api/client-errors')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('falls back to fetch with keepalive when sendBeacon is unavailable', () => {
    const fetchSpy = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('window', { location: { pathname: '/admin' } })
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('fetch', fetchSpy)

    beacon.reportClientError(new Error('admin crash'), 'admin')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/client-errors')
    expect(init.keepalive).toBe(true)
    // Shape pinned deliberately: the shared monitoring contract added source, app and stack.
    expect(JSON.parse(String(init.body))).toMatchObject({
      message: 'admin crash',
      path: '/admin',
      boundary: 'admin',
      source: 'boundary',
      app: 'web',
    })
  })

  it('never throws, even when sending fails', () => {
    vi.stubGlobal('window', { location: { pathname: '/' } })
    vi.stubGlobal('navigator', {
      sendBeacon: () => {
        throw new Error('blocked')
      },
    })
    expect(() => beacon.reportClientError(new Error('x'), 'root')).not.toThrow()
  })
})

// ─── 2b. The route ───────────────────────────────────────────────────────────

function report(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://prodily.app/api/client-errors', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': '203.0.113.7', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const VALID = { message: 'Cannot read properties of undefined', digest: '42', path: '/dashboard', boundary: 'app' }

describe('ENG-11: POST /api/client-errors', () => {
  it('records a valid report at warning severity and answers 204 with no body', async () => {
    const res = await POST(report(VALID))

    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
    expect(inserted).toHaveLength(1)
    expect(inserted[0].severity).toBe('warning')
    expect(inserted[0].operation).toBe('client.error_boundary')
    expect(inserted[0].details).toMatchObject({ boundary: 'app', path: '/dashboard', digest: '42' })
  })

  it('charges a per-IP bucket with a strict limit', async () => {
    await POST(report(VALID))

    // Two buckets: the per-IP rule first, then the global cap across every caller.
    expect(evaluatePersistentRateLimit).toHaveBeenCalledTimes(2)
    const [key, opts] = evaluatePersistentRateLimit.mock.calls[0]
    expect(key).toBe('client_errors:203.0.113.7')
    expect(opts).toMatchObject({ limit: 10, windowMs: 60_000 })
    expect(evaluatePersistentRateLimit.mock.calls[1][0]).toBe('client_errors:global')
  })

  it('refuses with 429 once the limit is spent, without recording anything', async () => {
    evaluatePersistentRateLimit.mockResolvedValue({ success: false, remaining: 0, resetInMs: 30_000 })

    const res = await POST(report(VALID))

    expect(res.status).toBe(429)
    expect((await res.json()).code).toBe('RATE_LIMITED')
    expect(inserted).toHaveLength(0)
  })

  it('rejects a body over the limit by its declared length', async () => {
    const big = JSON.stringify({ ...VALID, message: 'x'.repeat(beacon.MAX_CLIENT_ERROR_BODY_BYTES) })
    const res = await POST(report(big, { 'content-length': String(big.length) }))

    expect(res.status).toBe(413)
    expect((await res.json()).code).toBe('PAYLOAD_TOO_LARGE')
    expect(inserted).toHaveLength(0)
  })

  it('rejects a body over the limit even when no length is declared', async () => {
    const big = JSON.stringify({ ...VALID, message: 'x'.repeat(beacon.MAX_CLIENT_ERROR_BODY_BYTES * 4) })
    const request = report(big)
    request.headers.delete('content-length')

    const res = await POST(request)

    expect(res.status).toBe(413)
    expect(inserted).toHaveLength(0)
  })

  it.each([
    ['malformed JSON', '{not json'],
    ['an unknown boundary', { ...VALID, boundary: 'other' }],
    ['an extra field', { ...VALID, cookie: 'sb-access-token=x' }],
    ['a path without a leading slash', { ...VALID, path: 'https://evil.example/x' }],
    ['an overlong message', { ...VALID, message: 'x'.repeat(beacon.MAX_CLIENT_ERROR_MESSAGE_LENGTH + 1) }],
    ['a digest with unsafe characters', { ...VALID, digest: 'abc\ndef' }],
  ])('rejects %s with 400', async (_label, body) => {
    const res = await POST(report(body))

    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('VALIDATION')
    expect(inserted).toHaveLength(0)
  })
})

// ─── 3. withRoute timing ─────────────────────────────────────────────────────

describe('ENG-11: withRoute logs a duration', () => {
  function captureLogs() {
    vi.stubEnv('PRODILY_LOG_IN_TESTS', 'true')
    return {
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    }
  }

  function timingCalls(spy: { mock: { calls: unknown[][] } }) {
    return spy.mock.calls.filter((call: unknown[]) => String(call[0]).startsWith('[route.timing]'))
  }

  it('emits one route.timing line with operation, method, status and ms', async () => {
    const logs = captureLogs()
    const route = withRoute({ actor: { allow: ['anonymous'] }, operation: 'thing.read' }, async () =>
      Response.json({ ok: true }, { status: 201 })
    )

    const res = await route(new Request('https://prodily.app/api/thing', { headers: { 'x-request-id': 'req_timing01' } }))

    expect(res.status).toBe(201)
    const calls = timingCalls(logs.info)
    expect(calls).toHaveLength(1)
    expect(String(calls[0][0])).toContain('req_timing01')
    expect(calls[0][1]).toMatchObject({ operation: 'thing.read', method: 'GET', status: 201 })
    expect(typeof (calls[0][1] as { ms: unknown }).ms).toBe('number')
  })

  it('times refusals too', async () => {
    const logs = captureLogs()
    const route = withRoute({ actor: { allow: ['learner'] }, operation: 'thing.private' }, async () =>
      Response.json({ ok: true })
    )

    const res = await route(new Request('https://prodily.app/api/thing'))

    expect(res.status).toBe(401)
    expect(timingCalls(logs.info)[0][1]).toMatchObject({ operation: 'thing.private', status: 401 })
  })

  it('logs a slow request at warn', async () => {
    const logs = captureLogs()
    const now = vi.spyOn(performance, 'now')
    now.mockReturnValueOnce(0).mockReturnValueOnce(SLOW_ROUTE_MS + 250)
    const route = withRoute({ actor: { allow: ['anonymous'] }, operation: 'thing.slow' }, async () =>
      Response.json({ ok: true })
    )

    await route(new Request('https://prodily.app/api/thing'))

    expect(timingCalls(logs.info)).toHaveLength(0)
    expect(timingCalls(logs.warn)[0][1]).toMatchObject({ operation: 'thing.slow', ms: SLOW_ROUTE_MS + 250, slow: true })
  })

  it('stays quiet for the health check', async () => {
    const logs = captureLogs()
    const route = withRoute({ actor: { allow: ['anonymous'] }, operation: 'health.check' }, async () =>
      Response.json({ status: 'ok' })
    )

    await route(new Request('https://prodily.app/api/health'))

    expect(timingCalls(logs.info)).toHaveLength(0)
    expect(timingCalls(logs.warn)).toHaveLength(0)
  })
})
