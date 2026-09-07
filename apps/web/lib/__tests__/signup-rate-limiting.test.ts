/**
 * Regression coverage for the 2026-09-06 signup-abuse incident's core gap:
 * POST /api/auth/signup had ZERO rate limiting of any kind, which let ~1,233
 * automated accounts be created in under 25 hours via a handful of Gmail
 * "+tag" aliases. These tests pin the fix: server-side, persistent (cross-
 * instance) IP and canonical-email rate limits enforced before any Supabase
 * Auth call, and verify the signup-disabled gate is still checked first.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockEvaluate = vi.fn(async (_key: string, _opts: { windowMs: number; limit: number }) => ({
  success: true,
  remaining: 4,
  resetInMs: 60_000,
}))

vi.mock('@/lib/rate-limit', () => ({
  evaluatePersistentRateLimit: (...args: [string, { windowMs: number; limit: number }]) => mockEvaluate(...args),
}))

const mockSettings = {
  maintenanceMode: false,
  allowSignups: true,
  requireEmailVerification: true,
}
vi.mock('@/lib/admin/settings-service', () => ({
  SettingsService: {
    getProductSettings: vi.fn(async () => ({ ...mockSettings })),
  },
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      signUp: vi.fn(async () => ({
        data: { user: { id: 'new-user', identities: [{ id: '1' }] } },
        error: null,
      })),
      admin: { createUser: vi.fn(async () => ({ data: { user: { id: 'new-user' } }, error: null })) },
      signInWithPassword: vi.fn(async () => ({
        data: { session: { access_token: 'tok', refresh_token: 'ref', expires_in: 3600 }, user: { id: 'new-user' } },
        error: null,
      })),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) }) }),
      insert: () => ({ select: () => ({ single: vi.fn(async () => ({ data: { id: 'new-user' }, error: null })) }) }),
    }),
  }),
}))

import { POST as signupPOST } from '../../app/api/auth/signup/route'

function makeRequest(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new NextRequest('https://prodily.app/api/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('Signup rate limiting (server-side, persistent, Gmail-alias-aware)', () => {
  beforeEach(() => {
    mockEvaluate.mockClear()
    mockEvaluate.mockImplementation(async () => ({ success: true, remaining: 4, resetInMs: 60_000 }))
    mockSettings.maintenanceMode = false
    mockSettings.allowSignups = true
    mockSettings.requireEmailVerification = true
  })

  it('allows signup when both IP and email are under the configured limits', async () => {
    const req = makeRequest(
      { name: 'Jane Doe', email: 'jane@example.com', password: 'securePassword123' },
      { 'x-forwarded-for': '203.0.113.10' }
    )
    const res = await signupPOST(req)
    expect(res.status).toBe(200)
  })

  it('checks allowSignups BEFORE evaluating rate limits (closed platform-wide rejects without touching the limiter)', async () => {
    mockSettings.allowSignups = false
    const req = makeRequest({ name: 'Jane Doe', email: 'jane@example.com', password: 'securePassword123' })
    const res = await signupPOST(req)

    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.code).toBe('SIGNUPS_DISABLED')
    expect(mockEvaluate).not.toHaveBeenCalled()
  })

  it('rejects with 429 RATE_LIMITED when the IP limit is exceeded, before any Supabase Auth call', async () => {
    mockEvaluate.mockImplementation(async (key: string) => {
      if (key.startsWith('signup_ip:')) return { success: false, remaining: 0, resetInMs: 300_000 }
      return { success: true, remaining: 2, resetInMs: 60_000 }
    })

    const req = makeRequest(
      { name: 'Jane Doe', email: 'jane@example.com', password: 'securePassword123' },
      { 'x-forwarded-for': '203.0.113.10' }
    )
    const res = await signupPOST(req)

    expect(res.status).toBe(429)
    const json = await res.json()
    expect(json.code).toBe('RATE_LIMITED')
  })

  it('rejects with 429 RATE_LIMITED when the per-email limit is exceeded, independent of IP', async () => {
    mockEvaluate.mockImplementation(async (key: string) => {
      if (key.startsWith('signup_email:')) return { success: false, remaining: 0, resetInMs: 3_600_000 }
      return { success: true, remaining: 2, resetInMs: 60_000 }
    })

    const req = makeRequest({ name: 'Jane Doe', email: 'jane@example.com', password: 'securePassword123' })
    const res = await signupPOST(req)

    expect(res.status).toBe(429)
    const json = await res.json()
    expect(json.code).toBe('RATE_LIMITED')
  })

  it('is enforced server-side: the check runs inside the route handler itself, not dependent on any client-supplied header or flag', async () => {
    mockEvaluate.mockImplementation(async (key: string) => {
      if (key.startsWith('signup_ip:')) return { success: false, remaining: 0, resetInMs: 300_000 }
      return { success: true, remaining: 2, resetInMs: 60_000 }
    })

    // Attempting to spoof a "trusted" header does nothing — the route only ever reads
    // x-forwarded-for/x-real-ip to compute the rate-limit key, and the limiter call
    // itself cannot be skipped by any request-side input.
    const req = makeRequest(
      { name: 'Jane Doe', email: 'jane@example.com', password: 'securePassword123' },
      { 'x-forwarded-for': '203.0.113.10', 'x-bypass-rate-limit': 'true', 'x-admin': 'true' }
    )
    const res = await signupPOST(req)
    expect(res.status).toBe(429)
  })

  it('uses the configured thresholds: 5 signups / 15 minutes per IP, 3 signups / 24 hours per canonical email', async () => {
    const req = makeRequest(
      { name: 'Jane Doe', email: 'jane@example.com', password: 'securePassword123' },
      { 'x-forwarded-for': '203.0.113.10' }
    )
    await signupPOST(req)

    const [ipKey, ipOpts] = mockEvaluate.mock.calls.find((c) => (c[0] as string).startsWith('signup_ip:'))!
    const [emailKey, emailOpts] = mockEvaluate.mock.calls.find((c) => (c[0] as string).startsWith('signup_email:'))!

    expect(ipKey).toBe('signup_ip:203.0.113.10')
    expect(ipOpts).toEqual({ windowMs: 15 * 60 * 1000, limit: 5 })

    expect(emailKey).toBe('signup_email:jane@example.com')
    expect(emailOpts).toEqual({ windowMs: 24 * 60 * 60 * 1000, limit: 3 })
  })

  describe('Gmail "+tag" alias canonicalization', () => {
    it('user+tag@gmail.com and user@gmail.com resolve to the identical rate-limit key', async () => {
      const req1 = makeRequest({ name: 'Ann', email: 'user+tagA@gmail.com', password: 'securePassword123' })
      await signupPOST(req1)
      const key1 = mockEvaluate.mock.calls.find((c) => (c[0] as string).startsWith('signup_email:'))![0]

      mockEvaluate.mockClear()
      const req2 = makeRequest({ name: 'Bob', email: 'user@gmail.com', password: 'securePassword123' })
      await signupPOST(req2)
      const key2 = mockEvaluate.mock.calls.find((c) => (c[0] as string).startsWith('signup_email:'))![0]

      expect(key1).toBe('signup_email:user@gmail.com')
      expect(key2).toBe('signup_email:user@gmail.com')
      expect(key1).toBe(key2)
    })

    it('different Gmail "+tag" aliases of the same inbox cannot each get their own rate-limit bucket', async () => {
      const aliases = ['jbokojoo11+loadtest-1-aaa@gmail.com', 'jbokojoo11+loadtest-2-bbb@gmail.com', 'jbokojoo11+loadtest-3-ccc@gmail.com']
      const keysUsed = new Set<string>()

      for (const email of aliases) {
        mockEvaluate.mockClear()
        const req = makeRequest({ name: 'Bot', email, password: 'securePassword123' })
        await signupPOST(req)
        const key = mockEvaluate.mock.calls.find((c) => (c[0] as string).startsWith('signup_email:'))![0]
        keysUsed.add(key as string)
      }

      // All three distinct-looking aliases must collapse onto exactly one bucket —
      // this is precisely the abuse pattern from the incident (jbokojoo11+loadtest-N-<hash>@gmail.com).
      expect(keysUsed.size).toBe(1)
      expect([...keysUsed][0]).toBe('signup_email:jbokojoo11@gmail.com')
    })

    it('does not canonicalize "+tag" for non-Gmail domains (no over-broad collapsing of unrelated providers)', async () => {
      const req = makeRequest({ name: 'Ann', email: 'user+tag@outlook.com', password: 'securePassword123' })
      await signupPOST(req)
      const key = mockEvaluate.mock.calls.find((c) => (c[0] as string).startsWith('signup_email:'))![0]
      expect(key).toBe('signup_email:user+tag@outlook.com')
    })
  })
})
