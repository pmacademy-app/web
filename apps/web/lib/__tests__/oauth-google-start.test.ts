/**
 * GET /api/auth/google: starts Google sign-in.
 *
 * Drives the REAL auth-js `signInWithOAuth` through the real PKCE capture client
 * (it builds the provider URL locally, no network), so the verifier in the cookie is
 * the one auth-js would later expect. Only the rate limiter and the log are mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'

const { mockRateLimit, mockLog } = vi.hoisted(() => ({
  mockRateLimit: vi.fn(),
  mockLog: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    exception: vi.fn(),
    warnException: vi.fn(),
  },
}))

vi.mock('@/lib/rate-limit', () => ({ evaluatePersistentRateLimit: mockRateLimit }))
vi.mock('@/lib/monitoring/log', () => ({ log: mockLog }))

import { GET } from '../../app/api/auth/google/route'
import { OAUTH_INTENT_COOKIE, OAUTH_PKCE_COOKIE } from '@/lib/auth/oauth-cookies'
import { verifyOAuthIntent } from '@/lib/auth/oauth-intent'

const SECRET = 's'.repeat(40)

type CookieCall = { value: string; options: Record<string, unknown> }

/**
 * vitest.setup.ts mocks NextResponse with a cookie jar that drops options, so wrap
 * the redirect factory and record every cookies.set call (value and options).
 */
function recordRedirectCookies() {
  const calls = new Map<string, CookieCall>()
  const original = NextResponse.redirect.bind(NextResponse)
  const spy = vi.spyOn(NextResponse, 'redirect').mockImplementation((url: string | URL, init?: number | ResponseInit) => {
    const res = original(url, init)
    const forward = res.cookies.set.bind(res.cookies)
    res.cookies.set = ((name: string, value: string, options: Record<string, unknown>) => {
      calls.set(name, { value, options })
      forward(name, value)
    }) as typeof res.cookies.set
    return res
  })
  return { calls, spy }
}

/** Defaults to a same-origin navigation, which is what the signup page's link produces. */
function startRequest(query = '', headers: Record<string, string> = { 'sec-fetch-site': 'same-origin' }) {
  return new NextRequest(`http://localhost:3000/api/auth/google${query}`, {
    headers: { 'x-forwarded-for': '203.0.113.7', ...headers },
  })
}

function decodeIntent(token: string) {
  return verifyOAuthIntent(token, SECRET)
}

