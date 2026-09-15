/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * B9-B — request correlation ids.
 *
 * One value ties a request to the incident it produced. Before this, a
 * `system_errors` row said what failed and where but not *which call* it happened
 * on, so two learners hitting the same broken endpoint a second apart were
 * indistinguishable in the record.
 *
 * The parts worth testing are the ones with a decision in them: what happens to a
 * caller-supplied header (accepted when well-formed, discarded when not, never
 * trusted), that the same id reaches the response and the incident, that cron and
 * webhook traffic — which the proxy's matcher never sees — still gets one, and that
 * none of this becomes a channel for secrets.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import {
  REQUEST_ID_HEADER,
  generateRequestId,
  readInboundRequestId,
  resolveRequestId,
} from '@/lib/monitoring/request-id'

const logErrorReport = vi.fn()
const getAuthenticatedUserFromRequest = vi.fn()

vi.mock('@/lib/monitoring/logger', () => ({
  logErrorReport: (...args: any[]) => logErrorReport(...args),
  logSystemError: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  getAuthenticatedUserFromRequest: (req: Request) => getAuthenticatedUserFromRequest(req),
}))

vi.mock('@/lib/admin/guard', () => ({
  requireAdminUser: vi.fn().mockResolvedValue({ authorized: false, statusCode: 401 }),
  logAdminAction: vi.fn(),
}))

const { withRoute, RouteError } = await import('@/lib/api/with-route')

const LEARNER = { id: 'u-1', email: 'learner@prodily.app' }

// Built from char codes so the literals stay out of this source file — a raw
// control character in a test fixture is easy to lose in review and in diffs.
const NEWLINE = String.fromCharCode(10)
const CARRIAGE_RETURN = String.fromCharCode(13)
const NUL_BYTE = String.fromCharCode(0)
const ESCAPE = String.fromCharCode(27)
const GENERATED = /^req_[0-9a-f]{32}$/

function request(headers: Record<string, string> = {}): Request {
  return new Request('https://prodily.app/api/thing', { headers })
}

beforeEach(() => {
  logErrorReport.mockReset().mockResolvedValue(null)
  getAuthenticatedUserFromRequest.mockReset().mockResolvedValue(LEARNER)
})

// ─── Generation and inbound handling ─────────────────────────────────────────

describe('B9-B — resolving the id', () => {
  it('generates one when the caller supplies nothing', () => {
    const id = resolveRequestId(request())

    expect(id).toMatch(GENERATED)
  })

  it('generates a distinct id per call', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateRequestId()))

    expect(ids.size).toBe(50)
  })

  it('adopts a well-formed inbound id', () => {
    const id = resolveRequestId(request({ [REQUEST_ID_HEADER]: 'trace-abc123_XYZ' }))

    expect(id).toBe('trace-abc123_XYZ')
  })

  it('accepts the common trace formats', () => {
    for (const candidate of [
      '01JC5Q2M3N4P5Q6R7S8T9V0W1X', // ULID
      'b1946ac92492d2347c6235b4d2611184', // hex
      '550e8400-e29b-41d4-a716-446655440000', // UUID
      'V1StGXR8_Z5jdHi6B-myT', // nanoid
    ]) {
      expect(readInboundRequestId(new Headers({ [REQUEST_ID_HEADER]: candidate }))).toBe(candidate)
    }
  })
})

describe('B9-B — a malformed or hostile inbound id is discarded, not refused', () => {
  /**
   * A stub, because a real `Headers` refuses to hold several of these at all (see
   * the platform test below). The validator is still asserted against them
   * directly: it is the layer that has to hold if such a value ever arrives by
   * another route, and depending on the runtime to sanitise input is not a
   * guarantee this code gets to make.
   */
  const headersHolding = (value: string) => ({ get: () => value }) as unknown as Headers

  const REJECTED: Array<[string, string]> = [
    ['a newline, which could forge a second log line', `abc12345${NEWLINE}injected line`],
    ['a carriage return that could split a header', `abc12345${CARRIAGE_RETURN}Set-Cookie: x=1`],
    ['an ANSI escape aimed at an operator terminal', `abc12345${ESCAPE}[31mred`],
    ['a NUL byte', `abc12345${NUL_BYTE}`],
    ['a quote that would break out of a JSON string', 'abc12345"role":"admin'],
    ['whitespace', 'abc 12345'],
    ['too short to be a real trace id', 'short'],
    ['absurdly long', 'a'.repeat(129)],
    ['empty', ''],
  ]

  for (const [why, value] of REJECTED) {
    it(`rejects ${why}`, () => {
      expect(readInboundRequestId(headersHolding(value))).toBeNull()
    })
  }

  it('the runtime also refuses to build a header with a control character', () => {
    // Defence in depth, and the reason the stub above is needed. Both layers are
    // asserted so neither can later be dropped on the assumption the other covers it.
    for (const control of [NEWLINE, CARRIAGE_RETURN, NUL_BYTE]) {
      expect(() => new Headers({ [REQUEST_ID_HEADER]: `abc12345${control}x` })).toThrow()
    }
  })

  it('falls back to a generated id rather than failing the request', () => {
    const id = resolveRequestId(request({ [REQUEST_ID_HEADER]: 'bad value with spaces' }))

    expect(id).toMatch(GENERATED)
  })

  it('never lets a rejected value reach the response', async () => {
    const route = withRoute({ actor: { allow: ['learner'] }, operation: 'thing.read' }, async () =>
      Response.json({ ok: true })
    )

    const res = await route(request({ [REQUEST_ID_HEADER]: 'rejected because spaces' }))

    expect(res.headers.get(REQUEST_ID_HEADER)).toMatch(GENERATED)
    expect(res.headers.get(REQUEST_ID_HEADER)).not.toContain('rejected because')
  })
})

