import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from '../../proxy'
import { getAuthenticatedUserFromRequest } from '../auth'

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