describe('GET /api/auth/google', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_AUTH_ENABLED', 'true')
    vi.stubEnv('OAUTH_STATE_SECRET', SECRET)
    mockRateLimit.mockResolvedValue({ success: true, remaining: 19, resetInMs: 0 })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('returns a plain 404 when the flag is off, before touching the limiter', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_AUTH_ENABLED', 'false')
    const res = await GET(startRequest('?terms=1&age=1'))
    expect(res.status).toBe(404)
    expect(res.headers.get('location')).toBeNull()
    expect(mockRateLimit).not.toHaveBeenCalled()
  })

  it('treats anything but the exact string "true" as off', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_AUTH_ENABLED', 'TRUE')
    const res = await GET(startRequest())
    expect(res.status).toBe(404)
  })

  it('redirects to /login?error=oauth_rate_limited when the per-IP limit is hit', async () => {
    mockRateLimit.mockResolvedValue({ success: false, remaining: 0, resetInMs: 60_000 })
    const res = await GET(startRequest())
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost:3000/login?error=oauth_rate_limited')
    expect(mockRateLimit).toHaveBeenCalledWith(
      expect.stringMatching(/^oauth_google_ip:/),
      { windowMs: 15 * 60 * 1000, limit: 20, failClosed: true }
    )
  })

  it('fails closed to oauth_rate_limited when the limiter is unavailable (failClosed refusal)', async () => {
    // A fail-closed limiter answers an outage with success:false.
    mockRateLimit.mockResolvedValue({ success: false, remaining: 0, resetInMs: 60_000 })
    const { calls } = recordRedirectCookies()
    const res = await GET(startRequest('?terms=1&age=1'))
    expect(res.headers.get('location')).toContain('/login?error=oauth_rate_limited')
    expect(calls.size).toBe(0)
  })

  it('redirects to oauth_failed (not JSON) when the limiter throws', async () => {
    mockRateLimit.mockRejectedValue(new Error('db down'))
    const res = await GET(startRequest())
    expect(res.headers.get('location')).toBe('http://localhost:3000/login?error=oauth_failed')
  })

  it('redirects to /login?error=oauth_unavailable and logs when the secret is missing', async () => {
    vi.stubEnv('OAUTH_STATE_SECRET', '')
    const res = await GET(startRequest('?terms=1&age=1'))
    expect(res.headers.get('location')).toBe('http://localhost:3000/login?error=oauth_unavailable')
    expect(mockLog.error).toHaveBeenCalledWith('auth.google.state_secret_missing')
  })

  it('treats a too-short secret as missing', async () => {
    vi.stubEnv('OAUTH_STATE_SECRET', 'short')
    const res = await GET(startRequest())
    expect(res.headers.get('location')).toContain('error=oauth_unavailable')
  })

  it('sets both cookies (httpOnly, lax, path /api/auth, maxAge 600) and redirects to the provider', async () => {
    const { calls } = recordRedirectCookies()
    const res = await GET(startRequest('?terms=1&age=1&ref=FRIEND42&next=%2Flearn%2Fmodule-1'))

    expect(res.status).toBe(302)
    const location = new URL(res.headers.get('location') || '')
    expect(location.origin).toBe('https://mock.supabase.co')
    expect(location.pathname).toBe('/auth/v1/authorize')
    expect(location.searchParams.get('provider')).toBe('google')
    expect(location.searchParams.get('redirect_to')).toBe('http://localhost:3000/api/auth/callback')
    expect(location.searchParams.get('prompt')).toBe('select_account')
    expect(location.searchParams.get('code_challenge_method')?.toLowerCase()).toBe('s256')

    for (const name of [OAUTH_PKCE_COOKIE, OAUTH_INTENT_COOKIE]) {
      const call = calls.get(name)
      expect(call, name).toBeDefined()
      expect(call!.value.length).toBeGreaterThan(0)
      expect(call!.options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/api/auth', maxAge: 600 })
    }

    // The verifier in the cookie is the one whose S256 challenge went to the provider.
    const verifierJson = Buffer.from(calls.get(OAUTH_PKCE_COOKIE)!.value, 'base64url').toString('utf8')
    const verifier = JSON.parse(verifierJson) as string
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    expect(location.searchParams.get('code_challenge')).toBe(challenge)

    const intent = decodeIntent(calls.get(OAUTH_INTENT_COOKIE)!.value)
    expect(intent).toMatchObject({ terms: true, age: true, ref: 'FRIEND42', next: '/learn/module-1' })
  })

  it('records no consent when the boxes were not ticked', async () => {
    const { calls } = recordRedirectCookies()
    await GET(startRequest())
    const intent = decodeIntent(calls.get(OAUTH_INTENT_COOKIE)!.value)
    expect(intent).toMatchObject({ terms: false, age: false, ref: null, next: '/dashboard' })
  })

  it('only "1" counts as consent', async () => {
    const { calls } = recordRedirectCookies()
    await GET(startRequest('?terms=true&age=yes'))
    const intent = decodeIntent(calls.get(OAUTH_INTENT_COOKIE)!.value)
    expect(intent?.terms).toBe(false)
    expect(intent?.age).toBe(false)
  })

  it.each(['//evil.com', '/\\evil.com', 'https://evil.com/x', '/api/admin/users'])(
    'replaces an off-origin or API next (%s) with /dashboard in the intent',
    async (next) => {
      const { calls } = recordRedirectCookies()
      await GET(startRequest(`?terms=1&age=1&next=${encodeURIComponent(next)}`))
      const intent = decodeIntent(calls.get(OAUTH_INTENT_COOKIE)!.value)
      expect(intent?.next).toBe('/dashboard')
    }
  )

  it.each([
    ['cross-site navigation', { 'sec-fetch-site': 'cross-site' }],
    ['same-site sibling', { 'sec-fetch-site': 'same-site' }],
    ['typed into the address bar', { 'sec-fetch-site': 'none' }],
    ['no headers at all', {}],
    ['Referer on another origin', { referer: 'https://evil.example/signup' }],
    ['same-origin Referer not on /signup', { referer: 'http://localhost:3000/login' }],
  ])('ignores terms=1&age=1 from a %s (lands on the gate)', async (_label, headers) => {
    const { calls } = recordRedirectCookies()
    const res = await GET(startRequest('?terms=1&age=1&next=%2Flearn', headers as Record<string, string>))
    expect(res.status).toBe(302)
    const intent = decodeIntent(calls.get(OAUTH_INTENT_COOKIE)!.value)
    expect(intent).toMatchObject({ terms: false, age: false, next: '/learn' })
  })

  it('honours consent from a same-origin /signup Referer when Sec-Fetch-Site is absent', async () => {
    const { calls } = recordRedirectCookies()
    await GET(startRequest('?terms=1&age=1', { referer: 'http://localhost:3000/signup?ref=FRIEND42' }))
    const intent = decodeIntent(calls.get(OAUTH_INTENT_COOKIE)!.value)
    expect(intent).toMatchObject({ terms: true, age: true })
  })

  it('drops an implausible referral code', async () => {
    const { calls } = recordRedirectCookies()
    await GET(startRequest(`?ref=${encodeURIComponent('<script>alert(1)</script>')}`))
    const intent = decodeIntent(calls.get(OAUTH_INTENT_COOKIE)!.value)
    expect(intent?.ref).toBeNull()
  })

  it('never writes an sb- cookie', async () => {
    const { calls } = recordRedirectCookies()
    await GET(startRequest('?terms=1&age=1'))
    for (const name of calls.keys()) expect(name.startsWith('sb-')).toBe(false)
  })
})
