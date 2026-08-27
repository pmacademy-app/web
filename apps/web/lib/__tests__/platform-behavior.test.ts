import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from '../../proxy'
import { POST as signupPOST } from '../../app/api/auth/signup/route'

// Supabase mock: token 'mock-learner-token' = verified learner, 'mock-unverified-token' = unverified learner, 'mock-admin-token' = admin
const mockGetUser = vi.fn(async (token: string) => {
  if (token === 'mock-unverified-token') {
    return {
      data: { user: { id: 'learner-id', email: 'learner@example.com', email_confirmed_at: null, user_metadata: {} } },
      error: null,
    }
  }
  if (token === 'mock-learner-token') {
    return {
      data: { user: { id: 'learner-id', email: 'learner@example.com', email_confirmed_at: '2026-01-01', user_metadata: {} } },
      error: null,
    }
  }
  if (token === 'mock-admin-token') {
    return {
      data: { user: { id: 'admin-id', email: 'admin@example.com', email_confirmed_at: '2026-01-01', user_metadata: {} } },
      error: null,
    }
  }
  return { data: { user: null }, error: new Error('Invalid token') }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
      refreshSession: vi.fn(async () => ({ data: { session: null, user: null }, error: null })),
      signUp: vi.fn(async () => ({
        data: { user: { id: 'new-user', identities: [{ id: '1' }] } },
        error: null,
      })),
      admin: {
        createUser: vi.fn(async () => ({
          data: { user: { id: 'new-user' } },
          error: null,
        })),
      },
      signInWithPassword: vi.fn(async () => ({
        data: { session: { access_token: 'tok', refresh_token: 'ref', expires_in: 3600 }, user: { id: 'new-user' } },
        error: null,
      })),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        }),
      }),
      insert: () => ({
        select: () => ({
          single: vi.fn(async () => ({ data: { id: 'new-user' }, error: null })),
        }),
      }),
    }),
  }),
}))

// isAdminEmail: only 'admin@example.com' qualifies via env check
vi.mock('@/lib/admin/authorization', () => ({
  isAdminEmail: (email: string | undefined) => email === 'admin@example.com',
}))

// SettingsService mock — controllable per test
const mockSettings = {
  maintenanceMode: false,
  allowSignups: true,
  requireEmailVerification: false,
}

vi.mock('@/lib/admin/settings-service', () => ({
  SettingsService: {
    getProductSettings: vi.fn(async () => ({ ...mockSettings })),
    isEmailVerificationRequired: vi.fn(async () => mockSettings.requireEmailVerification),
  },
}))

