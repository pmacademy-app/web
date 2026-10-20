/**
 * /api/auth/callback: the Google OAuth branches (provider ?error= and ?code).
 *
 * The intent cookie is signed with the REAL oauth-intent helpers and the cookies are
 * read with the REAL oauth-cookies helpers, so a forged or stale cookie is refused
 * by the same code production runs. The PKCE exchange client, the database, the
 * signup gates and account deletion are mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  exchange: vi.fn(),
  createExchangeClient: vi.fn(),
  usersLookup: vi.fn(),
  adminSignOut: vi.fn(),
  getUserById: vi.fn(),
  updateUserById: vi.fn(),
  createInApp: vi.fn(),
  ensureUserProfile: vi.fn(),
  createReferralAttribution: vi.fn(),
  applyPendingReferral: vi.fn(),
  getProductSettings: vi.fn(),
  getEmailState: vi.fn(),
  rateLimit: vi.fn(),
  deleteFresh: vi.fn(),
}))

vi.mock('@/lib/auth/oauth-pkce', () => ({
  createPkceExchangeClient: (verifier: string) => {
    h.createExchangeClient(verifier)
    return { auth: { exchangeCodeForSession: h.exchange } }
  },
}))

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: () => ({
    auth: { admin: { signOut: h.adminSignOut, getUserById: h.getUserById, updateUserById: h.updateUserById } },
    from: (table: string) => ({
      select: (cols: string) => ({
        eq: (col: string, val: string) => ({
          maybeSingle: () => h.usersLookup(table, cols, col, val),
        }),
      }),
    }),
  }),
}))

vi.mock('@/lib/auth', () => ({ ensureUserProfile: h.ensureUserProfile }))

vi.mock('@/lib/notifications/in-app/service', () => ({ createInAppNotification: h.createInApp }))

vi.mock('@/lib/referral/referral-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/referral/referral-service')>()
  return {
    isPlausibleReferralCode: actual.isPlausibleReferralCode,
    createReferralAttribution: h.createReferralAttribution,
    applyPendingReferral: h.applyPendingReferral,
  }
})

vi.mock('@/lib/admin/settings-service', () => ({
  SettingsService: { getProductSettings: h.getProductSettings },
}))

vi.mock('@/lib/notifications/automations/service', () => ({
  EmailAutomationsService: { getState: h.getEmailState },
}))

vi.mock('@/lib/rate-limit', () => ({ evaluatePersistentRateLimit: h.rateLimit }))

vi.mock('@/lib/auth/oauth-account-guard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/oauth-account-guard')>()
  return { ...actual, deleteFreshGoogleUserIfSafe: h.deleteFresh }
})

import { GET } from '../../app/api/auth/callback/route'
import { signOAuthIntent, type OAuthIntent } from '@/lib/auth/oauth-intent'
import { OAUTH_INTENT_COOKIE, OAUTH_PKCE_COOKIE } from '@/lib/auth/oauth-cookies'

const SECRET = 'k'.repeat(40)
const ORIGIN = 'http://localhost:3000'
const VERIFIER_JSON = JSON.stringify('verifier-abc-123')

function intentToken(overrides: Partial<OAuthIntent> = {}, secret = SECRET): string {
  return signOAuthIntent(
    { terms: true, age: true, ref: null, next: '/dashboard', iat: Date.now(), ...overrides },
    secret
  )
}

function callbackRequest(
  query: string,
  cookies: { verifier?: string | null; intent?: string | null; extra?: string } = {}
) {
  const parts: string[] = []
  const verifier = cookies.verifier === undefined ? VERIFIER_JSON : cookies.verifier
  if (verifier !== null) parts.push(`${OAUTH_PKCE_COOKIE}=${Buffer.from(verifier).toString('base64url')}`)
  const intent = cookies.intent === undefined ? intentToken() : cookies.intent
  if (intent !== null) parts.push(`${OAUTH_INTENT_COOKIE}=${intent}`)
  if (cookies.extra) parts.push(cookies.extra)
  return new NextRequest(`${ORIGIN}/api/auth/callback${query}`, {
    headers: parts.length ? { cookie: parts.join('; ') } : {},
  })
}

function googleUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'usr_g1',
    email: 'learner@gmail.com',
    created_at: new Date().toISOString(),
    app_metadata: { provider: 'google', providers: ['google'] },
    user_metadata: { full_name: 'Gee Learner' },
    identities: [{ provider: 'google' }],
    ...overrides,
  }
}

const SESSION = { access_token: 'at_g', refresh_token: 'rt_g', expires_in: 3600 }

function exchangeSucceeds(user: ReturnType<typeof googleUser> = googleUser()) {
  h.exchange.mockResolvedValue({ data: { user, session: SESSION }, error: null })
  h.getUserById.mockResolvedValue({ data: { user }, error: null })
}

function expectOAuthCookiesCleared(res: Response & { cookies: { get(n: string): { value: string } | undefined } }) {
  expect(res.cookies.get(OAUTH_PKCE_COOKIE)?.value).toBe('')
  expect(res.cookies.get(OAUTH_INTENT_COOKIE)?.value).toBe('')
}

function expectNoSession(res: Response & { cookies: { get(n: string): { value: string } | undefined } }) {
  expect(res.cookies.get('sb-access-token')?.value).toBeFalsy()
  expect(res.cookies.get('sb-refresh-token')?.value).toBeFalsy()
}

describe('auth/callback: Google OAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('OAUTH_STATE_SECRET', SECRET)
    h.usersLookup.mockResolvedValue({ data: null, error: null })
    h.ensureUserProfile.mockImplementation(async (_s: unknown, user: { id: string }, extra: { provider?: string; consent?: { terms_accepted_at: string } | null }) => ({
      id: user.id,
      auth_provider: extra?.provider ?? 'email',
      terms_accepted_at: extra?.consent?.terms_accepted_at ?? null,
    }))
    h.applyPendingReferral.mockResolvedValue({ created: false })
    h.createReferralAttribution.mockResolvedValue({ created: true })
    h.getProductSettings.mockResolvedValue({ allowSignups: true })
    h.getEmailState.mockResolvedValue({ dailyLimit: 300 })
    h.rateLimit.mockResolvedValue({ success: true, remaining: 10, resetInMs: 0 })
    h.deleteFresh.mockResolvedValue({ deleted: true })
    h.adminSignOut.mockResolvedValue({ data: null, error: null })
    h.updateUserById.mockResolvedValue({ data: {}, error: null })
    h.createInApp.mockResolvedValue({ success: true, id: 'n1' })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  // ── provider errors ─────────────────────────────────────────────────────

  it('access_denied from the provider -> /login?error=oauth_cancelled, cookies cleared, no exchange', async () => {
    const res = await GET(callbackRequest('?error=access_denied&error_description=User+cancelled'))
    expect(res.headers.get('location')).toBe(`${ORIGIN}/login?error=oauth_cancelled`)
    expectOAuthCookiesCleared(res)
    expect(h.exchange).not.toHaveBeenCalled()
  })

  it('any other provider error -> /login?error=oauth_failed', async () => {
    const res = await GET(callbackRequest('?error=server_error'))
    expect(res.headers.get('location')).toBe(`${ORIGIN}/login?error=oauth_failed`)
    expectOAuthCookiesCleared(res)
  })

  it('an error on an email link (type present) keeps the existing fallbacks', async () => {
    const res = await GET(callbackRequest('?error=access_denied&type=recovery'))
    expect(res.headers.get('location')).toBe(`${ORIGIN}/reset-password?error=expired`)
  })

  // ── refused before any exchange ─────────────────────────────────────────

  it('missing verifier cookie -> oauth_failed, no exchange, cookies cleared', async () => {
    const res = await GET(callbackRequest('?code=c1', { verifier: null }))
    expect(res.headers.get('location')).toBe(`${ORIGIN}/login?error=oauth_failed`)
    expect(h.exchange).not.toHaveBeenCalled()
    expectOAuthCookiesCleared(res)
    expectNoSession(res)
  })

  it('missing intent cookie -> oauth_failed, no exchange', async () => {
    const res = await GET(callbackRequest('?code=c1', { intent: null }))
    expect(res.headers.get('location')).toBe(`${ORIGIN}/login?error=oauth_failed`)
    expect(h.exchange).not.toHaveBeenCalled()
  })

  it('intent signed with another secret -> oauth_failed, no exchange', async () => {
    const res = await GET(callbackRequest('?code=c1', { intent: intentToken({}, 'z'.repeat(40)) }))
    expect(res.headers.get('location')).toBe(`${ORIGIN}/login?error=oauth_failed`)
    expect(h.exchange).not.toHaveBeenCalled()
    expectOAuthCookiesCleared(res)
  })

  it('tampered intent payload -> oauth_failed, no exchange', async () => {
    const [, sig] = intentToken({ terms: false, age: false }).split('.')
    const forgedPayload = Buffer.from(
      JSON.stringify({ terms: true, age: true, ref: null, next: '/dashboard', iat: Date.now() })
    ).toString('base64url')
    const res = await GET(callbackRequest('?code=c1', { intent: `${forgedPayload}.${sig}` }))
    expect(res.headers.get('location')).toBe(`${ORIGIN}/login?error=oauth_failed`)
    expect(h.exchange).not.toHaveBeenCalled()
  })

  it('expired intent -> oauth_failed, no exchange', async () => {
    const res = await GET(callbackRequest('?code=c1', { intent: intentToken({ iat: Date.now() - 11 * 60 * 1000 }) }))
    expect(res.headers.get('location')).toBe(`${ORIGIN}/login?error=oauth_failed`)
    expect(h.exchange).not.toHaveBeenCalled()
  })

  it('missing signing secret -> oauth_failed, no exchange', async () => {
    vi.stubEnv('OAUTH_STATE_SECRET', '')
    const res = await GET(callbackRequest('?code=c1'))
    expect(res.headers.get('location')).toBe(`${ORIGIN}/login?error=oauth_failed`)
    expect(h.exchange).not.toHaveBeenCalled()
  })

  // ── exchange ────────────────────────────────────────────────────────────

  it('failed exchange -> oauth_failed with cookies cleared and no session (no fall-through)', async () => {
    h.exchange.mockResolvedValue({ data: { user: null, session: null }, error: { name: 'AuthApiError', code: 'bad_code_verifier' } })
    const res = await GET(callbackRequest('?code=c1'))
    expect(res.headers.get('location')).toBe(`${ORIGIN}/login?error=oauth_failed`)
    expectOAuthCookiesCleared(res)
    expectNoSession(res)
    expect(h.ensureUserProfile).not.toHaveBeenCalled()
  })

  it('a thrown exchange -> oauth_failed with cookies cleared', async () => {
    h.exchange.mockRejectedValue(new Error('network'))
    const res = await GET(callbackRequest('?code=c1'))
    expect(res.headers.get('location')).toBe(`${ORIGIN}/login?error=oauth_failed`)
    expectOAuthCookiesCleared(res)
  })

  it('passes the cookie verifier (the JSON string auth-js stored) to the exchange client unchanged', async () => {
    exchangeSucceeds()
    await GET(callbackRequest('?code=c1'))
    expect(h.createExchangeClient).toHaveBeenCalledWith(VERIFIER_JSON)
    expect(h.exchange).toHaveBeenCalledWith('c1')
  })

  it('profile lookup error -> oauth_failed, session revoked, no profile created', async () => {
    exchangeSucceeds()
    h.usersLookup.mockResolvedValue({ data: null, error: { message: 'db down' } })
    const res = await GET(callbackRequest('?code=c1'))
    expect(res.headers.get('location')).toBe(`${ORIGIN}/login?error=oauth_failed`)
    expect(h.adminSignOut).toHaveBeenCalledWith('at_g', 'local')
    expect(h.ensureUserProfile).not.toHaveBeenCalled()
    expectNoSession(res)
  })

  // ── new users ───────────────────────────────────────────────────────────

  it('new user with signed consent: consent recorded server-side, lands on next, session set, cookies cleared', async () => {
    exchangeSucceeds()
    const res = await GET(callbackRequest('?code=c1', { intent: intentToken({ next: '/learn/module-2' }) }))

    expect(res.headers.get('location')).toBe(`${ORIGIN}/learn/module-2`)
    expect(res.cookies.get('sb-access-token')?.value).toBe('at_g')
    expect(res.cookies.get('sb-refresh-token')?.value).toBe('rt_g')
    expectOAuthCookiesCleared(res)

    // New vs existing was decided before ensureUserProfile.
    expect(h.usersLookup).toHaveBeenCalledWith('users', 'id, auth_provider, terms_accepted_at, is_admin', 'id', 'usr_g1')
    expect(h.usersLookup.mock.invocationCallOrder[0]).toBeLessThan(h.ensureUserProfile.mock.invocationCallOrder[0])

    const extra = h.ensureUserProfile.mock.calls[0][2]
    expect(extra.provider).toBe('google')
    expect(extra.skipWelcome).toBe(false)
    expect(extra.consent).toEqual({
      terms_accepted_at: expect.any(String),
      terms_version: expect.any(String),
      privacy_version: expect.any(String),
      age_confirmed_at: expect.any(String),
      age_confirmed_minimum: 18,
    })
  })

  it('new user without consent: profile has NULL consent and lands on the gate with next', async () => {
    exchangeSucceeds()
    const res = await GET(
      callbackRequest('?code=c1', { intent: intentToken({ terms: false, age: false, next: '/learn/x?tab=2' }) })
    )
    const location = new URL(res.headers.get('location') || '')
    expect(location.pathname).toBe('/signup/complete-consent')
    expect(location.searchParams.get('next')).toBe('/learn/x?tab=2')
    expect(h.ensureUserProfile.mock.calls[0][2].consent).toBeNull()
    // The welcome email waits for the gate's accept.
    expect(h.ensureUserProfile.mock.calls[0][2].skipWelcome).toBe(true)
    // Signed in, but gated: the proxy keeps them on the gate page.
    expect(res.cookies.get('sb-access-token')?.value).toBe('at_g')
    expectOAuthCookiesCleared(res)
  })

  it('only one ticked box is not consent', async () => {
    exchangeSucceeds()
    const res = await GET(callbackRequest('?code=c1', { intent: intentToken({ terms: true, age: false }) }))
    expect(new URL(res.headers.get('location') || '').pathname).toBe('/signup/complete-consent')
    expect(h.ensureUserProfile.mock.calls[0][2].consent).toBeNull()
  })

  it('ignores a ?next= on the callback URL; only the signed intent decides', async () => {
    exchangeSucceeds()
    const res = await GET(callbackRequest('?code=c1&next=https://evil.example/phish'))
    expect(res.headers.get('location')).toBe(`${ORIGIN}/dashboard`)
  })

  it('new user with a password identity: provider not forced to google, never gated', async () => {
    exchangeSucceeds(
      googleUser({
        app_metadata: { provider: 'email', providers: ['email', 'google'] },
        identities: [{ provider: 'email' }, { provider: 'google' }],
      })
    )
    const res = await GET(callbackRequest('?code=c1', { intent: intentToken({ terms: false, age: false }) }))
    expect(h.ensureUserProfile.mock.calls[0][2].provider).toBeUndefined()
    expect(res.headers.get('location')).toBe(`${ORIGIN}/dashboard`)
  })

  it('signups closed: deletes the new user via the guard, no profile, no session, signups_closed', async () => {
    exchangeSucceeds()
    h.getProductSettings.mockResolvedValue({ allowSignups: false })
    const res = await GET(callbackRequest('?code=c1'))
    expect(res.headers.get('location')).toBe(`${ORIGIN}/login?error=signups_closed`)
    // Deleted only while the profile row is still missing (re-read by the guard).
    expect(h.deleteFresh).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'usr_g1' }), {
      profileMustBeMissing: true,
    })
    expect(h.ensureUserProfile).not.toHaveBeenCalled()
    expect(h.createReferralAttribution).not.toHaveBeenCalled()
    expectNoSession(res)
    expectOAuthCookiesCleared(res)
  })

  it('aggregate signup limit hit: same delete and signup_limited, on the shared signup_global bucket', async () => {
    exchangeSucceeds()
    h.rateLimit.mockResolvedValue({ success: false, remaining: 0, resetInMs: 1000 })
    const res = await GET(callbackRequest('?code=c1'))
    expect(res.headers.get('location')).toBe(`${ORIGIN}/login?error=signup_limited`)
    expect(h.rateLimit).toHaveBeenCalledWith('signup_global', {
      windowMs: 60 * 60 * 1000,
      limit: 15, // max(15, ceil(300 / 24))
      failClosed: true,
    })
    expect(h.deleteFresh).toHaveBeenCalled()
    expect(h.ensureUserProfile).not.toHaveBeenCalled()
    expectNoSession(res)
  })

  it('falls back to a 100/day email limit when the automations state cannot be read', async () => {
    exchangeSucceeds()
    h.getEmailState.mockRejectedValue(new Error('down'))
    await GET(callbackRequest('?code=c1'))
    expect(h.rateLimit).toHaveBeenCalledWith('signup_global', expect.objectContaining({ limit: 15 }))
  })

  it('refused signup the guard will not delete: session is revoked instead', async () => {
    exchangeSucceeds()
    h.getProductSettings.mockResolvedValue({ allowSignups: false })
    h.deleteFresh.mockResolvedValue({ deleted: false })
    const res = await GET(callbackRequest('?code=c1'))
    expect(res.headers.get('location')).toBe(`${ORIGIN}/login?error=signups_closed`)
    expect(h.adminSignOut).toHaveBeenCalledWith('at_g', 'global')
    expectNoSession(res)
  })

  it('new user whose profile cannot be created: session revoked (global), oauth_failed, no session', async () => {
    exchangeSucceeds()
    h.ensureUserProfile.mockResolvedValue(null)
    const res = await GET(callbackRequest('?code=c1', { intent: intentToken({ ref: 'FRIEND42' }) }))
    expect(res.headers.get('location')).toBe(`${ORIGIN}/login?error=oauth_failed`)
    expect(h.adminSignOut).toHaveBeenCalledWith('at_g', 'global')
    expect(h.createReferralAttribution).not.toHaveBeenCalled()
    expectNoSession(res)
    expectOAuthCookiesCleared(res)
  })

  it('a revoke that returns an error is logged, not thrown', async () => {
    exchangeSucceeds()
    h.ensureUserProfile.mockResolvedValue(null)
    h.adminSignOut.mockResolvedValue({ data: null, error: { name: 'AuthApiError', code: 'session_not_found' } })
    const res = await GET(callbackRequest('?code=c1'))
    expect(res.headers.get('location')).toBe(`${ORIGIN}/login?error=oauth_failed`)
  })

  it('new user: referral from the signed intent is attributed', async () => {
    exchangeSucceeds()
    await GET(callbackRequest('?code=c1', { intent: intentToken({ ref: 'FRIEND42' }), extra: 'prodily_referrer=OTHER99' }))
    expect(h.createReferralAttribution).toHaveBeenCalledWith(expect.anything(), {
      referrerCodeOrId: 'FRIEND42',
      newUserId: 'usr_g1',
    })
  })

  it('new user: falls back to a valid prodily_referrer cookie', async () => {
    exchangeSucceeds()
    await GET(callbackRequest('?code=c1', { extra: 'prodily_referrer=COOKIE77' }))
    expect(h.createReferralAttribution).toHaveBeenCalledWith(expect.anything(), {
      referrerCodeOrId: 'COOKIE77',
      newUserId: 'usr_g1',
    })
  })

  it('new user: an implausible referrer cookie is ignored', async () => {
    exchangeSucceeds()
    await GET(callbackRequest('?code=c1', { extra: 'prodily_referrer=a' }))
    expect(h.createReferralAttribution).not.toHaveBeenCalled()
  })

  it('a referral failure never blocks sign-in', async () => {
    exchangeSucceeds()
    h.createReferralAttribution.mockRejectedValue(new Error('boom'))
    const res = await GET(callbackRequest('?code=c1', { intent: intentToken({ ref: 'FRIEND42' }) }))
    expect(res.headers.get('location')).toBe(`${ORIGIN}/dashboard`)
    expect(res.cookies.get('sb-access-token')?.value).toBe('at_g')
  })

  // ── existing users ──────────────────────────────────────────────────────

  it('existing merged password user: consent untouched, no referral, no signup gates, never gated', async () => {
    exchangeSucceeds(
      googleUser({
        app_metadata: { provider: 'email', providers: ['email', 'google'] },
        identities: [{ provider: 'email' }, { provider: 'google' }],
      })
    )
    h.usersLookup.mockResolvedValue({
      data: { id: 'usr_g1', auth_provider: 'email', terms_accepted_at: null },
      error: null,
    })
    const res = await GET(
      callbackRequest('?code=c1', { intent: intentToken({ terms: true, age: true, ref: 'FRIEND42' }), extra: 'prodily_referrer=COOKIE77' })
    )

    expect(res.headers.get('location')).toBe(`${ORIGIN}/dashboard`)
    expect(h.ensureUserProfile).not.toHaveBeenCalled()
    expect(h.createReferralAttribution).not.toHaveBeenCalled()
    expect(h.getProductSettings).not.toHaveBeenCalled()
    expect(h.rateLimit).not.toHaveBeenCalled()
    expect(h.deleteFresh).not.toHaveBeenCalled()
    expect(res.cookies.get('sb-access-token')?.value).toBe('at_g')
    expectOAuthCookiesCleared(res)
  })

  it('admin account: refused with oauth_admin_blocked, session revoked locally, no session cookies', async () => {
    exchangeSucceeds()
    h.usersLookup.mockResolvedValue({
      data: { id: 'usr_g1', auth_provider: 'email', terms_accepted_at: '2026-01-01T00:00:00Z', is_admin: true },
      error: null,
    })
    const res = await GET(callbackRequest('?code=c1'))
    expect(res.headers.get('location')).toBe(`${ORIGIN}/login?error=oauth_admin_blocked`)
    expect(h.adminSignOut).toHaveBeenCalledWith('at_g', 'local')
    expect(h.updateUserById).not.toHaveBeenCalled()
    expectNoSession(res)
    expectOAuthCookiesCleared(res)
  })

  it('existing Google user who already consented: lands on next', async () => {
    exchangeSucceeds()
    h.usersLookup.mockResolvedValue({
      data: { id: 'usr_g1', auth_provider: 'google', terms_accepted_at: '2026-10-01T00:00:00Z' },
      error: null,
    })
    const res = await GET(callbackRequest('?code=c1', { intent: intentToken({ terms: false, age: false, next: '/settings' }) }))
    expect(res.headers.get('location')).toBe(`${ORIGIN}/settings`)
  })

  it('existing Google user with NULL consent is sent back to the gate, consent not written from the intent', async () => {
    exchangeSucceeds()
    h.usersLookup.mockResolvedValue({
      data: { id: 'usr_g1', auth_provider: 'google', terms_accepted_at: null },
      error: null,
    })
    const res = await GET(callbackRequest('?code=c1', { intent: intentToken({ terms: true, age: true }) }))
    expect(new URL(res.headers.get('location') || '').pathname).toBe('/signup/complete-consent')
    expect(h.ensureUserProfile).not.toHaveBeenCalled()
  })

  it('recovery links never run ensureUserProfile (it would use the anon client)', async () => {
    await GET(callbackRequest('?token_hash=th&type=recovery', { verifier: null, intent: null }))
    expect(h.ensureUserProfile).not.toHaveBeenCalled()
  })

  it('still redeems a pending referral as before', async () => {
    exchangeSucceeds()
    await GET(callbackRequest('?code=c1'))
    expect(h.applyPendingReferral).toHaveBeenCalled()
  })
})

describe('auth/callback: Google linked into an existing password account', () => {
  const NOW = Date.now()
  const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString()

  function linkedUser(opts: { googleAgeMs: number; accountAgeMs: number; email?: boolean; passwordSet?: boolean }) {
    const identities: Array<Record<string, unknown>> = [
      { id: 'gid-1', identity_id: 'gid-1', provider: 'google', created_at: iso(opts.googleAgeMs) },
    ]
    if (opts.email !== false) {
      identities.unshift({ id: 'eid-1', identity_id: 'eid-1', provider: 'email', created_at: iso(opts.accountAgeMs) })
    }
    return googleUser({
      created_at: iso(opts.accountAgeMs),
      app_metadata: {
        provider: 'email',
        providers: opts.email !== false ? ['email', 'google'] : ['google'],
        custom_flag: 'keep-me',
        ...(opts.passwordSet === undefined ? {} : { password_set: opts.passwordSet }),
      },
      identities,
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('OAUTH_STATE_SECRET', SECRET)
    h.usersLookup.mockResolvedValue({
      data: { id: 'usr_g1', auth_provider: 'email', terms_accepted_at: '2026-01-01T00:00:00Z', is_admin: false },
      error: null,
    })
    h.applyPendingReferral.mockResolvedValue({ created: false })
    h.adminSignOut.mockResolvedValue({ data: null, error: null })
    h.updateUserById.mockResolvedValue({ data: {}, error: null })
    h.createInApp.mockResolvedValue({ success: true, id: 'n1' })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('newly linked password account: password rotated, other sessions ended, owner notified once, sign-in continues', async () => {
    exchangeSucceeds(linkedUser({ googleAgeMs: 30_000, accountAgeMs: 5 * 24 * 3600_000 }))
    const res = await GET(callbackRequest('?code=c1'))

    expect(h.updateUserById).toHaveBeenCalledTimes(1)
    const [id, attrs] = h.updateUserById.mock.calls[0]
    expect(id).toBe('usr_g1')
    expect(typeof attrs.password).toBe('string')
    expect(attrs.password.length).toBeGreaterThanOrEqual(64)
    // Merged, not clobbered.
    expect(attrs.app_metadata).toMatchObject({
      custom_flag: 'keep-me',
      providers: ['email', 'google'],
      password_set: false,
    })

    expect(h.adminSignOut).toHaveBeenCalledWith('at_g', 'others')

    expect(h.createInApp).toHaveBeenCalledTimes(1)
    expect(h.createInApp.mock.calls[0][0]).toMatchObject({
      userId: 'usr_g1',
      idempotencyKey: 'google-linked-usr_g1-gid-1',
      category: 'security',
      priority: 'critical',
    })
    expect(h.createInApp.mock.calls[0][0].body).not.toContain(String.fromCharCode(0x2014))

    expect(res.headers.get('location')).toBe(`${ORIGIN}/dashboard`)
    expect(res.cookies.get('sb-access-token')?.value).toBe('at_g')
  })

  it('password_set true without an email identity also counts as a password account', async () => {
    exchangeSucceeds(linkedUser({ googleAgeMs: 30_000, accountAgeMs: 3600_000, email: false, passwordSet: true }))
    await GET(callbackRequest('?code=c1'))
    expect(h.updateUserById).toHaveBeenCalledTimes(1)
  })

  it('password_set false (password already removed) does nothing', async () => {
    exchangeSucceeds(linkedUser({ googleAgeMs: 30_000, accountAgeMs: 3600_000, passwordSet: false }))
    await GET(callbackRequest('?code=c1'))
    expect(h.updateUserById).not.toHaveBeenCalled()
    expect(h.createInApp).not.toHaveBeenCalled()
  })

  it('an old Google link does nothing', async () => {
    exchangeSucceeds(linkedUser({ googleAgeMs: 11 * 60_000, accountAgeMs: 30 * 24 * 3600_000 }))
    await GET(callbackRequest('?code=c1'))
    expect(h.updateUserById).not.toHaveBeenCalled()
    expect(h.adminSignOut).not.toHaveBeenCalled()
    expect(h.createInApp).not.toHaveBeenCalled()
  })

  it('a Google-only account does nothing', async () => {
    h.usersLookup.mockResolvedValue({
      data: { id: 'usr_g1', auth_provider: 'google', terms_accepted_at: '2026-01-01T00:00:00Z', is_admin: false },
      error: null,
    })
    exchangeSucceeds(linkedUser({ googleAgeMs: 30_000, accountAgeMs: 3600_000, email: false }))
    await GET(callbackRequest('?code=c1'))
    expect(h.updateUserById).not.toHaveBeenCalled()
  })

  it('an account created together with its Google identity (not a link) does nothing', async () => {
    exchangeSucceeds(linkedUser({ googleAgeMs: 30_000, accountAgeMs: 40_000 }))
    await GET(callbackRequest('?code=c1'))
    expect(h.updateUserById).not.toHaveBeenCalled()
  })

  it('a brand-new user (no profile row) never runs the defence', async () => {
    h.usersLookup.mockResolvedValue({ data: null, error: null })
    h.getProductSettings.mockResolvedValue({ allowSignups: true })
    h.getEmailState.mockResolvedValue({ dailyLimit: 300 })
    h.rateLimit.mockResolvedValue({ success: true, remaining: 1, resetInMs: 0 })
    h.ensureUserProfile.mockResolvedValue({ id: 'usr_g1', auth_provider: 'email', terms_accepted_at: 'x' })
    exchangeSucceeds(linkedUser({ googleAgeMs: 30_000, accountAgeMs: 3600_000 }))
    await GET(callbackRequest('?code=c1'))
    expect(h.updateUserById).not.toHaveBeenCalled()
  })

  it('uses the authoritative auth user from getUserById, not only the exchange payload', async () => {
    const stale = googleUser({ identities: undefined, created_at: iso(3600_000) })
    h.exchange.mockResolvedValue({ data: { user: stale, session: SESSION }, error: null })
    h.getUserById.mockResolvedValue({
      data: { user: linkedUser({ googleAgeMs: 30_000, accountAgeMs: 3600_000 }) },
      error: null,
    })
    await GET(callbackRequest('?code=c1'))
    expect(h.updateUserById).toHaveBeenCalledTimes(1)
  })

  it('failures in rotation, sign-out and notify are logged and sign-in still continues', async () => {
    const { log } = await import('@/lib/monitoring/log')
    const errorSpy = vi.spyOn(log, 'error')
    const exceptionSpy = vi.spyOn(log, 'exception')
    exchangeSucceeds(linkedUser({ googleAgeMs: 30_000, accountAgeMs: 3600_000 }))
    h.updateUserById.mockResolvedValue({ data: null, error: { name: 'AuthApiError', code: 'unexpected_failure' } })
    h.adminSignOut.mockRejectedValue(new Error('network'))
    h.createInApp.mockResolvedValue({ success: false, reason: 'insert_failed' })

    const res = await GET(callbackRequest('?code=c1'))
    expect(res.headers.get('location')).toBe(`${ORIGIN}/dashboard`)
    expect(res.cookies.get('sb-access-token')?.value).toBe('at_g')
    expect(errorSpy).toHaveBeenCalledWith(
      'security.auth.google_link_password_rotate_failed',
      expect.objectContaining({ userId: 'usr_g1' })
    )
    expect(exceptionSpy).toHaveBeenCalledWith('security.auth.google_link_signout_others_failed', expect.anything(), {
      userId: 'usr_g1',
    })
    expect(errorSpy).toHaveBeenCalledWith('security.auth.google_link_notify_failed', {
      userId: 'usr_g1',
      reason: 'insert_failed',
    })
  })

  it('security log lines carry the user id only, never the email', async () => {
    const { log } = await import('@/lib/monitoring/log')
    const warnSpy = vi.spyOn(log, 'warn')
    exchangeSucceeds(linkedUser({ googleAgeMs: 30_000, accountAgeMs: 3600_000 }))
    await GET(callbackRequest('?code=c1'))
    expect(warnSpy).toHaveBeenCalledWith('security.auth.google_linked_into_password_account', { userId: 'usr_g1' })
    for (const call of warnSpy.mock.calls) expect(JSON.stringify(call)).not.toContain('@gmail.com')
  })
})

describe('auth/callback source invariants', () => {
  const source = readFileSync(path.resolve(import.meta.dirname, '../../app/api/auth/callback/route.ts'), 'utf8')

  it('never deletes a user except through deleteFreshGoogleUserIfSafe', () => {
    expect(source).not.toMatch(/\.deleteUser\s*\(/)
  })

  it('never writes an sb- cookie literal', () => {
    expect(source).not.toContain("cookies.set('sb-")
  })
})
