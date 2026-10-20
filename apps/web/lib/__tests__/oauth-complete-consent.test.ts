/**
 * POST /api/auth/complete-consent: the consent gate's answer.
 *
 * The real withRoute wrapper runs (actor policy, body schema, rate-limit rule); the
 * caller identity, the database and account deletion are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  ensureUserProfile: vi.fn(),
  dispatchWelcome: vi.fn(),
  updateResult: vi.fn(),
  updateCalls: [] as Array<{ payload: Record<string, unknown>; eq: [string, string]; is: [string, unknown] }>,
  lookup: vi.fn(),
  getUserById: vi.fn(),
  adminSignOut: vi.fn(),
  deleteUser: vi.fn(),
  deleteFresh: vi.fn(),
  rateLimit: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  getAuthenticatedUserFromRequest: h.getUser,
  ensureUserProfile: h.ensureUserProfile,
  dispatchWelcomeEmailIfNeeded: h.dispatchWelcome,
}))

vi.mock('@/lib/admin/guard', () => ({ requireAdminUser: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: () => ({
    auth: { admin: { getUserById: h.getUserById, signOut: h.adminSignOut, deleteUser: h.deleteUser } },
    from: () => ({
      update: (payload: Record<string, unknown>) => ({
        eq: (eqCol: string, eqVal: string) => ({
          is: (isCol: string, isVal: unknown) => ({
            select: () => {
              h.updateCalls.push({ payload, eq: [eqCol, eqVal], is: [isCol, isVal] })
              return h.updateResult()
            },
          }),
        }),
      }),
      select: () => ({
        eq: () => ({ maybeSingle: () => h.lookup() }),
      }),
    }),
  }),
}))

vi.mock('@/lib/rate-limit', () => ({ evaluatePersistentRateLimit: h.rateLimit }))

vi.mock('@/lib/auth/oauth-account-guard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/oauth-account-guard')>()
  return { ...actual, deleteFreshGoogleUserIfSafe: h.deleteFresh }
})

import { POST } from '../../app/api/auth/complete-consent/route'

const ORIGIN = 'http://localhost:3000'
const AUTH_USER = {
  id: 'usr_g1',
  email: 'learner@gmail.com',
  created_at: new Date().toISOString(),
  app_metadata: { provider: 'google', providers: ['google'] },
  user_metadata: {},
  identities: [{ provider: 'google' }],
}

function consentRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${ORIGIN}/api/auth/complete-consent`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: 'sb-access-token=at_g; sb-refresh-token=rt_g',
      host: 'localhost:3000',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

/** withRoute is typed as returning a plain Response; the handler's is a NextResponse. */
function cookieValue(res: Response, name: string): string | undefined {
  return (res as unknown as { cookies: { get(n: string): { value: string } | undefined } }).cookies.get(name)?.value
}

