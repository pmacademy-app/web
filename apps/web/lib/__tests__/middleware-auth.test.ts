import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from '../../proxy'
import { getAuthenticatedUserFromRequest } from '../auth'

vi.mock('@supabase/supabase-js', () => {
  return {
    createClient: () => ({
      auth: {
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
  it('1. Privilege Escalation Guard (FIND-01): Reject spoofed user_metadata.is_admin', async () => {
    const req = new NextRequest('https://prodily.app/admin', {
      headers: {
        cookie: 'sb-access-token=mock-user-token',
      },
    })

    const res = await proxy(req)
    expect(res).toBeDefined()
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/admin/access-denied')
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

  it('4. Admin Login Route: Visitors can view /admin/login', async () => {
    const req = new NextRequest('https://prodily.app/admin/login')
    const res = await proxy(req)
    expect(res).toBeDefined()
    expect(res.status).toBe(200)
  })

  it('5. API Route Token Extractor: getAuthenticatedUserFromRequest returns null without token', async () => {
    const req = new Request('https://prodily.app/api/streaks/timezone', {
      method: 'POST',
      body: JSON.stringify({ timezone: 'UTC' }),
    })
    const user = await getAuthenticatedUserFromRequest(req)
    expect(user).toBeNull()
  })
})
