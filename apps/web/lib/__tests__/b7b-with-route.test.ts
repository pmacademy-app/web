import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'

const getAuthenticatedUserFromRequest = vi.fn()
const requireAdminUser = vi.fn()
const evaluatePersistentRateLimit = vi.fn()
const logErrorReport = vi.fn()

vi.mock('@/lib/auth', () => ({
  getAuthenticatedUserFromRequest: (req: Request) => getAuthenticatedUserFromRequest(req),
}))

vi.mock('@/lib/admin/guard', () => ({
  requireAdminUser: (req: Request) => requireAdminUser(req),
}))

vi.mock('@/lib/rate-limit', () => ({
  evaluatePersistentRateLimit: (key: string, opts: unknown) => evaluatePersistentRateLimit(key, opts),
}))

vi.mock('@/lib/monitoring/logger', () => ({
  logErrorReport: (report: unknown) => logErrorReport(report),
  logSystemError: vi.fn(),
}))

const { withRoute, RouteError } = await import('@/lib/api/with-route')
type Ctx = import('@/lib/api/with-route').RouteHandlerContext<unknown, unknown>

/**
 * A handler spy typed through the generic rather than through a declared
 * parameter, so `handler.mock.calls[0][0]` is inferred without leaving an unused
 * binding for the linter.
 */
function makeHandler() {
  return vi.fn<(ctx: Ctx) => Promise<Response>>(async () => Response.json({ success: true }))
}

const LEARNER = { id: 'user-1', email: 'learner@prodily.app' }
const CRON_SECRET = 'cron-secret-value-for-tests'

function post(body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://prodily.app/api/thing?page=2', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function get(headers: Record<string, string> = {}): Request {
  return new Request('https://prodily.app/api/thing?page=2&tag=x', { headers })
}

beforeEach(() => {
  getAuthenticatedUserFromRequest.mockReset().mockResolvedValue(null)
  requireAdminUser.mockReset().mockResolvedValue({
    authorized: false,
    error: 'Authentication required',
    statusCode: 401,
  })
  evaluatePersistentRateLimit.mockReset().mockResolvedValue({ success: true, remaining: 9, resetInMs: 1000 })
  logErrorReport.mockReset().mockResolvedValue(undefined)
  process.env.CRON_SECRET = CRON_SECRET
})

describe('B7-B — withRoute: actor policy', () => {
  it('runs the handler with a resolved learner actor', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)
    const handler = makeHandler()

    const route = withRoute({ actor: { allow: ['learner'] }, operation: 'thing.read' }, handler)
    const res = await route(get())

    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].actor).toEqual({
      kind: 'learner',
      userId: 'user-1',
      email: 'learner@prodily.app',
    })
  })

  it('refuses an unauthenticated request with 401 and a code, without running the handler', async () => {
    const handler = makeHandler()

    const route = withRoute({ actor: { allow: ['learner'] }, operation: 'thing.read' }, handler)
    const res = await route(get())
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.code).toBe('UNAUTHORIZED')
    expect(body.success).toBe(false)
    expect(handler).not.toHaveBeenCalled()
  })

  it('refuses an authenticated non-admin with 403 on an admin-only route', async () => {
    requireAdminUser.mockResolvedValue({
      authorized: false,
      error: 'Access denied: Admin privileges required',
      statusCode: 403,
    })
    const handler = makeHandler()

    const route = withRoute({ actor: { allow: ['admin'] }, operation: 'admin.thing' }, handler)
    const res = await route(get())

    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('FORBIDDEN')
    expect(handler).not.toHaveBeenCalled()
  })

  it('does not leak the internal denial reason to the client', async () => {
    requireAdminUser.mockResolvedValue({
      authorized: false,
      error: 'Access denied: Admin privileges required',
      statusCode: 403,
    })

    const route = withRoute({ actor: { allow: ['admin'] }, operation: 'admin.thing' }, async () =>
      Response.json({ success: true })
    )
    const body = await (await route(get())).json()

    expect(JSON.stringify(body)).not.toContain('Admin privileges required')
  })

  it('composes with resolveActor for the cron policy', async () => {
    const handler = makeHandler()

    const route = withRoute({ actor: { allow: ['cron', 'admin'] }, operation: 'cron.thing' }, handler)
    const res = await route(get({ authorization: `Bearer ${CRON_SECRET}` }))

    expect(res.status).toBe(200)
    expect(handler.mock.calls[0][0].actor).toEqual({ kind: 'cron' })
  })

  it('fails closed with a 500 when a route declares an empty policy', async () => {
    const handler = makeHandler()

    // An empty allow list is a configuration mistake, not a policy. The type
    // rejects it (hence the directive); if one reaches the wrapper anyway, the
    // request must be refused rather than treated as public.
    // @ts-expect-error — an empty allow list is rejected by the type as well
    const route = withRoute({ actor: { allow: [] }, operation: 'thing.read' }, handler)
    const res = await route(get())

    expect(res.status).toBe(500)
    expect(handler).not.toHaveBeenCalled()
  })
})

