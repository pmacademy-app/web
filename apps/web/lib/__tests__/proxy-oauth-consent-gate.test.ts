/**
 * Proxy consent gate for Google sign-ups (T4).
 *
 * A Google user whose profile has no Terms/age consent is held on
 * /signup/complete-consent: app pages redirect there and learner APIs answer 403
 * CONSENT_REQUIRED. Password users (including legacy ones with null consent) are never
 * gated and never cost an extra profile query; a failed profile read fails open.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { state, mockSelect, mockGetProductSettings } = vi.hoisted(() => ({
  state: {
    users: {} as Record<string, { app_metadata: Record<string, unknown>; user_metadata: Record<string, unknown> }>,
    profile: null as Record<string, unknown> | null,
    profileError: null as unknown,
    profileThrows: false,
  },
  mockSelect: vi.fn(),
  mockGetProductSettings: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn(async (token: string) => {
        const u = state.users[token]
        if (!u) return { data: { user: null }, error: new Error('Invalid token') }
        return {
          data: {
            user: { id: `id-${token}`, email: `${token}@example.com`, email_confirmed_at: '2026-10-01T00:00:00Z', ...u },
          },
          error: null,
        }
      }),
      refreshSession: vi.fn(async () => ({ data: { session: null, user: null }, error: null })),
    },
    from: () => ({
      select: (cols: string) => {
        mockSelect(cols)
        return {
          eq: () => ({
            maybeSingle: async () => {
              if (state.profileThrows) throw new Error('db down')
              return { data: state.profile, error: state.profileError }
            },
          }),
        }
      },
    }),
  }),
}))

vi.mock('@/lib/admin/settings-service', () => ({
  SettingsService: { getProductSettings: mockGetProductSettings },
}))

import { proxy } from '../../proxy'

const onboarded = { onboarding_complete: true }

function req(path: string, token?: string) {
  return new NextRequest(`https://prodily.app${path}`, {
    headers: token ? { cookie: `sb-access-token=${token}` } : {},
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetProductSettings.mockResolvedValue({ maintenanceMode: false, requireEmailVerification: false })
  state.profile = null
  state.profileError = null
  state.profileThrows = false
  state.users = {
    google: { app_metadata: { provider: 'google', providers: ['google'] }, user_metadata: onboarded },
    password: { app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: onboarded },
    merged: { app_metadata: { provider: 'email', providers: ['email', 'google'] }, user_metadata: onboarded },
  }
})

describe('consent gate: Google user without consent', () => {
  beforeEach(() => {
    state.profile = { auth_provider: 'google', terms_accepted_at: null }
  })

  it('redirects app pages to the gate, keeping the destination as next', async () => {
    const res = await proxy(req('/dashboard', 'google'))
    expect(res.status).toBe(307)
    const location = new URL(res.headers.get('location')!)
    expect(location.pathname).toBe('/signup/complete-consent')
    expect(location.searchParams.get('next')).toBe('/dashboard')
  })

  it('gates before onboarding', async () => {
    state.users.google.user_metadata = {}
    const res = await proxy(req('/onboarding', 'google'))
    expect(new URL(res.headers.get('location')!).pathname).toBe('/signup/complete-consent')
  })

  it('answers learner APIs with 403 CONSENT_REQUIRED', async () => {
    const res = await proxy(req('/api/progress', 'google'))
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('CONSENT_REQUIRED')
  })

  it('lets the gate page render', async () => {
    const res = await proxy(req('/signup/complete-consent?next=/academy', 'google'))
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
  })

  it('never gates /api/auth/* (logout, complete-consent)', async () => {
    for (const path of ['/api/auth/logout', '/api/auth/complete-consent']) {
      const res = await proxy(req(path, 'google'))
      expect(res.status).toBe(200)
    }
  })

  it('never gates the legal pages', async () => {
    for (const path of ['/terms', '/privacy']) {
      const res = await proxy(req(path, 'google'))
      expect(res.status).toBe(200)
    }
  })
})

describe('consent gate: users who are never gated', () => {
  it('password user with null consent: no gate and no profile query', async () => {
    state.profile = { auth_provider: 'email', terms_accepted_at: null }
    const page = await proxy(req('/dashboard', 'password'))
    expect(page.status).toBe(200)
    const api = await proxy(req('/api/progress', 'password'))
    expect(api.status).toBe(200)
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it('merged password account that linked Google keeps auth_provider email and is not gated', async () => {
    state.profile = { auth_provider: 'email', terms_accepted_at: null }
    const res = await proxy(req('/dashboard', 'merged'))
    expect(res.status).toBe(200)
  })

  it('Google user with consent is not gated and is bounced from the gate page', async () => {
    state.profile = { auth_provider: 'google', terms_accepted_at: '2026-10-20T00:00:00Z' }
    expect((await proxy(req('/dashboard', 'google'))).status).toBe(200)
    const gate = await proxy(req('/signup/complete-consent', 'google'))
    expect(gate.status).toBe(307)
    expect(new URL(gate.headers.get('location')!).pathname).toBe('/dashboard')
  })

  it('password user visiting the gate page is sent to /dashboard', async () => {
    const res = await proxy(req('/signup/complete-consent', 'password'))
    expect(new URL(res.headers.get('location')!).pathname).toBe('/dashboard')
  })

  it('anonymous visitor on the gate page is sent to /login', async () => {
    const res = await proxy(req('/signup/complete-consent'))
    expect(res.status).toBe(307)
    expect(new URL(res.headers.get('location')!).pathname).toBe('/login')
  })

  it('fails open when the profile read errors, warning once per request with the user id only', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    state.profileError = { message: 'boom' }
    expect((await proxy(req('/dashboard', 'google'))).status).toBe(200)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith('[proxy] consent gate failed open: profile unavailable', { userId: 'id-google' })
    expect((await proxy(req('/api/progress', 'google'))).status).toBe(200)
    expect(warn).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })

  it('does not warn for a password user or a Google user with a profile', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    state.profile = { auth_provider: 'google', terms_accepted_at: '2026-10-20T00:00:00Z' }
    await proxy(req('/dashboard', 'google'))
    await proxy(req('/dashboard', 'password'))
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('fails open when the profile read throws', async () => {
    state.profileThrows = true
    expect((await proxy(req('/dashboard', 'google'))).status).toBe(200)
  })

  it('fails open when the profile row is missing', async () => {
    state.profile = null
    expect((await proxy(req('/dashboard', 'google'))).status).toBe(200)
  })
})
