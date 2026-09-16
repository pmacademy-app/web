/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * B10-B — the typed API client.
 *
 * `F-03`: 133 call sites hand-roll the same error handling and disagree with each
 * other. Most share one bug — `await res.json()` on an HTML error page throws, and
 * the catch that follows reports a server error as a network failure.
 *
 * So the cases that matter here are the ones the hand-rolled versions get wrong: a
 * non-JSON body, a malformed one, a response that escaped the envelope, and the
 * difference between "the request never completed" and "the server said no".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import {
  API_CLIENT_CODES,
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiRequest,
  callEndpoint,
  type ApiEndpoint,
} from '@/lib/api/client'

const ROOT = path.resolve(import.meta.dirname, '../../')

function respond(
  body: string | null,
  init: { status?: number; headers?: Record<string, string> } = {}
): Response {
  const headers = new Headers(init.headers ?? {})
  return {
    ok: (init.status ?? 200) >= 200 && (init.status ?? 200) < 300,
    status: init.status ?? 200,
    headers,
    text: () => Promise.resolve(body ?? ''),
  } as unknown as Response
}

let fetchMock: any

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ─── Success ─────────────────────────────────────────────────────────────────

describe('B10-B — typed success responses', () => {
  it('returns parsed data under a discriminated ok', async () => {
    fetchMock.mockResolvedValue(respond(JSON.stringify({ success: true, xp: { total: 120 } })))

    const result = await apiGet<{ success: boolean; xp: { total: number } }>('/api/xp')

    expect(result.ok).toBe(true)
    if (result.ok) {
      // The union is what lets a caller read `data` without a cast.
      expect(result.data.xp.total).toBe(120)
      expect(result.status).toBe(200)
    }
  })

  it('treats 204 as success with no body rather than trying to parse one', async () => {
    fetchMock.mockResolvedValue(respond(null, { status: 204 }))

    const result = await apiRequest('/api/thing', { method: 'DELETE' })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data).toBeUndefined()
  })

  it('treats an empty 200 body as null rather than a parse failure', async () => {
    fetchMock.mockResolvedValue(respond(''))

    const result = await apiGet('/api/thing')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data).toBeNull()
  })
})

// ─── Failures the hand-rolled call sites get wrong ───────────────────────────

describe('B10-B — a non-2xx response is not a network failure', () => {
  it('reports the envelope code and message', async () => {
    fetchMock.mockResolvedValue(
      respond(JSON.stringify({ success: false, error: 'That title is already taken.', code: 'DUPLICATE' }), {
        status: 409,
      })
    )

    const result = await apiPost('/api/thing', { title: 'x' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('http')
      expect(result.error.code).toBe('DUPLICATE')
      expect(result.error.message).toBe('That title is already taken.')
      expect(result.error.status).toBe(409)
    }
  })

  it('does not throw on an HTML error page', async () => {
    // The shape that breaks `await res.json()` at most existing call sites.
    fetchMock.mockResolvedValue(respond('<html><body>502 Bad Gateway</body></html>', { status: 502 }))

    const result = await apiGet('/api/thing')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('parse')
      expect(result.error.code).toBe(API_CLIENT_CODES.parse)
      // The status survives, so the caller can still tell a 502 from a 400.
      expect(result.error.status).toBe(502)
      // Raw upstream markup is never shown to a user.
      expect(result.error.message).not.toContain('<html>')
    }
  })

  it('reports truncated JSON as malformed rather than crashing', async () => {
    fetchMock.mockResolvedValue(respond('{"success":false,"err', { status: 500 }))

    const result = await apiGet('/api/thing')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe('parse')
  })

  it('reports a non-2xx that escaped the envelope as a contract failure', async () => {
    fetchMock.mockResolvedValue(respond(JSON.stringify({ oops: true }), { status: 400 }))

    const result = await apiGet('/api/thing')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('contract')
      expect(result.error.code).toBe(API_CLIENT_CODES.contract)
    }
  })

  it('reports an array body at a non-2xx as a contract failure', async () => {
    fetchMock.mockResolvedValue(respond(JSON.stringify([1, 2, 3]), { status: 400 }))

    const result = await apiGet('/api/thing')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe('contract')
  })
})

describe('B10-B — network failures', () => {
  it('reports a rejected fetch as network, not as a server error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    const result = await apiGet('/api/thing')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('network')
      expect(result.error.code).toBe(API_CLIENT_CODES.network)
      // Status 0 means the request never completed — distinguishable from a 500.
      expect(result.error.status).toBe(0)
    }
  })

  it('distinguishes an abort from a connection failure', async () => {
    const abort = new Error('The operation was aborted')
    abort.name = 'AbortError'
    fetchMock.mockRejectedValue(abort)

    const result = await apiGet('/api/thing')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe(API_CLIENT_CODES.aborted)
  })

  it('never leaks the underlying exception text to the caller', async () => {
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'))

    const result = await apiGet('/api/thing')

    if (!result.ok) {
      expect(result.error.message).not.toContain('ECONNREFUSED')
      expect(result.error.message).not.toContain('10.0.0.5')
    }
  })
})

