import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Phase 2 session-safety follow-ups.
//
// S1: change-email re-verifies the current password with signInWithPassword. supabase-js then
// sends that learner's access token on every later PostgREST call through the same client, so a
// duplicate-email lookup on it runs as `authenticated` under RLS, sees no other account's row,
// and the 409 can never fire. The lookup must run on a service-role client that never signed in.
//
// W6 / CQ-10: the proxy refreshes the session for /api/admin/* (still exempt from maintenance
// mode), and leaves /api/auth/* on its fast path with no session work at all.

const h = vi.hoisted(() => {
  const state = {
    nextId: 0,
    clients: [] as Array<{ id: number; signedIn: boolean; signInCalls: number }>,
    // Rows a service-role (session-free) client sees in public.users, keyed by email.
    usersByEmail: {} as Record<string, { id: string }>,
    cookieJar: {} as Record<string, string>,
  }

  function makeServiceClient() {
    const meta = { id: ++state.nextId, signedIn: false, signInCalls: 0 }
    state.clients.push(meta)
    return {
      __meta: meta,
      auth: {
        signInWithPassword: vi.fn(async () => {
          meta.signInCalls += 1
          meta.signedIn = true
          return { data: { user: { id: 'usr_me' }, session: { access_token: 'a', refresh_token: 'r' } }, error: null }
        }),
        admin: {
          getUserById: vi.fn(async () => ({
            data: { user: { id: 'usr_me', identities: [{ provider: 'email' }], app_metadata: { providers: ['email'] } } },
            error: null,
          })),
        },
      },
      from: (table: string) => ({
        select: () => ({
          eq: (_col: string, value: string) => ({
            // Models RLS: once this client holds a learner session, other learners' rows vanish.
            maybeSingle: async () => ({
              data: table === 'users' && !meta.signedIn ? state.usersByEmail[value] ?? null : null,
              error: null,
            }),
          }),
        }),
      }),
    }
  }

  // Anon-key clients: the proxy's verifier and the change-email session client.
  const getUser = vi.fn()
  const refreshSession = vi.fn()
  const setSession = vi.fn()
  const updateUser = vi.fn()
  const anonClient = {
    auth: { getUser, refreshSession, setSession, updateUser },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { is_admin: true }, error: null }) }),
      }),
    }),
  }

  return {
    state,
    makeServiceClient,
    createServiceRoleClient: vi.fn(() => makeServiceClient()),
    getUser,
    refreshSession,
    setSession,
    updateUser,
    anonClient,
    getProductSettings: vi.fn(),
    evaluateRateLimit: vi.fn(),
  }
})

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => (name in h.state.cookieJar ? { name, value: h.state.cookieJar[name] } : undefined),
  })),
  headers: vi.fn(() => new Headers()),
}))

vi.mock('@supabase/supabase-js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@supabase/supabase-js')>()
  return { ...actual, createClient: vi.fn(() => h.anonClient) }
})

vi.mock('@/lib/supabase', () => ({ createServiceRoleClient: h.createServiceRoleClient }))

vi.mock('@/lib/auth', () => ({
  getAuthenticatedUserFromRequest: vi.fn(async () => ({ id: 'usr_me', email: 'me@example.com' })),
}))

vi.mock('@/lib/rate-limit', () => ({ evaluateRateLimit: h.evaluateRateLimit }))

vi.mock('@/lib/monitoring/logger', () => ({
  logSystemError: vi.fn().mockResolvedValue('err_1'),
  logErrorReport: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/admin/settings-service', () => ({
  SettingsService: { getProductSettings: h.getProductSettings },
}))

import { POST as changeEmailPOST } from '@/app/api/settings/security/change-email/route'
import { proxy } from '../../proxy'

beforeEach(() => {
  vi.clearAllMocks()
  h.state.nextId = 0
  h.state.clients.length = 0
  h.state.usersByEmail = {}
  h.state.cookieJar = { 'sb-access-token': 'learner-access', 'sb-refresh-token': 'learner-refresh' }
  h.createServiceRoleClient.mockImplementation(() => h.makeServiceClient())
  h.evaluateRateLimit.mockResolvedValue({ success: true, remaining: 4, resetInMs: 60_000 })
  h.getProductSettings.mockResolvedValue({ maintenanceMode: false, requireEmailVerification: false })
  h.setSession.mockResolvedValue({ data: {}, error: null })
  h.updateUser.mockResolvedValue({ data: {}, error: null })
  h.getUser.mockImplementation(async (token: string) =>
    token === 'valid-access'
      ? { data: { user: { id: 'usr_admin', email: 'admin@example.com', app_metadata: { is_admin: true }, user_metadata: {} } }, error: null }
      : { data: { user: null }, error: new Error('JWT expired') }
  )
  h.refreshSession.mockResolvedValue({
    data: {
      user: { id: 'usr_admin', email: 'admin@example.com', app_metadata: { is_admin: true }, user_metadata: {} },
      session: { access_token: 'fresh-access', refresh_token: 'fresh-refresh', expires_in: 3600 },
    },
    error: null,
  })
})