describe('B7-B — withRoute: validation', () => {
  const bodySchema = z.object({ title: z.string().min(1, 'Title is required.') })

  it('parses a valid body and hands it to the handler typed', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)
    const handler = vi.fn(async (ctx: { body: { title: string } }) => Response.json({ got: ctx.body.title }))

    const route = withRoute(
      { actor: { allow: ['learner'] }, operation: 'thing.create', body: bodySchema },
      handler
    )
    const res = await route(post({ title: 'hello' }))

    expect(await res.json()).toEqual({ got: 'hello' })
  })

  it('rejects an invalid body with 400 VALIDATION and the schema message', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)
    const handler = makeHandler()

    const route = withRoute(
      { actor: { allow: ['learner'] }, operation: 'thing.create', body: bodySchema },
      handler
    )
    const res = await route(post({ title: '' }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.code).toBe('VALIDATION')
    expect(body.error).toBe('Title is required.')
    expect(handler).not.toHaveBeenCalled()
  })

  it('rejects a malformed JSON body with 400 VALIDATION rather than a 500', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)

    const request = new Request('https://prodily.app/api/thing', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    })
    const route = withRoute(
      { actor: { allow: ['learner'] }, operation: 'thing.create', body: bodySchema },
      async () => Response.json({ success: true })
    )
    const res = await route(request)

    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('VALIDATION')
  })

  it('parses query parameters when a query schema is declared', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)
    const querySchema = z.object({ page: z.coerce.number(), tag: z.string().optional() })
    const handler = vi.fn(async (ctx: { query: { page: number; tag?: string } }) =>
      Response.json({ page: ctx.query.page, tag: ctx.query.tag })
    )

    const route = withRoute(
      { actor: { allow: ['learner'] }, operation: 'thing.read', query: querySchema },
      handler
    )
    const res = await route(get())

    expect(await res.json()).toEqual({ page: 2, tag: 'x' })
  })

  it('rejects invalid query parameters with 400 VALIDATION', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)
    const querySchema = z.object({ page: z.enum(['1']) })

    const route = withRoute(
      { actor: { allow: ['learner'] }, operation: 'thing.read', query: querySchema },
      async () => Response.json({ success: true })
    )
    const res = await route(get())

    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('VALIDATION')
  })

  it('does not read the body when no body schema is declared', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)
    const request = post({ anything: true })

    const route = withRoute({ actor: { allow: ['learner'] }, operation: 'thing.read' }, async () =>
      Response.json({ success: true })
    )
    await route(request)

    // The route handler must still be able to read the stream itself.
    expect(request.bodyUsed).toBe(false)
  })
})

