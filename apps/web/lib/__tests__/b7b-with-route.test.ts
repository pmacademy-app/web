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
    const handler = vi.fn(async (_ctx: Ctx) => Response.json({ success: true }))

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
    const handler = vi.fn(async (_ctx: Ctx) => Response.json({ success: true }))

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
    const handler = vi.fn(async (_ctx: Ctx) => Response.json({ success: true }))

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
    const handler = vi.fn(async (_ctx: Ctx) => Response.json({ success: true }))

    const route = withRoute({ actor: { allow: ['cron', 'admin'] }, operation: 'cron.thing' }, handler)
    const res = await route(get({ authorization: `Bearer ${CRON_SECRET}` }))

    expect(res.status).toBe(200)
    expect(handler.mock.calls[0][0].actor).toEqual({ kind: 'cron' })
  })

  it('fails closed with a 500 when a route declares an empty policy', async () => {
    const handler = vi.fn(async (_ctx: Ctx) => Response.json({ success: true }))

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
    const handler = vi.fn(async (_ctx: Ctx) => Response.json({ success: true }))

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
    const handler = vi.fn(async (_ctx: Ctx) => Response.json({ success: true }))

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
    const handler = vi.fn(async (_ctx: Ctx) => Response.json({ success: true }))

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
    expect(body).toEqual({ success: false, error: 'That title is already taken.', code: 'DUPLICATE' })
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

    expect(Object.keys(body).sort()).toEqual(['code', 'error', 'errorId', 'success'])
    expect(body.success).toBe(false)
    expect(typeof body.error).toBe('string')
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
    const handler = vi.fn(async (_ctx: Ctx) => Response.json({ success: true }))

    const route = withRoute({ actor: { allow: ['learner'] }, operation: 'thing.read' }, handler)
    await route(request)

    expect(handler.mock.calls[0][0].request).toBe(request)
  })

  it('resolves and forwards dynamic route params', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)
    const handler = vi.fn(async (_ctx: Ctx) => Response.json({ success: true }))

    const route = withRoute({ actor: { allow: ['learner'] }, operation: 'thing.read' }, handler)
    await route(get(), { params: Promise.resolve({ id: 'abc' }) })

    expect(handler.mock.calls[0][0].params).toEqual({ id: 'abc' })
  })

  it('gives an empty params object when the route is not dynamic', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)
    const handler = vi.fn(async (_ctx: Ctx) => Response.json({ success: true }))

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
    const direct = apiError({ status: 409, code: 'DUPLICATE', message: 'That title is already taken.' })

    expect(await bodyOf(wrapped)).toBe(await bodyOf(direct))
    expect(wrapped.status).toBe(direct.status)
  })

  it('emits the same bytes as a direct apiError for a 401 denial', async () => {
    const { apiError } = await import('@/lib/errors/api-response')

    const route = withRoute({ actor: { allow: ['learner'] }, operation: 'thing.read' }, async () =>
      Response.json({ success: true })
    )

    const wrapped = await route(get())
    const direct = apiError({ status: 401, code: 'UNAUTHORIZED', message: 'Authentication required.' })

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

describe('B7-B — withRoute: no route was migrated', () => {
  it('is imported by no route handler yet', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs')
    const path = await import('node:path')
    const apiDir = path.resolve(import.meta.dirname, '../../app/api')

    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry)
        if (statSync(full).isDirectory()) walk(full)
        else if (entry === 'route.ts' && readFileSync(full, 'utf8').includes('@/lib/api/with-route')) {
          offenders.push(full)
        }
      }
    }
    walk(apiDir)

    expect(offenders).toEqual([])
  })
})
