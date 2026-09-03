import { describe, it, expect, vi, beforeEach } from 'vitest'
import { submitOnboarding, OnboardingData } from '@/app/onboarding/actions'
import { proxy } from '@/proxy'
import { NextRequest } from 'next/server'
import { SettingsService } from '@/lib/admin/settings-service'

// Helper to create mock JWTs for tests
function createMockJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = Buffer.from('mock_signature').toString('base64url')
  return `${header}.${body}.${signature}`
}

const mockCookieStore = new Map<string, { value: string; [key: string]: unknown }>()

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => mockCookieStore.get(name),
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      mockCookieStore.set(name, { value, ...options })
    },
    delete: (name: string) => {
      mockCookieStore.delete(name)
    },
  })),
}))

const mockGetUser = vi.fn()
const mockRefreshSession = vi.fn()
const mockUpdateUserById = vi.fn()
const mockDbUpdate = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
      refreshSession: mockRefreshSession,
      admin: {
        updateUserById: mockUpdateUserById,
      },
    },
    from: vi.fn(() => ({
      update: mockDbUpdate.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    })),
  })),
}))

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn(() => ({
      update: mockDbUpdate.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    })),
    auth: {
      admin: {
        updateUserById: mockUpdateUserById,
      },
    },
  })),
  createAuthenticatedServerClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}))

