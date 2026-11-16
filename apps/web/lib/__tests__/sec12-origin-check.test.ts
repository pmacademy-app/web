import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { isAllowedApiOrigin, isOriginExempt } from '@/lib/security/origin-check'
import { proxy } from '../../proxy'

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: {
            id: 'mock-user-id',
            email: 'user@example.com',
            app_metadata: {},
            user_metadata: {},
            email_confirmed_at: '2026-01-01T00:00:00Z',
          },
        },
        error: null,
      })),
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
}))

describe('SEC-12: Origin Check and Same-Origin Protection for API Writes', () => {
  describe('isOriginExempt helper', () => {
    it('exempts server-to-server and one-click routes', () => {
      expect(isOriginExempt('/api/auth/send-email-hook')).toBe(true)
      expect(isOriginExempt('/api/email/webhooks')).toBe(true)
      expect(isOriginExempt('/api/email/unsubscribe')).toBe(true)
      expect(isOriginExempt('/api/cron/process-broadcasts')).toBe(true)
      expect(isOriginExempt('/api/cron/cleanup-expired-sessions')).toBe(true)
      expect(isOriginExempt('/api/settings/delete-account')).toBe(false)
      expect(isOriginExempt('/api/settings/profile')).toBe(false)
    })
  })

  describe('isAllowedApiOrigin unit checks', () => {
    it('allows read-only methods (GET, HEAD, OPTIONS) with session cookie', () => {
      const getReq = new Request('https://prodily.app/api/profile', {
        method: 'GET',
        headers: {
          cookie: 'sb-access-token=mock-token',
          origin: 'https://evil.attacker.com',
        },
      })
      expect(isAllowedApiOrigin(getReq, '/api/profile')).toBe(true)

      const headReq = new Request('https://prodily.app/api/profile', {
        method: 'HEAD',
        headers: {
          cookie: 'sb-access-token=mock-token',
          origin: 'https://evil.attacker.com',
        },
      })
      expect(isAllowedApiOrigin(headReq, '/api/profile')).toBe(true)
    })

    it('allows anonymous write requests (no session cookie present)', () => {
      const anonPost = new Request('https://prodily.app/api/auth/signup', {
        method: 'POST',
        headers: {
          origin: 'https://prodily.app',
        },
      })
      expect(isAllowedApiOrigin(anonPost, '/api/auth/signup')).toBe(true)
    })

    it('rejects cross-origin POST with session cookie and mismatched Origin', () => {
      const crossPost = new Request('https://prodily.app/api/settings/profile', {
        method: 'POST',
        headers: {
          cookie: 'sb-access-token=mock-token',
          origin: 'https://evil.attacker.com',
        },
      })
      expect(isAllowedApiOrigin(crossPost, '/api/settings/profile')).toBe(false)
    })

    it('rejects POST with Sec-Fetch-Site: cross-site', () => {
      const crossPost = new Request('https://prodily.app/api/settings/profile', {
        method: 'POST',
        headers: {
          cookie: 'sb-access-token=mock-token',
          'sec-fetch-site': 'cross-site',
          origin: 'https://prodily.app',
        },
      })
      expect(isAllowedApiOrigin(crossPost, '/api/settings/profile')).toBe(false)
    })

    it('allows POST with matching BRAND site origin', () => {
      const validPost = new Request('https://prodily.app/api/settings/profile', {
        method: 'POST',
        headers: {
          cookie: 'sb-access-token=mock-token',
          origin: 'https://prodily.app',
        },
      })
      expect(isAllowedApiOrigin(validPost, '/api/settings/profile')).toBe(true)
    })

    it('allows POST with Sec-Fetch-Site: same-origin', () => {
      const validPost = new Request('https://prodily.app/api/settings/profile', {
        method: 'POST',
        headers: {
          cookie: 'sb-access-token=mock-token',
          'sec-fetch-site': 'same-origin',
        },
      })
      expect(isAllowedApiOrigin(validPost, '/api/settings/profile')).toBe(true)
    })

    it('allows exempt server routes even with cross-origin header', () => {
      const exemptReq = new Request('https://prodily.app/api/email/webhooks', {
        method: 'POST',
        headers: {
          cookie: 'sb-access-token=mock-token',
          origin: 'https://external-service.com',
        },
      })
      expect(isAllowedApiOrigin(exemptReq, '/api/email/webhooks')).toBe(true)
    })
  })

  describe('proxy integration enforcement', () => {
    it('returns HTTP 403 with standard error envelope for cross-origin POST in proxy', async () => {
      const req = new NextRequest('https://prodily.app/api/settings/profile', {
        method: 'POST',
        headers: {
          cookie: 'sb-access-token=mock-token',
          origin: 'https://evil.attacker.com',
        },
      })

      const res = await proxy(req)
      expect(res).toBeDefined()
      expect(res.status).toBe(403)
      const data = await res.json()
      expect(data).toMatchObject({
        success: false,
        code: 'FORBIDDEN',
        error: 'Cross-origin request forbidden.',
      })
    })

    it('allows same-origin POST with session cookie through proxy', async () => {
      const req = new NextRequest('https://prodily.app/api/settings/profile', {
        method: 'POST',
        headers: {
          cookie: 'sb-access-token=mock-token',
          origin: 'https://prodily.app',
        },
      })

      const res = await proxy(req)
      expect(res).toBeDefined()
      // Should not be 403 Forbidden
      expect(res.status).not.toBe(403)
    })
  })
})
