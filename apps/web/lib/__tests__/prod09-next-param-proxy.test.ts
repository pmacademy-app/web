/**
 * PROD-09 / UX-07: the proxy keeps the learner's return path.
 *
 * - Signed-out visitors to a learner page go to /login?next=<path+query>.
 * - Learners forced into onboarding go to /onboarding?next=<path+query>, except from
 *   /dashboard (the default) and from any /onboarding path (that would loop).
 * - A learner who already finished onboarding and lands on /onboarding is sent to a
 *   sanitized `next`, never off-origin, never into /api, never back to /onboarding.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { state, mockGetProductSettings } = vi.hoisted(() => ({
  state: {
    users: {} as Record<string, { app_metadata: Record<string, unknown>; user_metadata: Record<string, unknown> }>,
  },
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
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { is_admin: false, curriculum_access_override: false, auth_provider: 'email', terms_accepted_at: null },
            error: null,
          }),
        }),
      }),
    }),
  }),
}))

vi.mock('@/lib/admin/settings-service', () => ({
  SettingsService: { getProductSettings: mockGetProductSettings },
}))

import { proxy } from '../../proxy'

function req(pathAndQuery: string, token?: string) {
  return new NextRequest(`https://prodily.app${pathAndQuery}`, {
    headers: token ? { cookie: `sb-access-token=${token}` } : {},
  })
}

function location(res: Response): URL {
  const raw = res.headers.get('location')
  expect(raw).not.toBeNull()
  return new URL(raw!)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetProductSettings.mockResolvedValue({ maintenanceMode: false, requireEmailVerification: false })
  state.users = {
    fresh: { app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {} },
    onboarded: { app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { onboarding_complete: true } },
  }
})

describe('signed-out redirect to /login carries next', () => {
  it('keeps path and query, encoded', async () => {
    const res = await proxy(req('/academy/foundations/les_zoyq8a?tab=quiz&x=1'))
    expect(res.status).toBe(307)
    const loc = location(res)
    expect(loc.origin).toBe('https://prodily.app')
    expect(loc.pathname).toBe('/login')
    expect(loc.searchParams.get('next')).toBe('/academy/foundations/les_zoyq8a?tab=quiz&x=1')
    expect(res.headers.get('location')).toContain('next=%2Facademy%2Ffoundations%2Fles_zoyq8a%3Ftab%3Dquiz%26x%3D1')
  })

  it('carries /dashboard too', async () => {
    const loc = location(await proxy(req('/dashboard')))
    expect(loc.pathname).toBe('/login')
    expect(loc.searchParams.get('next')).toBe('/dashboard')
  })

  // The cookie clearing on this redirect is not asserted: vitest.setup.ts mocks
  // next/server with an in-memory cookie map that never reaches the headers.
  it('an invalid session token is treated as signed out and still carries next', async () => {
    const loc = location(await proxy(req('/progress', 'expired-token')))
    expect(loc.pathname).toBe('/login')
    expect(loc.searchParams.get('next')).toBe('/progress')
  })

  it('omits next when the path is too long to be a safe return path', async () => {
    const loc = location(await proxy(req(`/academy/${'a'.repeat(600)}`)))
    expect(loc.pathname).toBe('/login')
    expect(loc.searchParams.has('next')).toBe(false)
  })

  it('the consent gate page sends anonymous visitors to /login with next', async () => {
    const loc = location(await proxy(req('/signup/complete-consent?next=%2Facademy')))
    expect(loc.pathname).toBe('/login')
    expect(loc.searchParams.get('next')).toBe('/signup/complete-consent?next=%2Facademy')
  })

  it('the admin area still goes to /admin/login without next', async () => {
    const loc = location(await proxy(req('/admin/users')))
    expect(loc.pathname).toBe('/admin/login')
    expect(loc.searchParams.has('next')).toBe(false)
  })
})

describe('forced onboarding carries next', () => {
  it('keeps the requested learner page', async () => {
    const loc = location(await proxy(req('/academy/foundations/les_zoyq8a?from=cta', 'fresh')))
    expect(loc.pathname).toBe('/onboarding')
    expect(loc.searchParams.get('next')).toBe('/academy/foundations/les_zoyq8a?from=cta')
  })

  it('omits next from /dashboard', async () => {
    const loc = location(await proxy(req('/dashboard?welcome=1', 'fresh')))
    expect(loc.pathname).toBe('/onboarding')
    expect(loc.searchParams.has('next')).toBe(false)
  })

  it('omits next from an /onboarding sub-path, so no /onboarding -> /onboarding next', async () => {
    const loc = location(await proxy(req('/onboarding/step-2', 'fresh')))
    expect(loc.pathname).toBe('/onboarding')
    expect(loc.searchParams.has('next')).toBe(false)
  })

  it('lets a not-yet-onboarded learner render /onboarding?next=... (no redirect)', async () => {
    const res = await proxy(req('/onboarding?next=%2Facademy', 'fresh'))
    expect(res.headers.get('location')).toBeNull()
  })
})

describe('onboarded learner on /onboarding honours a sanitized next', () => {
  it('goes to a safe next with its query', async () => {
    const loc = location(await proxy(req(`/onboarding?next=${encodeURIComponent('/academy/foundations/les_zoyq8a?x=1')}`, 'onboarded')))
    expect(loc.origin).toBe('https://prodily.app')
    expect(loc.pathname).toBe('/academy/foundations/les_zoyq8a')
    expect(loc.searchParams.get('x')).toBe('1')
  })

  it('defaults to /dashboard without next', async () => {
    const loc = location(await proxy(req('/onboarding', 'onboarded')))
    expect(loc.href).toBe('https://prodily.app/dashboard')
  })

  it.each([
    ['protocol-relative', '//evil.com'],
    ['backslash', '/\\evil.com'],
    ['absolute URL', 'https://x'],
    ['api path', '/api/x'],
    ['api root', '/api'],
    ['upper-case api', '/API/x'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['relative', 'evil.com'],
    ['control character', '/academy\n//evil.com'],
    ['empty', ''],
  ])('falls back to /dashboard for %s', async (_label, next) => {
    const loc = location(await proxy(req(`/onboarding?next=${encodeURIComponent(next)}`, 'onboarded')))
    expect(loc.href).toBe('https://prodily.app/dashboard')
  })

  it.each(['/onboarding', '/onboarding?next=%2Fonboarding', '/onboarding/step-2', '/ONBOARDING', '/onboarding#x'])(
    'never redirects back into onboarding (next=%s)',
    async (next) => {
      const loc = location(await proxy(req(`/onboarding?next=${encodeURIComponent(next)}`, 'onboarded')))
      expect(loc.href).toBe('https://prodily.app/dashboard')
    }
  )
})