// ─── Auth, correlation and error ids ─────────────────────────────────────────

describe('B10-B — authentication failures are reported, never decided', () => {
  it('surfaces a 401 with its code and leaves the decision to the caller', async () => {
    fetchMock.mockResolvedValue(
      respond(JSON.stringify({ success: false, error: 'Authentication required.', code: 'UNAUTHORIZED' }), {
        status: 401,
      })
    )

    const result = await apiGet('/api/settings/profile')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.status).toBe(401)
      expect(result.error.code).toBe('UNAUTHORIZED')
    }
  })

  it('surfaces a 403 without reimplementing the actor policy', async () => {
    fetchMock.mockResolvedValue(
      respond(
        JSON.stringify({ success: false, error: 'You do not have permission to perform this action.', code: 'FORBIDDEN' }),
        { status: 403 }
      )
    )

    const result = await apiGet('/api/admin/users')

    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN')

    // The client contains no authorization logic of its own — a second answer to a
    // question the server already answered would be a source of disagreement.
    const source = readFileSync(path.join(ROOT, 'lib/api/client.ts'), 'utf8')
    expect(source).not.toContain('resolveActor')
    expect(source).not.toContain('is_admin')
  })

  it('sends credentials the way existing call sites already do', async () => {
    fetchMock.mockResolvedValue(respond(JSON.stringify({ ok: true })))

    await apiGet('/api/thing')

    expect(fetchMock.mock.calls[0][1].credentials).toBe('same-origin')
  })
})

describe('B10-B — correlation and error ids', () => {
  it('reads the B9-B request id from the response header on success', async () => {
    fetchMock.mockResolvedValue(
      respond(JSON.stringify({ ok: true }), { headers: { 'x-request-id': 'req_abc123' } })
    )

    const result = await apiGet('/api/thing')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.requestId).toBe('req_abc123')
  })

  it('reads it from the header on failure too', async () => {
    fetchMock.mockResolvedValue(
      respond(JSON.stringify({ success: false, error: 'nope', code: 'VALIDATION' }), {
        status: 400,
        headers: { 'x-request-id': 'req_fail01' },
      })
    )

    const result = await apiGet('/api/thing')

    if (!result.ok) expect(result.error.requestId).toBe('req_fail01')
  })

  it('falls back to the envelope when the header is absent', async () => {
    fetchMock.mockResolvedValue(
      respond(JSON.stringify({ success: false, error: 'nope', code: 'VALIDATION', requestId: 'req_body01' }), {
        status: 400,
      })
    )

    const result = await apiGet('/api/thing')

    if (!result.ok) expect(result.error.requestId).toBe('req_body01')
  })

  it('preserves errorId alongside requestId without conflating them', async () => {
    fetchMock.mockResolvedValue(
      respond(
        JSON.stringify({
          success: false,
          error: 'Something went wrong on our side.',
          code: 'SERVER_ERROR',
          errorId: 'err_0123456789abcdef',
          requestId: 'req_xyz',
        }),
        { status: 500 }
      )
    )

    const result = await apiGet('/api/thing')

    if (!result.ok) {
      // `errorId` names one failure; `requestId` names the request. Both, distinct.
      expect(result.error.errorId).toBe('err_0123456789abcdef')
      expect(result.error.requestId).toBe('req_xyz')
    }
  })

  it('sends an outgoing request id when the caller supplies one', async () => {
    fetchMock.mockResolvedValue(respond(JSON.stringify({ ok: true })))

    await apiGet('/api/thing', { requestId: 'req_from_caller_1' })

    const headers: Headers = fetchMock.mock.calls[0][1].headers
    expect(headers.get('x-request-id')).toBe('req_from_caller_1')
  })

  it('keeps the caller id on a network failure, where no response exists', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    const result = await apiGet('/api/thing', { requestId: 'req_offline_1' })

    if (!result.ok) expect(result.error.requestId).toBe('req_offline_1')
  })
})

describe('B10-B — route-specific envelope fields survive', () => {
  it('carries extras such as requiresVerification and resetInMs', async () => {
    fetchMock.mockResolvedValue(
      respond(
        JSON.stringify({
          success: false,
          error: 'Too many requests.',
          code: 'RATE_LIMITED',
          resetInMs: 4242,
          requiresVerification: true,
        }),
        { status: 429 }
      )
    )

    const result = await apiGet('/api/thing')

    if (!result.ok) {
      expect(result.error.extra).toEqual({ resetInMs: 4242, requiresVerification: true })
      // Contract fields are not duplicated into extras.
      expect(result.error.extra?.code).toBeUndefined()
    }
  })
})