// ── S1: change-email duplicate lookup ─────────────────────────────────────

function changeEmailRequest(newEmail: string) {
  return new Request('https://prodily.app/api/settings/security/change-email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ currentPassword: 'correct-horse', newEmail }),
  })
}

describe('POST /api/settings/security/change-email duplicate check', () => {
  it('returns 409 when another account owns the address, seen through a client that never signed in', async () => {
    h.state.usersByEmail['taken@example.com'] = { id: 'usr_other' }

    const res = await changeEmailPOST(changeEmailRequest('taken@example.com'))

    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/already associated with another account/)
    expect(h.updateUser).not.toHaveBeenCalled()

    const signInClients = h.state.clients.filter((c) => c.signInCalls > 0)
    expect(signInClients).toHaveLength(1)
    // The lookup client is a second service-role client that holds no session.
    expect(h.state.clients.some((c) => c.signInCalls === 0 && !c.signedIn)).toBe(true)
  })

  it('does not 409 on the learner\'s own row and goes on to the native updateUser flow', async () => {
    h.state.usersByEmail['new@example.com'] = { id: 'usr_me' }

    const res = await changeEmailPOST(changeEmailRequest('new@example.com'))

    expect(res.status).toBe(200)
    expect(h.updateUser).toHaveBeenCalledWith({ email: 'new@example.com' }, expect.any(Object))
  })
})

// ── W6 / CQ-10: proxy session refresh for admin APIs ──────────────────────

function apiRequest(path: string, cookies: string) {
  return new NextRequest(`https://prodily.app${path}`, { headers: { cookie: cookies } })
}

const EXPIRED = 'sb-access-token=expired-access; sb-refresh-token=admin-refresh'

describe('proxy session handling for /api/admin/* and /api/auth/*', () => {
  it('refreshes an expired admin session on /api/admin/* and writes the new pair back', async () => {
    const res = await proxy(apiRequest('/api/admin/users', EXPIRED))

    expect(res.status).toBe(200)
    expect(h.refreshSession).toHaveBeenCalledTimes(1)
    expect(h.refreshSession).toHaveBeenCalledWith({ refresh_token: 'admin-refresh' })
    const cookies = (res as unknown as { cookies: { get: (n: string) => { value: string } | undefined } }).cookies
    expect(cookies.get('sb-access-token')?.value).toBe('fresh-access')
    expect(cookies.get('sb-refresh-token')?.value).toBe('fresh-refresh')
  })

  it('keeps /api/admin/* exempt from maintenance mode', async () => {
    h.getProductSettings.mockResolvedValue({ maintenanceMode: true, requireEmailVerification: true })
    h.refreshSession.mockResolvedValue({
      data: {
        user: { id: 'usr_learner', email: 'l@example.com', app_metadata: {}, user_metadata: {} },
        session: { access_token: 'fresh-access', refresh_token: 'fresh-refresh', expires_in: 3600 },
      },
      error: null,
    })

    const res = await proxy(apiRequest('/api/admin/settings', EXPIRED))

    expect(res.status).toBe(200)
    expect(h.getProductSettings).not.toHaveBeenCalled()
    expect(h.refreshSession).toHaveBeenCalledTimes(1)
  })

  it('does not refresh a still-valid admin token and sets no cookies', async () => {
    const res = await proxy(apiRequest('/api/admin/users', 'sb-access-token=valid-access; sb-refresh-token=admin-refresh'))

    expect(res.status).toBe(200)
    expect(h.getUser).toHaveBeenCalledWith('valid-access')
    expect(h.refreshSession).not.toHaveBeenCalled()
    const cookies = (res as unknown as { cookies: { getAll: () => unknown[] } }).cookies
    expect(cookies.getAll()).toEqual([])
  })

  it('passes a signed-out /api/admin/* request through for the route to answer 401', async () => {
    const res = await proxy(apiRequest('/api/admin/users', ''))

    expect(res.status).toBe(200)
    expect(h.getUser).not.toHaveBeenCalled()
    expect(h.refreshSession).not.toHaveBeenCalled()
  })

  it('leaves /api/auth/* on the fast path: no verification and no refresh', async () => {
    const res = await proxy(apiRequest('/api/auth/session', EXPIRED))

    expect(res.status).toBe(200)
    expect(h.getUser).not.toHaveBeenCalled()
    expect(h.refreshSession).not.toHaveBeenCalled()
    expect(h.getProductSettings).not.toHaveBeenCalled()
  })
})