describe('B7-B — withRoute: rate limiting', () => {
  const rule = { key: () => 'thing:global', limit: 5, windowMs: 60_000 }

  it('evaluates declared rules and proceeds when under the limit', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)
    const handler = makeHandler()

    const route = withRoute(
      { actor: { allow: ['learner'] }, operation: 'thing.read', rateLimit: [rule] },
      handler
    )
    const res = await route(get())

    expect(evaluatePersistentRateLimit).toHaveBeenCalledWith('thing:global', expect.objectContaining({ limit: 5 }))
    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalled()
  })

  it('keys a rule on the resolved actor', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)

    const route = withRoute(
      {
        actor: { allow: ['learner'] },
        operation: 'thing.read',
        rateLimit: [{ key: (ctx) => `thing:${ctx.actor.kind}`, limit: 5, windowMs: 1000 }],
      },
      async () => Response.json({ success: true })
    )
    await route(get())

    expect(evaluatePersistentRateLimit).toHaveBeenCalledWith('thing:learner', expect.anything())
  })

  it('refuses with 429 without disclosing which bucket tripped', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)
    evaluatePersistentRateLimit
      .mockResolvedValueOnce({ success: true, remaining: 4, resetInMs: 500 })
      .mockResolvedValueOnce({ success: false, remaining: 0, resetInMs: 9000 })
    const handler = makeHandler()

    const route = withRoute(
      {
        actor: { allow: ['learner'] },
        operation: 'thing.read',
        rateLimit: [
          { key: () => 'thing:ip', limit: 5, windowMs: 1000 },
          { key: () => 'thing:email', limit: 5, windowMs: 1000 },
        ],
      },
      handler
    )
    const res = await route(get())
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(body.code).toBe('RATE_LIMITED')
    expect(handler).not.toHaveBeenCalled()
    // I-03-B6: a refusal must not say which limiter refused it.
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain('thing:ip')
    expect(serialized).not.toContain('thing:email')
  })

  it('reports the longest reset window across all tripped rules', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)
    evaluatePersistentRateLimit
      .mockResolvedValueOnce({ success: false, remaining: 0, resetInMs: 2000 })
      .mockResolvedValueOnce({ success: false, remaining: 0, resetInMs: 7000 })

    const route = withRoute(
      {
        actor: { allow: ['learner'] },
        operation: 'thing.read',
        rateLimit: [
          { key: () => 'a', limit: 1, windowMs: 1000 },
          { key: () => 'b', limit: 1, windowMs: 1000 },
        ],
      },
      async () => Response.json({ success: true })
    )
    const body = await (await route(get())).json()

    expect(body.resetInMs).toBe(7000)
  })

  it('skips a rule whose key resolves to null', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)

    const route = withRoute(
      {
        actor: { allow: ['learner'] },
        operation: 'thing.read',
        rateLimit: [{ key: () => null, limit: 5, windowMs: 1000 }],
      },
      async () => Response.json({ success: true })
    )
    const res = await route(get())

    expect(evaluatePersistentRateLimit).not.toHaveBeenCalled()
    expect(res.status).toBe(200)
  })

  it('forwards failClosed to the limiter', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)

    const route = withRoute(
      {
        actor: { allow: ['learner'] },
        operation: 'thing.send',
        rateLimit: [{ key: () => 'spend', limit: 1, windowMs: 1000, failClosed: true }],
      },
      async () => Response.json({ success: true })
    )
    await route(get())

    expect(evaluatePersistentRateLimit).toHaveBeenCalledWith(
      'spend',
      expect.objectContaining({ failClosed: true })
    )
  })

  it('runs the limiter only after the actor is accepted', async () => {
    const route = withRoute(
      { actor: { allow: ['learner'] }, operation: 'thing.read', rateLimit: [rule] },
      async () => Response.json({ success: true })
    )
    const res = await route(get())

    expect(res.status).toBe(401)
    expect(evaluatePersistentRateLimit).not.toHaveBeenCalled()
  })
})

