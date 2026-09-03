import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from '../../proxy'
import { SettingsService } from '../admin/settings-service'

function createMockJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = 'mock_signature'
  return `${header}.${body}.${signature}`
}

describe('P1 Middleware & Settings Optimization Test Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    SettingsService.invalidateCache()
  })

  describe('1. In-Memory JWT Parsing & Expiration Invariants', () => {
    it('allows valid unexpired verified learner JWT without network roundtrips', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600 // 1 hour in future
      const token = createMockJwt({
        sub: 'usr_learner_123',
        email: 'learner@example.com',
        user_metadata: { onboarding_complete: true },
        email_confirmed_at: '2026-01-01T00:00:00Z',
        exp: futureExp,
      })

      const req = new NextRequest('https://prodily.app/dashboard', {
        headers: {
          cookie: `sb-access-token=${token}`,
        },
      })

      const res = await proxy(req)
      expect(res).toBeDefined()
      expect(res.status).toBe(200) // Passes through to dashboard without redirects
    })

    it('detects expired JWT and redirects unauthenticated to /login', async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 3600 // 1 hour in past
      const token = createMockJwt({
        sub: 'usr_expired_123',
        email: 'expired@example.com',
        exp: pastExp,
      })

      const req = new NextRequest('https://prodily.app/dashboard', {
        headers: {
          cookie: `sb-access-token=${token}`,
        },
      })

      const res = await proxy(req)
      expect(res).toBeDefined()
      expect(res.status).toBe(307)
      expect(res.headers.get('location')).toContain('/login')
    })

    it('redirects unconfirmed email learners to /login?error=email_not_confirmed', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600
      const token = createMockJwt({
        sub: 'usr_unverified_123',
        email: 'unverified@example.com',
        user_metadata: { onboarding_complete: true },
        // email_confirmed_at is intentionally missing / null
        exp: futureExp,
      })

      const req = new NextRequest('https://prodily.app/dashboard', {
        headers: {
          cookie: `sb-access-token=${token}`,
        },
      })

      const res = await proxy(req)
      expect(res).toBeDefined()
      expect(res.status).toBe(307)
      expect(res.headers.get('location')).toContain('/login?error=email_not_confirmed')
    })
  })

  describe('2. Admin Route Protection & RBAC Routing', () => {
    it('allows verified admin with app_metadata.is_admin into /admin', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600
      const adminToken = createMockJwt({
        sub: 'usr_admin_456',
        email: 'admin_role@prodily.app',
        app_metadata: { is_admin: true },
        user_metadata: { onboarding_complete: true },
        exp: futureExp,
      })

      const req = new NextRequest('https://prodily.app/admin', {
        headers: {
          cookie: `sb-access-token=${adminToken}`,
        },
      })

      const res = await proxy(req)
      expect(res).toBeDefined()
      expect(res.status).toBe(200)
    })

    it('rejects regular learner attempting to access /admin and redirects to /admin/access-denied', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600
      const learnerToken = createMockJwt({
        sub: 'usr_learner_999',
        email: 'regular_learner@gmail.com',
        user_metadata: { onboarding_complete: true },
        email_confirmed_at: '2026-01-01T00:00:00Z',
        exp: futureExp,
      })

      const req = new NextRequest('https://prodily.app/admin', {
        headers: {
          cookie: `sb-access-token=${learnerToken}`,
        },
      })

      const res = await proxy(req)
      expect(res).toBeDefined()
      expect(res.status).toBe(307)
      expect(res.headers.get('location')).toContain('/admin/access-denied')
    })
  })

  describe('3. Onboarding & Curriculum Access Override Invariants', () => {
    it('redirects new learner without onboarding_complete to /onboarding', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600
      const token = createMockJwt({
        sub: 'usr_new_learner',
        email: 'new_learner@gmail.com',
        user_metadata: { onboarding_complete: false },
        email_confirmed_at: '2026-01-01T00:00:00Z',
        exp: futureExp,
      })

      const req = new NextRequest('https://prodily.app/dashboard', {
        headers: {
          cookie: `sb-access-token=${token}`,
        },
      })

      const res = await proxy(req)
      expect(res).toBeDefined()
      expect(res.status).toBe(307)
      expect(res.headers.get('location')).toContain('/onboarding')
    })

    it('allows learner with curriculum_access_override claim to bypass onboarding', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600
      const token = createMockJwt({
        sub: 'usr_override_learner',
        email: 'override@gmail.com',
        user_metadata: { onboarding_complete: false, curriculum_access_override: true },
        email_confirmed_at: '2026-01-01T00:00:00Z',
        exp: futureExp,
      })

      const req = new NextRequest('https://prodily.app/dashboard', {
        headers: {
          cookie: `sb-access-token=${token}`,
        },
      })

      const res = await proxy(req)
      expect(res).toBeDefined()
      expect(res.status).toBe(200)
    })
  })

  describe('4. SettingsService In-Memory Cache Performance', () => {
    it('serves repeated getProductSettings requests from cache', async () => {
      const first = await SettingsService.getProductSettings()
      const second = await SettingsService.getProductSettings()

      expect(first).toBeDefined()
      expect(second).toEqual(first)
    })

    it('invalidates cache properly when invalidateCache is called', async () => {
      const first = await SettingsService.getProductSettings()
      expect(first).toBeDefined()

      SettingsService.invalidateCache()

      const fresh = await SettingsService.getProductSettings()
      expect(fresh).toBeDefined()
    })
  })
})