// ─── Propagation through withRoute ───────────────────────────────────────────

describe('B9-B — propagation', () => {
  it('hands the id to the handler and echoes the same value', async () => {
    let seen: string | undefined

    const route = withRoute({ actor: { allow: ['learner'] }, operation: 'thing.read' }, async (ctx) => {
      seen = ctx.requestId
      return Response.json({ ok: true })
    })

    const res = await route(request())

    expect(seen).toMatch(GENERATED)
    expect(res.headers.get(REQUEST_ID_HEADER)).toBe(seen)
  })

  it('reuses the id the proxy stamped instead of minting a second one', async () => {
    let seen: string | undefined

    const route = withRoute({ actor: { allow: ['learner'] }, operation: 'thing.read' }, async (ctx) => {
      seen = ctx.requestId
      return Response.json({ ok: true })
    })

    const res = await route(request({ [REQUEST_ID_HEADER]: 'proxy-stamped-0001' }))

    expect(seen).toBe('proxy-stamped-0001')
    expect(res.headers.get(REQUEST_ID_HEADER)).toBe('proxy-stamped-0001')
  })

  it('stamps the id on a success response as well as a failure', async () => {
    const route = withRoute({ actor: { allow: ['learner'] }, operation: 'thing.read' }, async () =>
      Response.json({ ok: true })
    )

    const res = await route(request())

    expect(res.status).toBe(200)
    expect(res.headers.get(REQUEST_ID_HEADER)).toMatch(GENERATED)
  })

  it('uses one id for a request, not one per exit path', async () => {
    let handlerId: string | undefined

    const route = withRoute({ actor: { allow: ['learner'] }, operation: 'thing.create' }, async (ctx) => {
      handlerId = ctx.requestId
      throw new RouteError(409, 'DUPLICATE', 'Already exists.')
    })

    const res = await route(request())
    const body = await res.json()

    expect(body.requestId).toBe(handlerId)
    expect(res.headers.get(REQUEST_ID_HEADER)).toBe(handlerId)
  })
})

// ─── Every refusal path carries it ───────────────────────────────────────────

describe('B9-B — the id is on every envelope the wrapper produces', () => {
  it('a 401 denial', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(null)
    const route = withRoute({ actor: { allow: ['learner'] }, operation: 'thing.read' }, async () =>
      Response.json({ ok: true })
    )

    const body = await (await route(request())).json()

    expect(body.requestId).toMatch(GENERATED)
  })

  it('a validation failure', async () => {
    const route = withRoute(
      {
        actor: { allow: ['learner'] },
        operation: 'thing.create',
        body: { safeParse: () => ({ success: false, error: { issues: [{ message: 'nope' }] } }) } as any,
      },
      async () => Response.json({ ok: true })
    )

    const res = await route(
      new Request('https://prodily.app/api/thing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.requestId).toMatch(GENERATED)
  })

  it('an unexpected fault, alongside the errorId it does not replace', async () => {
    const route = withRoute({ actor: { allow: ['learner'] }, operation: 'thing.create' }, async () => {
      throw new Error('boom')
    })

    const body = await (await route(request())).json()

    expect(body.requestId).toMatch(GENERATED)
    expect(body.errorId).toMatch(/^err_[0-9a-f]{16}$/)
    expect(body.requestId).not.toBe(body.errorId)
  })
})

// ─── It reaches the incident ─────────────────────────────────────────────────

describe('B9-B — the incident can be tied back to the request', () => {
  it('passes the id to logErrorReport', async () => {
    const route = withRoute({ actor: { allow: ['learner'] }, operation: 'thing.create' }, async () => {
      throw new Error('boom')
    })

    const res = await route(request({ [REQUEST_ID_HEADER]: 'trace-from-caller-1' }))

    expect(res.headers.get(REQUEST_ID_HEADER)).toBe('trace-from-caller-1')
    expect(logErrorReport).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'trace-from-caller-1' })
    )
  })

  it('keeps the id out of the fingerprint inputs', () => {
    // The fingerprint is built from domain, kind, operation and the stabilized
    // summary. A per-request value in it would give every occurrence of one
    // incident a distinct hash and defeat deduplication — the exact failure mode
    // `stabilizeForFingerprint` exists to prevent. Asserted against the source
    // because the hashing is internal to the logger.
    const logger = readFileSync(
      path.resolve(import.meta.dirname, '../monitoring/logger.ts'),
      'utf8'
    )
    const fingerprintCall = logger.slice(
      logger.indexOf('const fingerprint = buildFingerprint(['),
      logger.indexOf('])', logger.indexOf('const fingerprint = buildFingerprint(['))
    )

    expect(fingerprintCall).not.toContain('requestId')
  })
})