describe('B7-B — withRoute: error handling', () => {
  it('maps a thrown RouteError to its declared status and code, with no incident', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)

    const route = withRoute({ actor: { allow: ['learner'] }, operation: 'thing.create' }, async () => {
      throw new RouteError(409, 'DUPLICATE', 'That title is already taken.')
    })
    const res = await route(get())
    const body = await res.json()

    expect(res.status).toBe(409)
    // B9-B added `requestId` to every envelope. It is asserted by shape rather than
    // value because it is generated per request; the rest of the body is still
    // matched exactly.
    expect(body).toEqual({
      success: false,
      error: 'That title is already taken.',
      code: 'DUPLICATE',
      requestId: expect.stringMatching(/^req_[0-9a-f]{32}$/),
    })
    expect(body.errorId).toBeUndefined()
    expect(logErrorReport).not.toHaveBeenCalled()
  })

  it('carries RouteError extras into the envelope additively', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)

    const route = withRoute({ actor: { allow: ['learner'] }, operation: 'thing.create' }, async () => {
      throw new RouteError(403, 'SIGNUPS_DISABLED', 'Signups are closed.', { requiresWaitlist: true })
    })
    const body = await (await route(get())).json()

    expect(body.requiresWaitlist).toBe(true)
    expect(body.code).toBe('SIGNUPS_DISABLED')
  })

  it('converts an unexpected throw into a 500 with an errorId and an incident row', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)

    const route = withRoute(
      { actor: { allow: ['learner'] }, operation: 'thing.create', domain: 'api' },
      async () => {
        throw new Error('connect ECONNREFUSED 10.0.0.1:5432')
      }
    )
    const res = await route(get())
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.code).toBe('SERVER_ERROR')
    expect(body.errorId).toMatch(/^err_[0-9a-f]{16}$/)
    expect(logErrorReport).toHaveBeenCalledTimes(1)
    expect(logErrorReport.mock.calls[0][0]).toMatchObject({
      domain: 'api',
      kind: 'unexpected',
      operation: 'thing.create',
    })
  })

  it('never forwards the exception text to the client', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)

    const route = withRoute({ actor: { allow: ['learner'] }, operation: 'thing.create' }, async () => {
      throw new Error('connect ECONNREFUSED 10.0.0.1:5432')
    })
    const body = await (await route(get())).json()

    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED')
    expect(JSON.stringify(body)).not.toContain('10.0.0.1')
  })

  it('emits the ADR-006 envelope shape exactly', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)

    const route = withRoute({ actor: { allow: ['learner'] }, operation: 'thing.create' }, async () => {
      throw new Error('boom')
    })
    const body = await (await route(get())).json()

    // `requestId` joined the envelope in B9-B. It sits alongside `errorId` rather
    // than replacing it: `errorId` names the failure, `requestId` names the request.
    expect(Object.keys(body).sort()).toEqual(['code', 'error', 'errorId', 'requestId', 'success'])
    expect(body.success).toBe(false)
    expect(typeof body.error).toBe('string')
    expect(body.requestId).toMatch(/^req_[0-9a-f]{32}$/)
  })

  it('uses the route-declared incident summary when one is given', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)

    const route = withRoute(
      {
        actor: { allow: ['learner'] },
        operation: 'cron.process_broadcasts',
        domain: 'cron',
        summary: 'Unexpected failure while processing scheduled broadcasts',
      },
      async () => {
        throw new Error('boom')
      }
    )
    await route(get())

    expect(logErrorReport.mock.calls[0][0]).toMatchObject({
      domain: 'cron',
      summary: 'Unexpected failure while processing scheduled broadcasts',
    })
  })

  it('uses route-declared failure copy and code, preserving the ADR-006 auth invariant', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)
    const { AUTH_SERVICE_UNAVAILABLE_MESSAGE } = await import('@/lib/errors/api-response')

    const route = withRoute(
      {
        actor: { allow: ['learner'] },
        operation: 'auth.login',
        domain: 'auth',
        errorMessage: AUTH_SERVICE_UNAVAILABLE_MESSAGE,
        errorCode: 'SERVER_ERROR',
      },
      async () => {
        throw new Error('provider exploded')
      }
    )
    const body = await (await route(get())).json()

    // The auth screens re-classify whatever string they receive; this copy is
    // phrased so it still reads as AUTH_PROVIDER_UNAVAILABLE rather than collapsing
    // to AUTH_UNKNOWN_ERROR.
    expect(body.error).toBe(AUTH_SERVICE_UNAVAILABLE_MESSAGE)
    expect(body.code).toBe('SERVER_ERROR')
    expect(body.errorId).toMatch(/^err_/)
  })

  it('falls back to a summary derived from the operation', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)

    const route = withRoute({ actor: { allow: ['learner'] }, operation: 'thing.create' }, async () => {
      throw new Error('boom')
    })
    await route(get())

    expect(logErrorReport.mock.calls[0][0].summary).toBe('Unhandled exception in thing.create')
  })

  it('still returns a 500 when the incident write itself fails', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)
    logErrorReport.mockRejectedValue(new Error('incident sink down'))

    const route = withRoute({ actor: { allow: ['learner'] }, operation: 'thing.create' }, async () => {
      throw new Error('boom')
    })
    const res = await route(get())

    expect(res.status).toBe(500)
    expect((await res.json()).errorId).toMatch(/^err_/)
  })
})