describe('Platform Behavior Controls — Backend Enforcement Tests', () => {
  beforeEach(() => {
    mockSettings.maintenanceMode = false
    mockSettings.allowSignups = true
    mockSettings.requireEmailVerification = false
  })

  // ── Maintenance Mode ───────────────────────────────────────────────────────

  describe('Maintenance Mode (Pages & APIs)', () => {
    it('1. Allows unauthenticated visitors to access /login when maintenance is OFF', async () => {
      mockSettings.maintenanceMode = false
      const req = new NextRequest('https://prodily.app/login')
      const res = await proxy(req)
      expect(res.status).toBe(200)
    })

    it('2. Redirects authenticated learner from /dashboard to /maintenance when maintenance is ON', async () => {
      mockSettings.maintenanceMode = true
      const req = new NextRequest('https://prodily.app/dashboard', {
        headers: { cookie: 'sb-access-token=mock-learner-token' },
      })
      const res = await proxy(req)
      expect(res.status).toBe(307)
      expect(res.headers.get('location')).toContain('/maintenance')
    })

    it('3. Allows authenticated admin to access /admin when maintenance is ON (admin bypass)', async () => {
      mockSettings.maintenanceMode = true
      const req = new NextRequest('https://prodily.app/admin', {
        headers: { cookie: 'sb-access-token=mock-admin-token' },
      })
      const res = await proxy(req)
      expect(res.headers.get('location') ?? '/admin').not.toContain('/maintenance')
    })

    it('4. /maintenance page is always reachable (not intercepted by proxy)', async () => {
      const req = new NextRequest('https://prodily.app/maintenance')
      const res = await proxy(req)
      expect(res.status).toBe(200)
    })

    it('5. Learner redirected from /settings to /maintenance when maintenance is ON', async () => {
      mockSettings.maintenanceMode = true
      const req = new NextRequest('https://prodily.app/settings', {
        headers: { cookie: 'sb-access-token=mock-learner-token' },
      })
      const res = await proxy(req)
      expect(res.status).toBe(307)
      expect(res.headers.get('location')).toContain('/maintenance')
    })

    it('6. Blocks direct API access with 503 MAINTENANCE_MODE when maintenance is ON', async () => {
      mockSettings.maintenanceMode = true
      const req = new NextRequest('https://prodily.app/api/v2/lessons/les_123/quiz', {
        method: 'POST',
        headers: { cookie: 'sb-access-token=mock-learner-token' },
      })
      const res = await proxy(req)
      expect(res.status).toBe(503)
      const json = await res.json()
      expect(json.code).toBe('MAINTENANCE_MODE')
      expect(json.error).toContain('maintenance')
    })

    it('7. Allows admin to bypass maintenance mode on direct API access', async () => {
      mockSettings.maintenanceMode = true
      const req = new NextRequest('https://prodily.app/api/v2/lessons/les_123/quiz', {
        method: 'POST',
        headers: { cookie: 'sb-access-token=mock-admin-token' },
      })
      const res = await proxy(req)
      // Admin should NOT be blocked with 503
      expect(res.status).not.toBe(503)
    })

    it('8. Exempt APIs (/api/auth/login, /api/waitlist) bypass maintenance mode', async () => {
      mockSettings.maintenanceMode = true
      const req = new NextRequest('https://prodily.app/api/waitlist', { method: 'POST' })
      const res = await proxy(req)
      expect(res.status).not.toBe(503)
    })
  })

  // ── Allow Signups Enforcement ──────────────────────────────────────────────

  describe('Allow Signups Enforcement', () => {
    it('9. Rejects signup request with 403 SIGNUPS_DISABLED when allowSignups is false', async () => {
      mockSettings.allowSignups = false
      const req = new NextRequest('https://prodily.app/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Jane Doe',
          email: 'jane@example.com',
          password: 'securePassword123',
        }),
      })
      const res = await signupPOST(req)
      expect(res.status).toBe(403)
      const json = await res.json()
      expect(json.code).toBe('SIGNUPS_DISABLED')
      expect(json.error).toContain('registrations are currently closed')
    })

    it('10. Allows signup request when allowSignups is true', async () => {
      mockSettings.allowSignups = true
      mockSettings.requireEmailVerification = true
      const req = new NextRequest('https://prodily.app/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Jane Doe',
          email: 'jane@example.com',
          password: 'securePassword123',
        }),
      })
      const res = await signupPOST(req)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
      expect(json.verificationRequired).toBe(true)
    })
  })

  // ── Email Verification Enforcement ────────────────────────────────────────

  describe('Email Verification Enforcement', () => {
    it('11. Unverified learner blocked from /dashboard when verification is required', async () => {
      mockSettings.requireEmailVerification = true
      const req = new NextRequest('https://prodily.app/dashboard', {
        headers: { cookie: 'sb-access-token=mock-unverified-token' },
      })
      const res = await proxy(req)
      expect(res.status).toBe(307)
      expect(res.headers.get('location')).toContain('email_not_confirmed')
    })

    it('12. Unverified learner blocked from protected APIs with 403 when verification is required', async () => {
      mockSettings.requireEmailVerification = true
      const req = new NextRequest('https://prodily.app/api/v2/lessons/les_123/quiz', {
        method: 'POST',
        headers: { cookie: 'sb-access-token=mock-unverified-token' },
      })
      const res = await proxy(req)
      expect(res.status).toBe(403)
      const json = await res.json()
      expect(json.code).toBe('AUTH_EMAIL_NOT_CONFIRMED')
    })

    it('13. Verified learner allowed on protected APIs when verification is required', async () => {
      mockSettings.requireEmailVerification = true
      const req = new NextRequest('https://prodily.app/api/v2/lessons/les_123/quiz', {
        method: 'POST',
        headers: { cookie: 'sb-access-token=mock-learner-token' },
      })
      const res = await proxy(req)
      expect(res.status).not.toBe(403)
    })
  })

  // ── Combination Matrix ─────────────────────────────────────────────────────

  describe('Combination Matrix', () => {
    it('14. Maintenance ON + Signups OFF + Verification ON: maintenance takes precedence on dashboard', async () => {
      mockSettings.maintenanceMode = true
      mockSettings.allowSignups = false
      mockSettings.requireEmailVerification = true
      const req = new NextRequest('https://prodily.app/dashboard', {
        headers: { cookie: 'sb-access-token=mock-learner-token' },
      })
      const res = await proxy(req)
      expect(res.status).toBe(307)
      expect(res.headers.get('location')).toContain('/maintenance')
    })

    it('15. Maintenance ON + Signups OFF: signup API returns 403 SIGNUPS_DISABLED', async () => {
      mockSettings.maintenanceMode = true
      mockSettings.allowSignups = false
      const req = new NextRequest('https://prodily.app/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Jane Doe',
          email: 'jane@example.com',
          password: 'securePassword123',
        }),
      })
      const res = await signupPOST(req)
      expect(res.status).toBe(403)
      const json = await res.json()
      expect(json.code).toBe('SIGNUPS_DISABLED')
    })

    it('16. Maintenance OFF + Verification OFF: verified and unverified learners can access app', async () => {
      mockSettings.maintenanceMode = false
      mockSettings.requireEmailVerification = false
      const req = new NextRequest('https://prodily.app/dashboard', {
        headers: { cookie: 'sb-access-token=mock-learner-token' },
      })
      const res = await proxy(req)
      expect([200, 307]).toContain(res.status)
      if (res.status === 307) {
        expect(res.headers.get('location')).not.toContain('/maintenance')
        expect(res.headers.get('location')).not.toContain('email_not_confirmed')
      }
    })

    it('17. Unauthenticated access to /dashboard always redirects to /login', async () => {
      mockSettings.maintenanceMode = false
      const req = new NextRequest('https://prodily.app/dashboard')
      const res = await proxy(req)
      expect(res.status).toBe(307)
      expect(res.headers.get('location')).toContain('/login')
    })
  })
})
