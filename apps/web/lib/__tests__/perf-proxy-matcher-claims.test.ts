/**
 * Perf plan items 15 and 16 (2026-11-18).
 *
 * 15: the proxy matcher no longer enters for anonymous visits to `/`, `/curriculum`,
 *     `/lessons/*`, `/maintenance`, `/verify/*` and `/p/*`. Those visits only ever got a
 *     request id and a pass-through. They still enter when the proxy has work to do: a
 *     session cookie (signed-in redirects) or a consented `?ref` (referral cookie).
 * 16: a Google user whose token carries `app_metadata.terms_accepted` and
 *     `onboarding_complete` costs the proxy no profile read. Without the claims the read
 *     still runs, still gates, and still fails open.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { entersProxy, SIGNED_IN } from './helpers/proxy-matcher'

const { state, mockSelect, mockGetProductSettings } = vi.hoisted(() => ({
  state: {
    appMetadata: {} as Record<string, unknown>,
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
      getUser: vi.fn(async () => ({
        data: {
          user: {
            id: 'id-google',
            email: 'g@example.com',
            email_confirmed_at: '2026-10-01T00:00:00Z',
            app_metadata: state.appMetadata,
            user_metadata: {},
          },
        },
        error: null,
      })),
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

const GOOGLE = { provider: 'google', providers: ['google'] }
const CONSENTED_REF = { query: { ref: 'ABC123' }, cookies: { prodily_cookie_consent: 'accepted|2026-09-23|x' } }

function req(path: string) {
  return new NextRequest(`https://prodily.app${path}`, { headers: { cookie: 'sb-access-token=tok' } })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetProductSettings.mockResolvedValue({ maintenanceMode: false, requireEmailVerification: false })
  state.appMetadata = { ...GOOGLE }
  state.profile = null
  state.profileError = null
  state.profileThrows = false
})

describe('item 15: proxy matcher', () => {
  it('anonymous / does not enter the proxy', () => {
    expect(entersProxy('/')).toBe(false)
    expect(entersProxy('/index.rsc')).toBe(false)
  })

  it('signed-in / still enters, with either session cookie alone', () => {
    expect(entersProxy('/', SIGNED_IN)).toBe(true)
    expect(entersProxy('/', { cookies: { 'sb-access-token': 'at' } })).toBe(true)
    expect(entersProxy('/', { cookies: { 'sb-refresh-token': 'rt' } })).toBe(true)
    // Client-side navigation fetches the RSC payload of the same page.
    expect(entersProxy('/index.rsc', SIGNED_IN)).toBe(true)
  })

  it('an empty session cookie counts as absent, as it does inside the proxy', () => {
    expect(entersProxy('/', { cookies: { 'sb-access-token': '' } })).toBe(false)
  })

  it('/curriculum and /lessons/* enter only with a session (they redirect to /academy)', () => {
    for (const p of ['/curriculum', '/lessons/lesson-001']) {
      expect(entersProxy(p)).toBe(false)
      expect(entersProxy(p, SIGNED_IN)).toBe(true)
    }
  })

  it('/verify/* and /p/* never enter for a session alone: the proxy does nothing for them', () => {
    for (const p of ['/verify/cert-1', '/p/someone', '/maintenance']) {
      expect(entersProxy(p)).toBe(false)
      expect(entersProxy(p, SIGNED_IN)).toBe(false)
    }
  })

  it('a ?ref visit with a cookie-consent cookie still enters, so the referral cookie is kept', () => {
    for (const p of ['/', '/curriculum', '/lessons/lesson-001', '/maintenance', '/verify/cert-1', '/p/someone']) {
      expect(entersProxy(p, CONSENTED_REF)).toBe(true)
      // Without a consent cookie the proxy would drop the code anyway.
      expect(entersProxy(p, { query: { ref: 'ABC123' } })).toBe(false)
    }
  })

  it('app pages, module pages, auth pages and learner APIs still enter unconditionally', () => {
    for (const p of [
      '/dashboard',
      '/academy/module-1/lesson-001',
      '/curriculum/module-1',
      '/progress',
      '/review',
      '/onboarding',
      '/admin',
      '/login',
      '/signup',
      '/signup/complete-consent',
      '/reset-password',
      '/api/progress',
      '/api/settings/profile',
      '/api/contact',
      '/api/client-errors',
      '/api/auth/login',
      '/api/admin/users',
    ]) {
      expect(entersProxy(p), p).toBe(true)
    }
  })

  it('keeps every earlier exclusion, signed in or not', () => {
    for (const p of [
      '/about',
      '/terms',
      '/waitlist',
      '/api/cron/cleanup',
      '/api/health',
      '/api/og/portfolio/x',
      '/api/email/webhooks',
      '/api/email/unsubscribe',
      '/api/auth/callback',
      '/_next/static/chunk.js',
      '/favicon.ico',
      '/logo.svg',
    ]) {
      expect(entersProxy(p, SIGNED_IN), p).toBe(false)
    }
  })
})

describe('item 16: trusted claims skip the profile read', () => {
  it('Google user with terms_accepted and onboarding_complete claims: no profile read, page passes', async () => {
    state.appMetadata = { ...GOOGLE, terms_accepted: true, onboarding_complete: true }
    const res = await proxy(req('/dashboard'))
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it('same claims on a learner API: no profile read, request passes', async () => {
    state.appMetadata = { ...GOOGLE, terms_accepted: true, onboarding_complete: true }
    const res = await proxy(req('/api/progress'))
    expect(res.status).toBe(200)
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it('the consent gate page sends a claimed user on to the dashboard without a read', async () => {
    state.appMetadata = { ...GOOGLE, terms_accepted: true }
    const res = await proxy(req('/signup/complete-consent'))
    expect(new URL(res.headers.get('location')!).pathname).toBe('/dashboard')
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it('only a literal true counts: a string claim still reads and gates', async () => {
    state.appMetadata = { ...GOOGLE, terms_accepted: 'true', onboarding_complete: true }
    state.profile = { auth_provider: 'google', terms_accepted_at: null }
    const res = await proxy(req('/dashboard'))
    expect(mockSelect).toHaveBeenCalledTimes(1)
    expect(new URL(res.headers.get('location')!).pathname).toBe('/signup/complete-consent')
  })

  it('claim absent: the profile is read and a Google user without consent is gated', async () => {
    state.appMetadata = { ...GOOGLE, onboarding_complete: true }
    state.profile = { auth_provider: 'google', terms_accepted_at: null }
    const res = await proxy(req('/dashboard'))
    expect(mockSelect).toHaveBeenCalledTimes(1)
    expect(new URL(res.headers.get('location')!).pathname).toBe('/signup/complete-consent')
  })

  it('claim absent: a consented Google user passes after one read', async () => {
    state.appMetadata = { ...GOOGLE, onboarding_complete: true }
    state.profile = { auth_provider: 'google', terms_accepted_at: '2026-10-01T00:00:00Z' }
    const res = await proxy(req('/dashboard'))
    expect(res.status).toBe(200)
    expect(mockSelect).toHaveBeenCalledTimes(1)
  })

  it('claim absent and the profile read fails: still fails open (PR #97)', async () => {
    state.appMetadata = { ...GOOGLE, onboarding_complete: true }
    state.profileThrows = true
    const res = await proxy(req('/dashboard'))
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
  })

  it('terms_accepted without onboarding_complete still reads once for the onboarding fallback', async () => {
    state.appMetadata = { ...GOOGLE, terms_accepted: true }
    state.profile = { auth_provider: 'google', terms_accepted_at: '2026-10-01T00:00:00Z', onboarding_completed: false }
    const res = await proxy(req('/dashboard'))
    expect(mockSelect).toHaveBeenCalledTimes(1)
    expect(new URL(res.headers.get('location')!).pathname).toBe('/onboarding')
  })
})