// ─── Cron and webhook traffic ────────────────────────────────────────────────

describe('B9-B — traffic the proxy never sees still gets an id', () => {
  it('a cron route resolves one even with no proxy hop', async () => {
    process.env.CRON_SECRET = 'test-cron-secret-value'
    let seen: string | undefined

    const route = withRoute(
      { actor: { allow: ['cron', 'admin'] }, operation: 'cron.thing' },
      async (ctx) => {
        seen = ctx.requestId
        return Response.json({ ok: true })
      }
    )

    const res = await route(
      new Request('https://prodily.app/api/cron/thing', {
        method: 'POST',
        headers: { authorization: 'Bearer test-cron-secret-value' },
      })
    )

    expect(res.status).toBe(200)
    expect(seen).toMatch(GENERATED)
    expect(res.headers.get(REQUEST_ID_HEADER)).toBe(seen)
    delete process.env.CRON_SECRET
  })

  it('the proxy matcher genuinely excludes those paths, which is why the wrapper resolves too', () => {
    const proxySource = readFileSync(path.resolve(import.meta.dirname, '../../proxy.ts'), 'utf8')
    const matcher = proxySource.slice(proxySource.indexOf('matcher: ['))

    for (const excluded of ['api/cron', 'api/health', 'api/email/webhooks', 'api/auth/callback']) {
      expect(matcher, excluded).toContain(excluded)
    }
  })

  it('leaves the raw-body webhook routes outside the wrapper untouched', () => {
    // They verify an HMAC over the exact bytes received; nothing here may read or
    // rewrite their body. They are exempt from `withRoute` and so from this batch.
    for (const rel of ['../../app/api/email/webhooks/route.ts', '../../app/api/auth/send-email-hook/route.ts']) {
      const source = readFileSync(path.resolve(import.meta.dirname, rel), 'utf8')
      expect(source, rel).not.toContain('resolveRequestId')
    }
  })
})

// ─── Nothing sensitive rides along ───────────────────────────────────────────

describe('B9-B — the id is not a channel for secrets', () => {
  it('is derived only from randomness, never from request credentials', async () => {
    const secretish = {
      authorization: 'Bearer super-secret-token-value',
      cookie: 'sb-access-token=secret-cookie-value',
    }

    const id = resolveRequestId(request(secretish))

    expect(id).toMatch(GENERATED)
    expect(id).not.toContain('secret')
    expect(id).not.toContain('Bearer')
  })

  it('logs no header values when reporting an incident', async () => {
    const route = withRoute({ actor: { allow: ['learner'] }, operation: 'thing.create' }, async () => {
      throw new Error('boom')
    })

    await route(
      request({
        authorization: 'Bearer super-secret-token-value',
        cookie: 'sb-access-token=secret-cookie-value',
      })
    )

    const reported = JSON.stringify(logErrorReport.mock.calls)
    expect(reported).not.toContain('super-secret-token-value')
    expect(reported).not.toContain('secret-cookie-value')
    expect(reported).not.toContain('Bearer')
  })

  it('the resolver reads exactly one header and nothing else', () => {
    const source = readFileSync(
      path.resolve(import.meta.dirname, '../monitoring/request-id.ts'),
      'utf8'
    )
    const reads = source.match(/headers\.get\(([^)]*)\)/g) ?? []

    expect(reads).toEqual(['headers.get(REQUEST_ID_HEADER)'])
  })
})
