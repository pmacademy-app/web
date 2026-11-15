import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from '../../proxy'

const mockGetUser = vi.fn()
const mockMaybeSingle = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
      refreshSession: vi.fn(async () => ({ data: { session: null, user: null }, error: null })),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => mockMaybeSingle(),
        }),
      }),
    }),
  }),
}))

describe('SEC-21: Trusted Claims and Deprecate user_metadata Access Decisions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('1. User with user_metadata.onboarding_complete=true but false in app_metadata and DB is redirected to /onboarding', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'usr-untrusted-meta',
          email: 'untrusted@example.com',
          email_confirmed_at: '2026-01-01T00:00:00Z',
          app_metadata: {},
          user_metadata: {
            onboarding_complete: true, // Spoofed or legacy client metadata
          },
        },
      },
      error: null,
    })

    mockMaybeSingle.mockResolvedValue({
      data: {
        is_admin: false,
        curriculum_access_override: false,
        auth_provider: 'email',
        terms_accepted_at: '2026-01-01T00:00:00Z',
        onboarding_completed: false,
        goal: null,
      },
      error: null,
    })

    const req = new NextRequest('https://prodily.app/dashboard', {
      headers: {
        cookie: 'sb-access-token=mock-token',
      },
    })

    const res = await proxy(req)
    expect(res).toBeDefined()
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/onboarding')
  })

  it('2. User with app_metadata.onboarding_complete=true is allowed through to the destination', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'usr-trusted-claim',
          email: 'trusted@example.com',
          email_confirmed_at: '2026-01-01T00:00:00Z',
          app_metadata: {
            onboarding_complete: true,
          },
          user_metadata: {},
        },
      },
      error: null,
    })

    mockMaybeSingle.mockResolvedValue({
      data: {
        is_admin: false,
        curriculum_access_override: false,
        auth_provider: 'email',
        terms_accepted_at: '2026-01-01T00:00:00Z',
        onboarding_completed: false,
        goal: null,
      },
      error: null,
    })

    const req = new NextRequest('https://prodily.app/dashboard', {
      headers: {
        cookie: 'sb-access-token=mock-token',
      },
    })

    const res = await proxy(req)
    expect(res).toBeDefined()
    // Should pass through to /learn without redirecting to /onboarding
    expect(res.headers.get('location')).toBeNull()
  })

  it('3. User with database public.users.onboarding_completed=true is allowed through', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'usr-db-completed',
          email: 'dbuser@example.com',
          email_confirmed_at: '2026-01-01T00:00:00Z',
          app_metadata: {},
          user_metadata: {},
        },
      },
      error: null,
    })

    mockMaybeSingle.mockResolvedValue({
      data: {
        is_admin: false,
        curriculum_access_override: false,
        auth_provider: 'email',
        terms_accepted_at: '2026-01-01T00:00:00Z',
        onboarding_completed: true,
        goal: null,
      },
      error: null,
    })

    const req = new NextRequest('https://prodily.app/dashboard', {
      headers: {
        cookie: 'sb-access-token=mock-token',
      },
    })

    const res = await proxy(req)
    expect(res).toBeDefined()
    expect(res.headers.get('location')).toBeNull()
  })

  it('4. User with database public.users.goal set is allowed through', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'usr-goal-set',
          email: 'goal@example.com',
          email_confirmed_at: '2026-01-01T00:00:00Z',
          app_metadata: {},
          user_metadata: {},
        },
      },
      error: null,
    })

    mockMaybeSingle.mockResolvedValue({
      data: {
        is_admin: false,
        curriculum_access_override: false,
        auth_provider: 'email',
        terms_accepted_at: '2026-01-01T00:00:00Z',
        onboarding_completed: false,
        goal: 'transition_to_pm',
      },
      error: null,
    })

    const req = new NextRequest('https://prodily.app/dashboard', {
      headers: {
        cookie: 'sb-access-token=mock-token',
      },
    })

    const res = await proxy(req)
    expect(res).toBeDefined()
    expect(res.headers.get('location')).toBeNull()
  })

  it('5. Spoofed user_metadata.curriculum_access_override does not bypass onboarding', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'usr-override-spoof',
          email: 'spoof@example.com',
          email_confirmed_at: '2026-01-01T00:00:00Z',
          app_metadata: {},
          user_metadata: {
            curriculum_access_override: true, // Spoofed user metadata
          },
        },
      },
      error: null,
    })

    mockMaybeSingle.mockResolvedValue({
      data: {
        is_admin: false,
        curriculum_access_override: false,
        auth_provider: 'email',
        terms_accepted_at: '2026-01-01T00:00:00Z',
        onboarding_completed: false,
        goal: null,
      },
      error: null,
    })

    const req = new NextRequest('https://prodily.app/dashboard', {
      headers: {
        cookie: 'sb-access-token=mock-token',
      },
    })

    const res = await proxy(req)
    expect(res).toBeDefined()
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/onboarding')
  })
})