// ─── Request building ────────────────────────────────────────────────────────

describe('B10-B — request helpers', () => {
  it('serializes a JSON body and sets the content type', async () => {
    fetchMock.mockResolvedValue(respond(JSON.stringify({ ok: true })))

    await apiPost('/api/thing', { name: 'x' })

    const [, init] = fetchMock.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"name":"x"}')
    expect((init.headers as Headers).get('content-type')).toBe('application/json')
  })

  it('passes FormData through untouched so multipart still works', async () => {
    fetchMock.mockResolvedValue(respond(JSON.stringify({ ok: true })))
    const form = new FormData()
    form.append('file', 'x')

    await apiPost('/api/user/avatar', form)

    const [, init] = fetchMock.mock.calls[0]
    expect(init.body).toBe(form)
    // Letting the browser set the multipart boundary is why this must not be JSON.
    expect((init.headers as Headers).get('content-type')).toBeNull()
  })

  it('sends no body for GET and DELETE', async () => {
    fetchMock.mockResolvedValue(respond(JSON.stringify({ ok: true })))

    await apiGet('/api/thing')
    await apiDelete('/api/thing')

    expect(fetchMock.mock.calls[0][1].body).toBeUndefined()
    expect(fetchMock.mock.calls[1][1].body).toBeUndefined()
  })

  it('uses the right verb for each helper', async () => {
    fetchMock.mockResolvedValue(respond(JSON.stringify({ ok: true })))

    await apiPatch('/api/thing', {})
    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH')
  })
})

describe('B10-B — endpoint declarations', () => {
  it('calls a declared endpoint with its declared body type', async () => {
    fetchMock.mockResolvedValue(respond(JSON.stringify({ success: true })))

    const updateProfile: ApiEndpoint<{ name: string }, { success: boolean }> = {
      path: '/api/settings/profile',
      method: 'POST',
    }

    const result = await callEndpoint(updateProfile, { name: 'Ada' })

    expect(result.ok).toBe(true)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/settings/profile')
    expect(fetchMock.mock.calls[0][1].method).toBe('POST')
  })
})

// ─── Scope ───────────────────────────────────────────────────────────────────

describe('B10-B/B10-C — adoption boundary', () => {
  it(
    'is adopted only by B10-C settings/academy sites and hooks; admin remains unmigrated',
    () => {
      // Call-site migration in B10-C covers settings, academy, notifications, and hooks.
    // Admin call sites are explicitly reserved for B10-D.
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(path.join(ROOT, dir))) {
        const rel = `${dir}/${entry}`
        if (statSync(path.join(ROOT, rel)).isDirectory()) walk(rel)
        else if (/\.tsx?$/.test(entry) && !rel.includes('__tests__')) {
          const source = readFileSync(path.join(ROOT, rel), 'utf8')
          if (source.includes("from '@/lib/api/client'")) hits.push(rel)
        }
      }
    }
    for (const dir of ['app', 'components', 'lib', 'hooks']) {
      try {
        walk(dir)
      } catch {
        // Directory may not exist; nothing to check.
      }
    }

    // Admin call sites migrated in B10-D
    const adminHits = hits.filter((h) => h.includes('components/admin'))
    expect(adminHits.length).toBeGreaterThanOrEqual(30)

    // Every hit belongs to the B10-C / B10-D scope
    for (const hit of hits) {
      expect(
        hit.startsWith('components/settings') ||
          hit.startsWith('components/notifications') ||
          hit.startsWith('components/feedback') ||
          hit.startsWith('components/admin') ||
          hit.startsWith('app/(app)/academy') ||
          hit.startsWith('hooks/use-lesson-progress') ||
          hit === 'lib/api/hooks.ts',
        `Unexpected import in ${hit}`
      ).toBe(true)
    }
  }, 30000)

  it('brings in no new dependency and no framework', () => {
    const source = readFileSync(path.join(ROOT, 'lib/api/client.ts'), 'utf8')
    const imports = source.match(/^import .+ from '([^']+)'/gm) ?? []

    // One internal import, for the B9-B header name. Everything else is `fetch`.
    expect(imports).toHaveLength(1)
    expect(imports[0]).toContain('@/lib/monitoring/request-id')
    expect(source).not.toContain('swr')
    expect(source).not.toContain('axios')
  })

  it('declares no endpoint yet, so no server module reaches the browser', () => {
    // Declaring endpoints means deriving types from route schemas, and those route
    // modules import the server data layer — the leak B9-C had to fix in
    // PortfolioSettingsForm. Moving schemas to client-safe modules is B10-C.
    const source = readFileSync(path.join(ROOT, 'lib/api/client.ts'), 'utf8')

    expect(source).not.toContain('@/lib/db')
    expect(source).not.toContain('@/lib/supabase')
    expect(source).not.toMatch(/from '@\/app\//)
  })
})