describe('submitOnboarding Server Action & Session Refresh', () => {
  const validOnboardingData: OnboardingData = {
    name: 'Alex Rivera',
    username: 'alex_pm',
    avatar_url: 'https://example.com/avatar.png',
    bio: 'Aspiring PM',
    career_role: 'beginner',
    goal: 'become_pm',
    topics: ['discovery', 'strategy'],
    learning_preference: 'mix',
    linkedin_url: 'https://linkedin.com/in/alex',
    website_url: 'https://alex.me',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockCookieStore.clear()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key'
  })

  it('Test 1 — Start Learning Flow: saves onboarding, refreshes session, sets cookies with onboarding_complete: true and allows access to /academy', async () => {
    const initialAccessToken = createMockJwt({
      sub: 'usr_123',
      email: 'alex@example.com',
      user_metadata: { onboarding_complete: false },
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
    const initialRefreshToken = 'mock-refresh-token-1'

    mockCookieStore.set('sb-access-token', { value: initialAccessToken })
    mockCookieStore.set('sb-refresh-token', { value: initialRefreshToken })

    mockGetUser.mockResolvedValue({
      data: { user: { id: 'usr_123', email: 'alex@example.com' } },
      error: null,
    })

    const refreshedAccessToken = createMockJwt({
      sub: 'usr_123',
      email: 'alex@example.com',
      user_metadata: {
        full_name: 'Alex Rivera',
        username: 'alex_pm',
        onboarding_complete: true,
      },
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
    const refreshedRefreshToken = 'mock-refreshed-refresh-token'

    mockUpdateUserById.mockResolvedValue({ error: null })
    mockRefreshSession.mockResolvedValue({
      data: {
        session: {
          access_token: refreshedAccessToken,
          refresh_token: refreshedRefreshToken,
          expires_in: 3600,
        },
        user: { id: 'usr_123' },
      },
      error: null,
    })

    const result = await submitOnboarding(validOnboardingData)
    expect(result).toEqual({ success: true })

    // Verify DB update was called
    expect(mockDbUpdate).toHaveBeenCalled()

    // Verify admin.updateUserById set onboarding_complete: true
    expect(mockUpdateUserById).toHaveBeenCalledWith(
      'usr_123',
      expect.objectContaining({
        user_metadata: expect.objectContaining({
          onboarding_complete: true,
          full_name: 'Alex Rivera',
          username: 'alex_pm',
        }),
      })
    )

    // Verify refreshed cookies are persisted in cookieStore
    const newAccessCookie = mockCookieStore.get('sb-access-token')
    const newRefreshCookie = mockCookieStore.get('sb-refresh-token')

    expect(newAccessCookie?.value).toBe(refreshedAccessToken)
    expect(newAccessCookie?.httpOnly).toBe(true)
    expect(newAccessCookie?.sameSite).toBe('lax')
    expect(newRefreshCookie?.value).toBe(refreshedRefreshToken)
    expect(newRefreshCookie?.httpOnly).toBe(true)

    // Verify proxy allows access to /academy without redirecting to /onboarding
    vi.spyOn(SettingsService, 'getProductSettings').mockResolvedValue({
      siteName: 'Prodily',
      siteDescription: 'Product Management Academy',
      contactEmail: 'support@prodily.app',
      maintenanceMode: false,
      allowSignups: true,
      requireEmailVerification: false,
      sessionTimeoutMinutes: 10080,
    })

    const academyReq = new NextRequest('https://prodily.app/academy', {
      headers: {
        cookie: `sb-access-token=${newAccessCookie?.value}`,
      },
    })
    const academyRes = await proxy(academyReq)
    expect(academyRes.status).toBe(200)
    expect(academyRes.headers.get('location')).toBeNull()
  })

  it('Test 2 — Explore Prodily Flow: newly issued cookie allows direct access to /dashboard', async () => {
    const refreshedAccessToken = createMockJwt({
      sub: 'usr_456',
      email: 'learner@example.com',
      user_metadata: { onboarding_complete: true },
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
    mockCookieStore.set('sb-access-token', { value: refreshedAccessToken })

    vi.spyOn(SettingsService, 'getProductSettings').mockResolvedValue({
      siteName: 'Prodily',
      siteDescription: 'Product Management Academy',
      contactEmail: 'support@prodily.app',
      maintenanceMode: false,
      allowSignups: true,
      requireEmailVerification: false,
      sessionTimeoutMinutes: 10080,
    })

    const dashboardReq = new NextRequest('https://prodily.app/dashboard', {
      headers: {
        cookie: `sb-access-token=${refreshedAccessToken}`,
      },
    })
    const dashboardRes = await proxy(dashboardReq)
    expect(dashboardRes.status).toBe(200)
    expect(dashboardRes.headers.get('location')).toBeNull()
  })

  it('Test 3 — Expired Access Token: falls back to refresh token rather than failing with unauthorized', async () => {
    mockCookieStore.set('sb-access-token', { value: 'expired-access-token' })
    mockCookieStore.set('sb-refresh-token', { value: 'valid-refresh-token' })

    // getUser fails on expired token
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'JWT expired' },
    })

    // refreshSession succeeds
    const refreshedAccessToken = createMockJwt({
      sub: 'usr_recovered',
      email: 'recovered@example.com',
      user_metadata: { onboarding_complete: true },
      exp: Math.floor(Date.now() / 1000) + 3600,
    })

    mockRefreshSession.mockResolvedValue({
      data: {
        session: {
          access_token: refreshedAccessToken,
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
          user: { id: 'usr_recovered', email: 'recovered@example.com' },
        },
      },
      error: null,
    })

    mockUpdateUserById.mockResolvedValue({ error: null })

    const result = await submitOnboarding(validOnboardingData)
    expect(result).toEqual({ success: true })
    expect(mockUpdateUserById).toHaveBeenCalledWith('usr_recovered', expect.anything())
    expect(mockCookieStore.get('sb-access-token')?.value).toBe(refreshedAccessToken)
  })

  it('Test 4 — Invalid Session: rejects when neither token is valid', async () => {
    // No tokens in cookies
    const resultNoTokens = await submitOnboarding(validOnboardingData)
    expect(resultNoTokens).toEqual({ error: 'Unauthorized: No active session' })

    // Invalid access and refresh tokens
    mockCookieStore.set('sb-access-token', { value: 'invalid-access' })
    mockCookieStore.set('sb-refresh-token', { value: 'invalid-refresh' })

    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Invalid token' } })
    mockRefreshSession.mockResolvedValue({ data: { session: null }, error: { message: 'Invalid refresh token' } })

    const resultInvalid = await submitOnboarding(validOnboardingData)
    expect(resultInvalid).toEqual({ error: 'Unauthorized: Invalid session' })
  })

  it('validates required fields before executing database updates', async () => {
    mockCookieStore.set('sb-access-token', { value: 'valid-token' })
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'usr_123' } },
      error: null,
    })

    const invalidUsername = await submitOnboarding({
      ...validOnboardingData,
      username: 'a', // Too short
    })
    expect(invalidUsername).toEqual({
      error: 'Username must be 3–24 characters and only contain letters, numbers, and underscores.',
    })

    const emptyName = await submitOnboarding({
      ...validOnboardingData,
      name: '   ',
    })
    expect(emptyName).toEqual({
      error: 'Display name is required.',
    })
  })
})