describe('B7-B — withRoute: handler behaviour is preserved', () => {
  it('returns the handler response untouched, including status and headers', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)

    const route = withRoute({ actor: { allow: ['learner'] }, operation: 'thing.create' }, async () =>
      Response.json({ id: 'x' }, { status: 201, headers: { 'x-custom': 'kept' } })
    )
    const res = await route(get())

    expect(res.status).toBe(201)
    expect(res.headers.get('x-custom')).toBe('kept')
    expect(await res.json()).toEqual({ id: 'x' })
  })

  it('passes the request through to the handler', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)
    const request = get()
    const handler = makeHandler()

    const route = withRoute({ actor: { allow: ['learner'] }, operation: 'thing.read' }, handler)
    await route(request)

    expect(handler.mock.calls[0][0].request).toBe(request)
  })

  it('resolves and forwards dynamic route params', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)
    const handler = makeHandler()

    const route = withRoute({ actor: { allow: ['learner'] }, operation: 'thing.read' }, handler)
    await route(get(), { params: Promise.resolve({ id: 'abc' }) })

    expect(handler.mock.calls[0][0].params).toEqual({ id: 'abc' })
  })

  it('gives an empty params object when the route is not dynamic', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)
    const handler = makeHandler()

    const route = withRoute({ actor: { allow: ['learner'] }, operation: 'thing.read' }, handler)
    await route(get())

    expect(handler.mock.calls[0][0].params).toEqual({})
  })
})

describe('B7-B — withRoute: envelope is byte-compatible with lib/errors/api-response', () => {
  async function bodyOf(res: Response) {
    return await res.text()
  }

  it('emits the same bytes as a direct apiError for a refusal', async () => {
    const { apiError } = await import('@/lib/errors/api-response')
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)

    const route = withRoute({ actor: { allow: ['learner'] }, operation: 'thing.create' }, async () => {
      throw new RouteError(409, 'DUPLICATE', 'That title is already taken.')
    })

    const wrapped = await route(get())
    // The id is generated per request, so it is read off the wrapper's own response
    // and handed to the direct call. The comparison stays byte-exact.
    const requestId = wrapped.headers.get('x-request-id') as string
    const direct = apiError({
      status: 409,
      code: 'DUPLICATE',
      message: 'That title is already taken.',
      requestId,
    })

    expect(requestId).toMatch(/^req_[0-9a-f]{32}$/)
    expect(await bodyOf(wrapped)).toBe(await bodyOf(direct))
    expect(wrapped.status).toBe(direct.status)
  })

  it('emits the same bytes as a direct apiError for a 401 denial', async () => {
    const { apiError } = await import('@/lib/errors/api-response')

    const route = withRoute({ actor: { allow: ['learner'] }, operation: 'thing.read' }, async () =>
      Response.json({ success: true })
    )

    const wrapped = await route(get())
    const direct = apiError({
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Authentication required.',
      requestId: wrapped.headers.get('x-request-id') as string,
    })

    expect(await bodyOf(wrapped)).toBe(await bodyOf(direct))
  })

  it('emits the same bytes as a direct apiError for a rate-limit refusal', async () => {
    const { apiError } = await import('@/lib/errors/api-response')
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)
    evaluatePersistentRateLimit.mockResolvedValue({ success: false, remaining: 0, resetInMs: 4242 })

    const route = withRoute(
      {
        actor: { allow: ['learner'] },
        operation: 'thing.read',
        rateLimit: [{ key: () => 'bucket', limit: 1, windowMs: 1000 }],
      },
      async () => Response.json({ success: true })
    )

    const wrapped = await route(get())
    const direct = apiError({
      status: 429,
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please wait a while before trying again.',
      requestId: wrapped.headers.get('x-request-id') as string,
      extra: { resetInMs: 4242 },
    })

    expect(await bodyOf(wrapped)).toBe(await bodyOf(direct))
  })

  it('routes every refusal through apiError, so redaction still applies', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)

    // apiError() sanitizes its message as a last line of defence. A handler that
    // carelessly puts a credential in a RouteError must not publish it.
    const route = withRoute({ actor: { allow: ['learner'] }, operation: 'thing.create' }, async () => {
      throw new RouteError(400, 'VALIDATION', 'Rejected token re_TestPlaceholder_NotARealResendKey000 here.')
    })
    const body = await (await route(get())).json()

    expect(body.error).not.toContain('TestPlaceholder_NotARealResendKey000')
    expect(body.error).toContain('[REDACTED]')
  })
})

