import { describe, it, expect, vi, beforeEach } from 'vitest'
import { config as proxyConfig } from '../../proxy'
import { getAuthenticatedUserFromRequest } from '../auth'
import * as supabaseModule from '../supabase'

/**
 * ENG-03 / ENG-04: getClaims fast path, independent verification, and proxy matcher narrowing.
 */

function entersProxy(pathname: string): boolean {
  return proxyConfig.matcher.some((pattern) => new RegExp(`^${pattern}$`).test(pathname))
}

describe('ENG-03: Local JWT verification via getClaims', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('rejects an unsigned or malformed JWT', async () => {
    const mockAuthClient = {
      auth: {
        getClaims: vi.fn(async () => ({
          data: null,
          error: new Error('Invalid JWT format'),
        })),
      },
    }
    vi.spyOn(supabaseModule, 'createAuthenticatedServerClient').mockReturnValue(mockAuthClient as never)

    const req = new Request('https://prodily.app/api/settings/profile', {
      headers: {
        cookie: 'sb-access-token=malformed.jwt.token',
      },
    })

    const user = await getAuthenticatedUserFromRequest(req)
    expect(user).toBeNull()
    expect(mockAuthClient.auth.getClaims).toHaveBeenCalledWith('malformed.jwt.token')
  })

  it('rejects a forged or wrongly signed JWT', async () => {
    const mockAuthClient = {
      auth: {
        getClaims: vi.fn(async () => ({
          data: null,
          error: new Error('Invalid JWT signature'),
        })),
      },
    }
    vi.spyOn(supabaseModule, 'createAuthenticatedServerClient').mockReturnValue(mockAuthClient as never)

    const req = new Request('https://prodily.app/api/settings/profile', {
      headers: {
        cookie: 'sb-access-token=forged.signature.token',
      },
    })

    const user = await getAuthenticatedUserFromRequest(req)
    expect(user).toBeNull()
  })

  it('rejects an expired JWT', async () => {
    const mockAuthClient = {
      auth: {
        getClaims: vi.fn(async () => ({
          data: null,
          error: new Error('JWT expired'),
        })),
      },
    }
    vi.spyOn(supabaseModule, 'createAuthenticatedServerClient').mockReturnValue(mockAuthClient as never)

    const req = new Request('https://prodily.app/api/settings/profile', {
      headers: {
        cookie: 'sb-access-token=expired.jwt.token',
      },
    })

    const user = await getAuthenticatedUserFromRequest(req)
    expect(user).toBeNull()
  })

  it('accepts a valid signed JWT and maps claims to User', async () => {
    const mockAuthClient = {
      auth: {
        getClaims: vi.fn(async () => ({
          data: {
            claims: {
              sub: 'usr_verified_123',
              email: 'verified@prodily.app',
              role: 'authenticated',
              aud: 'authenticated',
              app_metadata: { provider: 'email', is_admin: false },
              user_metadata: { full_name: 'Verified Learner' },
              iat: 1700000000,
              exp: 1700003600,
            },
          },
          error: null,
        })),
      },
    }
    vi.spyOn(supabaseModule, 'createAuthenticatedServerClient').mockReturnValue(mockAuthClient as never)

    const req = new Request('https://prodily.app/api/settings/profile', {
      headers: {
        cookie: 'sb-access-token=valid.jwt.token',
      },
    })

    const user = await getAuthenticatedUserFromRequest(req)
    expect(user).not.toBeNull()
    expect(user?.id).toBe('usr_verified_123')
    expect(user?.email).toBe('verified@prodily.app')
    expect(user?.app_metadata).toEqual({ provider: 'email', is_admin: false })
  })

  it('enforces independent verification without trusting forged request identity headers', async () => {
    const mockAuthClient = {
      auth: {
        getClaims: vi.fn(async () => ({
          data: null,
          error: new Error('Invalid token'),
        })),
      },
    }
    vi.spyOn(supabaseModule, 'createAuthenticatedServerClient').mockReturnValue(mockAuthClient as never)

    // Attacker sends forged headers purporting to be an authenticated user or admin
    const req = new Request('https://prodily.app/api/settings/profile', {
      headers: {
        'x-user-id': 'admin-uuid',
        'x-user-role': 'admin',
        'x-user-email': 'admin@prodily.app',
        Authorization: 'Bearer invalid-token',
      },
    })

    const user = await getAuthenticatedUserFromRequest(req)
    // Server must reject: identity headers from caller are never trusted
    expect(user).toBeNull()
  })
})

describe('ENG-04: Narrowed session proxy matcher', () => {
  it('excludes public marketing and documentation pages that require no session', () => {
    const excludedPages = [
      '/about',
      '/contact',
      '/faq',
      '/frameworks',
      '/glossary',
      '/privacy',
      '/reviews',
      '/terms',
      '/waitlist',
    ]

    for (const page of excludedPages) {
      expect(entersProxy(page)).toBe(false)
    }
  })

  it('includes protected application routes', () => {
    const protectedPages = [
      '/dashboard',
      '/settings',
      '/academy',
      '/admin',
      '/admin/users',
      '/leaderboard',
      '/onboarding',
      '/progress',
      '/review',
    ]

    for (const page of protectedPages) {
      expect(entersProxy(page)).toBe(true)
    }
  })

  it('includes curriculum, lesson previews, and auth pages', () => {
    const authedAndPreviewPages = [
      '/',
      '/curriculum',
      '/lessons/lesson-001',
      '/login',
      '/signup',
      '/reset-password',
      '/p/someuser',
    ]

    for (const page of authedAndPreviewPages) {
      expect(entersProxy(page)).toBe(true)
    }
  })

  it('includes protected and admin API routes while excluding static assets and crons', () => {
    expect(entersProxy('/api/settings/profile')).toBe(true)
    expect(entersProxy('/api/admin/users')).toBe(true)
    expect(entersProxy('/api/notifications')).toBe(true)
    expect(entersProxy('/api/contact')).toBe(true)

    expect(entersProxy('/api/cron/daily-reminder')).toBe(false)
    expect(entersProxy('/api/health')).toBe(false)
    expect(entersProxy('/api/og/portfolio/someone')).toBe(false)
    expect(entersProxy('/api/email/webhooks')).toBe(false)
    expect(entersProxy('/_next/static/test.js')).toBe(false)
    expect(entersProxy('/favicon.ico')).toBe(false)
  })
})