describe('POST /api/auth/complete-consent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.updateCalls.length = 0
    h.getUser.mockResolvedValue({ id: 'usr_g1', email: 'learner@gmail.com' })
    h.updateResult.mockResolvedValue({
      data: [{ id: 'usr_g1', auth_provider: 'google', name: 'Gee', timezone: 'Asia/Kolkata' }],
      error: null,
    })
    h.dispatchWelcome.mockResolvedValue(undefined)
    h.lookup.mockResolvedValue({ data: { id: 'usr_g1' }, error: null })
    h.getUserById.mockResolvedValue({ data: { user: AUTH_USER }, error: null })
    h.adminSignOut.mockResolvedValue({ data: null, error: null })
    h.deleteFresh.mockResolvedValue({ deleted: true })
    h.ensureUserProfile.mockResolvedValue({ id: 'usr_g1' })
    h.rateLimit.mockResolvedValue({ success: true, remaining: 9, resetInMs: 0 })
  })

  it('anonymous caller -> 401, nothing written', async () => {
    h.getUser.mockResolvedValue(null)
    const res = await POST(consentRequest({ decision: 'accept' }))
    expect(res.status).toBe(401)
    expect(h.updateCalls).toHaveLength(0)
    expect(h.deleteFresh).not.toHaveBeenCalled()
  })

  it('rejects an unknown decision with 400', async () => {
    const res = await POST(consentRequest({ decision: 'maybe' }))
    expect(res.status).toBe(400)
  })

  it('accept writes the buildConsentRecord shape, only where consent is still NULL, for the caller only', async () => {
    const res = await POST(consentRequest({ decision: 'accept', next: '/learn/module-1' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, redirect: '/learn/module-1' })

    expect(h.updateCalls).toHaveLength(1)
    const call = h.updateCalls[0]
    expect(call.eq).toEqual(['id', 'usr_g1'])
    expect(call.is).toEqual(['terms_accepted_at', null])
    expect(Object.keys(call.payload).sort()).toEqual(
      ['age_confirmed_at', 'age_confirmed_minimum', 'privacy_version', 'terms_accepted_at', 'terms_version'].sort()
    )
    expect(call.payload.age_confirmed_minimum).toBe(18)
  })

  it('accept sends the held-back welcome email for a Google profile, via the shared helper', async () => {
    await POST(consentRequest({ decision: 'accept' }))
    expect(h.dispatchWelcome).toHaveBeenCalledTimes(1)
    expect(h.dispatchWelcome).toHaveBeenCalledWith(expect.anything(), AUTH_USER, 'Gee', 'Asia/Kolkata')
  })

  it('accept does not send a welcome for a non-Google profile or a double submit', async () => {
    h.updateResult.mockResolvedValue({ data: [{ id: 'usr_g1', auth_provider: 'email', name: null, timezone: null }], error: null })
    await POST(consentRequest({ decision: 'accept' }))
    expect(h.dispatchWelcome).not.toHaveBeenCalled()

    h.updateResult.mockResolvedValue({ data: [], error: null })
    await POST(consentRequest({ decision: 'accept' }))
    expect(h.dispatchWelcome).not.toHaveBeenCalled()
  })

  it('accept still succeeds when the auth user lookup for the welcome fails', async () => {
    h.getUserById.mockResolvedValue({ data: { user: null }, error: { message: 'down' } })
    const res = await POST(consentRequest({ decision: 'accept' }))
    expect(res.status).toBe(200)
    expect(h.dispatchWelcome).not.toHaveBeenCalled()
  })

  it('accept ignores client-supplied timestamps, versions and user ids', async () => {
    const before = Date.now()
    await POST(
      consentRequest({
        decision: 'accept',
        terms_accepted_at: '1999-01-01T00:00:00Z',
        terms_version: 'forged',
        userId: 'someone_else',
      })
    )
    const call = h.updateCalls[0]
    expect(call.eq).toEqual(['id', 'usr_g1'])
    expect(call.payload.terms_version).not.toBe('forged')
    expect(Date.parse(String(call.payload.terms_accepted_at))).toBeGreaterThanOrEqual(before - 1000)
  })

  it.each(['//evil.com', 'https://evil.com', '/api/admin', undefined])('accept sanitizes next (%s) to /dashboard', async (next) => {
    const res = await POST(consentRequest({ decision: 'accept', ...(next === undefined ? {} : { next }) }))
    expect((await res.json()).redirect).toBe('/dashboard')
  })

  it('accept on an already-consented account is an idempotent success with no profile creation', async () => {
    h.updateResult.mockResolvedValue({ data: [], error: null })
    const res = await POST(consentRequest({ decision: 'accept' }))
    expect(res.status).toBe(200)
    expect(h.ensureUserProfile).not.toHaveBeenCalled()
  })

  it('accept with no profile row creates it as google with consent', async () => {
    h.updateResult.mockResolvedValue({ data: [], error: null })
    h.lookup.mockResolvedValue({ data: null, error: null })
    const res = await POST(consentRequest({ decision: 'accept' }))
    expect(res.status).toBe(200)
    expect(h.getUserById).toHaveBeenCalledWith('usr_g1')
    const extra = h.ensureUserProfile.mock.calls[0][2]
    expect(extra.provider).toBe('google')
    expect(extra.consent).toMatchObject({ age_confirmed_minimum: 18, terms_accepted_at: expect.any(String) })
  })

  it('accept surfaces a database error as a 500 envelope, not a false success', async () => {
    h.updateResult.mockResolvedValue({ data: null, error: { message: 'db down' } })
    const res = await POST(consentRequest({ decision: 'accept' }))
    expect(res.status).toBe(500)
  })

  it('decline deletes via the guard when it passes and clears the session cookies', async () => {
    const res = await POST(consentRequest({ decision: 'decline' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, deleted: true, redirect: '/login?error=consent_declined' })
    // Never deletes an account whose consent is already recorded (e.g. accepted in another tab).
    expect(h.deleteFresh).toHaveBeenCalledWith(expect.anything(), AUTH_USER, { requireNullConsent: true })
    expect(h.deleteUser).not.toHaveBeenCalled() // only the guard deletes
    expect(cookieValue(res, 'sb-access-token')).toBe('')
    expect(cookieValue(res, 'sb-refresh-token')).toBe('')
    expect(h.updateCalls).toHaveLength(0)
  })

  it('decline when the guard refuses: signs out only, still clears cookies', async () => {
    h.deleteFresh.mockResolvedValue({ deleted: false })
    const res = await POST(consentRequest({ decision: 'decline' }))
    expect((await res.json()).deleted).toBe(false)
    // Only this session: a kept account's other devices stay signed in.
    expect(h.adminSignOut).toHaveBeenCalledWith('at_g', 'local')
    expect(h.deleteUser).not.toHaveBeenCalled()
    expect(cookieValue(res, 'sb-access-token')).toBe('')
  })

  it('decline: a sign-out that returns an error still clears cookies', async () => {
    h.deleteFresh.mockResolvedValue({ deleted: false })
    h.adminSignOut.mockResolvedValue({ data: null, error: { message: 'session_not_found' } })
    const res = await POST(consentRequest({ decision: 'decline' }))
    expect(res.status).toBe(200)
    expect(cookieValue(res, 'sb-access-token')).toBe('')
  })

  it('decline when the auth user lookup fails: no delete, cookies still cleared', async () => {
    h.getUserById.mockRejectedValue(new Error('network'))
    const res = await POST(consentRequest({ decision: 'decline' }))
    expect(res.status).toBe(200)
    expect((await res.json()).deleted).toBe(false)
    expect(h.deleteFresh).not.toHaveBeenCalled()
    expect(cookieValue(res, 'sb-access-token')).toBe('')
  })

  it('refuses a cross-origin request with 403', async () => {
    const res = await POST(consentRequest({ decision: 'decline' }, { origin: 'https://evil.example' }))
    expect(res.status).toBe(403)
    expect(h.deleteFresh).not.toHaveBeenCalled()
  })

  it('is rate limited per user, fail closed', async () => {
    h.rateLimit.mockResolvedValue({ success: false, remaining: 0, resetInMs: 1000 })
    const res = await POST(consentRequest({ decision: 'accept' }))
    expect(res.status).toBe(429)
    expect(h.rateLimit).toHaveBeenCalledWith('auth_complete_consent:usr_g1', {
      limit: 10,
      windowMs: 15 * 60 * 1000,
      failClosed: true,
    })
    expect(h.updateCalls).toHaveLength(0)
  })

  it('source never deletes a user except through deleteFreshGoogleUserIfSafe', () => {
    const source = readFileSync(
      path.resolve(import.meta.dirname, '../../app/api/auth/complete-consent/route.ts'),
      'utf8'
    )
    expect(source).not.toMatch(/\.deleteUser\s*\(/)
    expect(source).toContain('deleteFreshGoogleUserIfSafe')
  })
})