describe('B7-B — withRoute: onDenied hook', () => {
  it('runs on a 401 actor denial and receives the denial detail', async () => {
    const onDenied = vi.fn()

    const route = withRoute(
      { actor: { allow: ['learner'] }, operation: 'thing.read', onDenied },
      async () => Response.json({ success: true })
    )
    await route(get())

    expect(onDenied).toHaveBeenCalledTimes(1)
    expect(onDenied.mock.calls[0][0].denial).toMatchObject({ status: 401, code: 'UNAUTHORIZED' })
    expect(onDenied.mock.calls[0][0].request).toBeInstanceOf(Request)
  })

  it('runs on a 403 actor denial', async () => {
    requireAdminUser.mockResolvedValue({
      authorized: false,
      error: 'Access denied: Admin privileges required',
      statusCode: 403,
    })
    const onDenied = vi.fn()

    const route = withRoute(
      { actor: { allow: ['admin'] }, operation: 'admin.thing', onDenied },
      async () => Response.json({ success: true })
    )
    await route(get())

    expect(onDenied.mock.calls[0][0].denial).toMatchObject({ status: 403, code: 'FORBIDDEN' })
  })

  it('does not run when the actor resolves', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)
    const onDenied = vi.fn()

    const route = withRoute(
      { actor: { allow: ['learner'] }, operation: 'thing.read', onDenied },
      async () => Response.json({ success: true })
    )
    await route(get())

    expect(onDenied).not.toHaveBeenCalled()
  })

  it('does not run for a validation failure', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)
    const onDenied = vi.fn()

    const route = withRoute(
      {
        actor: { allow: ['learner'] },
        operation: 'thing.create',
        body: z.object({ title: z.string().min(1) }),
        onDenied,
      },
      async () => Response.json({ success: true })
    )
    const res = await route(post({ title: '' }))

    expect(res.status).toBe(400)
    expect(onDenied).not.toHaveBeenCalled()
  })

  it('does not run for a rate-limit refusal', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)
    evaluatePersistentRateLimit.mockResolvedValue({ success: false, remaining: 0, resetInMs: 100 })
    const onDenied = vi.fn()

    const route = withRoute(
      {
        actor: { allow: ['learner'] },
        operation: 'thing.read',
        rateLimit: [{ key: () => 'b', limit: 1, windowMs: 1000 }],
        onDenied,
      },
      async () => Response.json({ success: true })
    )
    const res = await route(get())

    expect(res.status).toBe(429)
    expect(onDenied).not.toHaveBeenCalled()
  })

  it('does not run when the handler throws', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)
    const onDenied = vi.fn()

    const route = withRoute(
      { actor: { allow: ['learner'] }, operation: 'thing.read', onDenied },
      async () => {
        throw new Error('boom')
      }
    )
    const res = await route(get())

    expect(res.status).toBe(500)
    expect(onDenied).not.toHaveBeenCalled()
  })

  it('is awaited, so a fire-and-forget log cannot be dropped before the response', async () => {
    let settled = false
    const onDenied = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      settled = true
    })

    const route = withRoute(
      { actor: { allow: ['learner'] }, operation: 'thing.read', onDenied },
      async () => Response.json({ success: true })
    )
    await route(get())

    expect(settled).toBe(true)
  })

  it('never lets a failing hook change the response', async () => {
    const onDenied = vi.fn(async () => {
      throw new Error('logging sink down')
    })

    const route = withRoute(
      { actor: { allow: ['learner'] }, operation: 'thing.read', onDenied },
      async () => Response.json({ success: true })
    )
    const res = await route(get())
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.code).toBe('UNAUTHORIZED')
    expect(body.errorId).toBeUndefined()
  })

  it('keeps the internal denial reason out of the client response', async () => {
    requireAdminUser.mockResolvedValue({
      authorized: false,
      error: 'Access denied: Admin privileges required',
      statusCode: 403,
    })
    const onDenied = vi.fn()

    const route = withRoute(
      { actor: { allow: ['admin'] }, operation: 'admin.thing', onDenied },
      async () => Response.json({ success: true })
    )
    const res = await route(get())

    // The hook sees the reason; the client never does.
    expect(onDenied.mock.calls[0][0].denial.reason).toContain('Admin privileges required')
    expect(JSON.stringify(await res.json())).not.toContain('Admin privileges required')
  })
})

// The "no route imports this yet" guard that lived here belonged to B7-B, when the
// wrapper had no consumers. B7-C migrated the six cron routes, so migration scope is
// now asserted in exactly one place — b7c-cron-route-migration.test.ts, which pins the
// precise set of route files allowed to import the wrapper. Duplicating it here would
// mean two assertions to update on every future wave, and one of them would drift.
