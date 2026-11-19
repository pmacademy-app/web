import { afterEach, describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from '../../proxy'
import { getAuthenticatedUserFromRequest } from '../auth'

vi.mock('@supabase/supabase-js', () => {
  return {
    createClient: () => ({
      auth: {
        getClaims: vi.fn(async (token?: string) => {
          if (token === 'mock-user-token') {
            return {
              data: {
                claims: {
                  sub: 'mock-user-id',
                  email: 'user@example.com',
                  user_metadata: { is_admin: true },
                  app_metadata: {},
                },
              },
              error: null,
            }
          }
          return { data: null, error: new Error('Invalid token') }
        }),
        getUser: vi.fn(async (token: string) => {
          if (token === 'mock-user-token') {
            return {
              data: {
                user: {
                  id: 'mock-user-id',
                  email: 'user@example.com',
                  user_metadata: { is_admin: true },
                },
              },
              error: null,
            }
          }
          return { data: { user: null }, error: new Error('Invalid token') }
        }),
        refreshSession: vi.fn(async () => ({ data: { session: null, user: null }, error: null })),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { is_admin: false, curriculum_access_override: false }, error: null }),
          }),
        }),
      }),
    }),
  }
})

describe('Phase 2 Middleware & Auth Security Test Suite', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('1. Privilege Escalation Guard (FIND-01): spoofed user_metadata.is_admin is not an admin', async () => {
    // The client-writable user_metadata claim is ignored: the learner login routes this
    // user to the learner dashboard like everyone else.
    const req = new NextRequest('https://prodily.app/login', {
      headers: {
        cookie: 'sb-access-token=mock-user-token',
      },
    })

    const res = await proxy(req)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://prodily.app/dashboard')
  })

  it('1b. Admin console moved: /admin passes through to a 404 when ADMIN_SITE_URL is unset', async () => {
    vi.stubEnv('ADMIN_SITE_URL', '')
    for (const path of ['/admin', '/admin/users', '/admin/login']) {
      const res = await proxy(new NextRequest(`https://prodily.app${path}`, { headers: { cookie: 'sb-access-token=mock-user-token' } }))
      // NextResponse.next(): no redirect to any login, and no route answers here, so Next 404s.
      expect(res.status, path).toBe(200)
      expect(res.headers.get('location'), path).toBeNull()
      expect(res.headers.get('x-request-id'), path).toBeTruthy()
    }
  })

  it('1c. Admin console moved: /admin 308s to ADMIN_SITE_URL with path and query kept', async () => {
    vi.stubEnv('ADMIN_SITE_URL', 'https://admin.example.com/')
    const res = await proxy(new NextRequest('https://prodily.app/admin/moderation?tab=capstones'))
    expect(res.status).toBe(308)
    expect(res.headers.get('location')).toBe('https://admin.example.com/admin/moderation?tab=capstones')

    const root = await proxy(new NextRequest('https://prodily.app/admin'))
    expect(root.status).toBe(308)
    expect(root.headers.get('location')).toBe('https://admin.example.com/admin')
  })

  it('1d. Only the /admin segment is redirected, not lookalike paths', async () => {
    vi.stubEnv('ADMIN_SITE_URL', 'https://admin.example.com')
    const res = await proxy(new NextRequest('https://prodily.app/administrator'))
    expect(res.status).not.toBe(308)
  })

  it('2. Public Route Protection: Unauthenticated visitors can view /login', async () => {
    const req = new NextRequest('https://prodily.app/login')
    const res = await proxy(req)
    expect(res).toBeDefined()
    expect(res.status).toBe(200)
  })

  it('3. App Route Protection: Unauthenticated visitors redirected from /dashboard', async () => {
    const req = new NextRequest('https://prodily.app/dashboard')
    const res = await proxy(req)
    expect(res).toBeDefined()
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
  })

  it('4. Admin Login Route: /admin/login is not served by the learner host', async () => {
    vi.stubEnv('ADMIN_SITE_URL', 'https://admin.example.com')
    const res = await proxy(new NextRequest('https://prodily.app/admin/login'))
    expect(res.status).toBe(308)
    expect(res.headers.get('location')).toBe('https://admin.example.com/admin/login')
  })

  it('5. API Route Token Extractor: getAuthenticatedUserFromRequest returns null without token', async () => {
    const req = new Request('https://prodily.app/api/streaks/timezone', {
      method: 'POST',
      body: JSON.stringify({ timezone: 'UTC' }),
    })
    const user = await getAuthenticatedUserFromRequest(req)
    expect(user).toBeNull()
  })

  it('6. Password Recovery Route: Authenticated recovery user can access /reset-password?mode=update', async () => {
    const req = new NextRequest('https://prodily.app/reset-password?mode=update', {
      headers: {
        cookie: 'sb-access-token=mock-user-token',
      },
    })
    const res = await proxy(req)
    expect(res).toBeDefined()
    expect(res.status).toBe(200)
  })

  it('7. Password Recovery Route: Unauthenticated visitor on /reset-password?mode=update redirects to expired error', async () => {
    const req = new NextRequest('https://prodily.app/reset-password?mode=update')
    const res = await proxy(req)
    expect(res).toBeDefined()
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/reset-password?error=expired')
  })

  it('8. Password Recovery Route: Authenticated user visiting standard /reset-password is routed away', async () => {
    const req = new NextRequest('https://prodily.app/reset-password', {
      headers: {
        cookie: 'sb-access-token=mock-user-token',
      },
    })
    const res = await proxy(req)
    expect(res).toBeDefined()
    expect(res.status).toBe(307)
    // Everyone, admins included, goes to the learner dashboard.
    expect(res.headers.get('location')).toContain('/dashboard')
  })

  it('9. Curriculum Route: Authenticated learner visiting /curriculum is redirected to /academy', async () => {
    const req = new NextRequest('https://prodily.app/curriculum', {
      headers: {
        cookie: 'sb-access-token=mock-user-token',
      },
    })
    const res = await proxy(req)
    expect(res).toBeDefined()
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/academy')
  })

  it('10. Curriculum Route: Unauthenticated visitor visiting /curriculum passes through to static page', async () => {
    const req = new NextRequest('https://prodily.app/curriculum')
    const res = await proxy(req)
    expect(res).toBeDefined()
    expect(res.status).toBe(200)
  })

  it('11. Public Lesson Route: Authenticated learner visiting /lessons/lesson-001 redirects to interactive academy lesson', async () => {
    const req = new NextRequest('https://prodily.app/lessons/lesson-001', {
      headers: {
        cookie: 'sb-access-token=mock-user-token',
      },
    })
    const res = await proxy(req)
    expect(res).toBeDefined()
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/academy/foundations/les_zoyq8a')
  })

  it('12. Public Lesson Route: Unauthenticated visitor visiting /lessons/lesson-001 passes through to static page', async () => {
    const req = new NextRequest('https://prodily.app/lessons/lesson-001')
    const res = await proxy(req)
    expect(res).toBeDefined()
    expect(res.status).toBe(200)
  })
})
