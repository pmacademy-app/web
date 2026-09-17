import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { proxy } from '../../proxy'
import { POST as sessionPost, GET as sessionGet } from '../../app/api/auth/session/route'
import { POST as refreshPost } from '../../app/api/auth/refresh/route'
import { POST as logoutPost } from '../../app/api/auth/logout/route'
import { getAuthenticatedUserFromRequest } from '../auth'
import { requireAdminUser } from '../admin/guard'

// In-memory mock tokens & sessions
const VALID_LEARNER_TOKEN = 'mock-valid-learner-jwt'
const VALID_ADMIN_TOKEN = 'mock-valid-admin-jwt'
const EXPIRED_TOKEN = 'mock-expired-jwt'
const FORGED_ADMIN_TOKEN = 'mock-forged-admin-jwt'
const TAMPERED_TOKEN = 'mock-tampered-token'

const VALID_LEARNER_REFRESH = 'valid-learner-refresh-token'
const ATTACKER_REFRESH = 'attacker-refresh-token'
const INVALID_REFRESH = 'invalid-refresh-token'

const mockUsers: Record<string, { id: string; email: string; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown>; email_confirmed_at?: string }> = {
  [VALID_LEARNER_TOKEN]: {
    id: 'usr_learner_1',
    email: 'learner@example.com',
    app_metadata: { provider: 'email' },
    user_metadata: { onboarding_complete: true, full_name: 'Learner One' },
    email_confirmed_at: '2026-01-01T00:00:00Z',
  },
  [VALID_ADMIN_TOKEN]: {
    id: 'usr_admin_1',
    email: 'admin@prodily.app',
    app_metadata: { is_admin: true },
    user_metadata: { onboarding_complete: true, full_name: 'Admin One' },
    email_confirmed_at: '2026-01-01T00:00:00Z',
  },
}

vi.mock('@supabase/supabase-js', () => {
  return {
    createClient: (_url: string, _key: string, options?: { global?: { headers?: { Authorization?: string } } }) => {
      const authHeader = options?.global?.headers?.Authorization
      const headerToken = authHeader?.replace('Bearer ', '')

      return {
        auth: {
          getUser: vi.fn(async (passedToken?: string) => {
            const token = passedToken || headerToken
            if (token && mockUsers[token]) {
              return { data: { user: mockUsers[token] }, error: null }
            }
            return { data: { user: null }, error: new Error('Invalid or expired token') }
          }),
          refreshSession: vi.fn(async ({ refresh_token }: { refresh_token: string }) => {
            if (refresh_token === VALID_LEARNER_REFRESH) {
              return {
                data: {
                  session: {
                    access_token: VALID_LEARNER_TOKEN,
                    refresh_token: 'rotated-learner-refresh-token',
                    expires_in: 3600,
                  },
                  user: mockUsers[VALID_LEARNER_TOKEN],
                },
                error: null,
              }
            }
            if (refresh_token === ATTACKER_REFRESH) {
              return {
                data: {
                  session: {
                    access_token: 'attacker-access-token',
                    refresh_token: 'rotated-attacker-refresh',
                    expires_in: 3600,
                  },
                  user: { id: 'attacker-uuid', email: 'attacker@evil.com' },
                },
                error: null,
              }
            }
            return { data: { session: null, user: null }, error: new Error('Invalid refresh token') }
          }),
          signOut: vi.fn(async () => ({ error: null })),
        },
        from: (_table: string) => ({
          select: () => ({
            eq: (_col: string, val: string) => ({
              maybeSingle: async () => {
                if (val === 'usr_admin_1') {
                  return { data: { is_admin: true, email: 'admin@prodily.app' }, error: null }
                }
                return { data: { is_admin: false, email: 'learner@example.com' }, error: null }
              },
              single: async () => {
                if (val === 'usr_admin_1') {
                  return { data: { is_admin: true, email: 'admin@prodily.app' }, error: null }
                }
                return { data: { is_admin: false, email: 'learner@example.com' }, error: null }
              },
            }),
          }),
          insert: vi.fn(async () => ({ data: null, error: null })),
        }),
      }
    },
  }
})

describe('Batch B3: Authentication & Session Hardening Test Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('Invariant 1: Middleware Cryptographic Verification & Anti-Spoofing', () => {
    it('1. Valid authenticated session -> allowed into protected learner route', async () => {
      const req = new NextRequest('https://prodily.app/dashboard', {
        headers: {
          cookie: `sb-access-token=${VALID_LEARNER_TOKEN}`,
        },
      })
      const res = await proxy(req)
      expect(res.status).toBe(200)
    })

    it('2. Expired session -> rejected and redirected to /login', async () => {
      const req = new NextRequest('https://prodily.app/dashboard', {
        headers: {
          cookie: `sb-access-token=${EXPIRED_TOKEN}`,
        },
      })
      const res = await proxy(req)
      expect(res.status).toBe(307)
      expect(res.headers.get('location')).toContain('/login')
    })

    it('3. Invalid / tampered JWT -> rejected', async () => {
      const req = new NextRequest('https://prodily.app/dashboard', {
        headers: {
          cookie: `sb-access-token=${TAMPERED_TOKEN}`,
        },
      })
      const res = await proxy(req)
      expect(res.status).toBe(307)
      expect(res.headers.get('location')).toContain('/login')
    })

    it('4. Attacker-crafted JWT with forged admin claim -> rejected by GoTrue verification', async () => {
      // Attacker attempts to access /admin with a forged unverified JWT claiming is_admin: true
      const req = new NextRequest('https://prodily.app/admin', {
        headers: {
          cookie: `sb-access-token=${FORGED_ADMIN_TOKEN}`,
        },
      })
      const res = await proxy(req)
      // Because getUser rejects FORGED_ADMIN_TOKEN, user is null and visitor is sent to admin login
      expect(res.status).toBe(307)
      expect(res.headers.get('location')).toContain('/admin/login')
    })

    it('5. Missing session cookie -> redirected to /login on protected route', async () => {
      const req = new NextRequest('https://prodily.app/dashboard')
      const res = await proxy(req)
      expect(res.status).toBe(307)
      expect(res.headers.get('location')).toContain('/login')
    })

    it('6. Expired access token with valid refresh token -> transparently refreshed', async () => {
      const req = new NextRequest('https://prodily.app/dashboard', {
        headers: {
          cookie: `sb-access-token=${EXPIRED_TOKEN}; sb-refresh-token=${VALID_LEARNER_REFRESH}`,
        },
      })
      const res = await proxy(req)
      expect(res.status).toBe(200)
      // Rotated cookies should be attached to response
      expect(res.cookies.get('sb-access-token')?.value).toBe(VALID_LEARNER_TOKEN)
      expect(res.cookies.get('sb-refresh-token')?.value).toBe('rotated-learner-refresh-token')
    })
  })

  describe('Invariant 2: /api/auth/session is sign-out only (B13-A)', () => {
    /**
     * Tests 7–11 used to exercise the client session bridge: the browser held a
     * Supabase session, posted it here, and the route verified the access token,
     * cross-checked the refresh token against the same user (anti-fixation), and wrote
     * the cookies. B13-A removed that ingest path entirely, so those tests no longer
     * describe behaviour this route has.
     *
     * The anti-fixation property they protected is now structural rather than checked:
     * a session cannot be fixed through an endpoint that does not accept one. The tests
     * below pin exactly that — a session in the body is inert — plus the sign-out
     * behaviour that replaced it.
     */

    it('7. A session in the body establishes nothing — the ingest path is gone', async () => {
      const req = new NextRequest('https://prodily.app/api/auth/session', {
        method: 'POST',
        body: JSON.stringify({
          session: {
            access_token: VALID_LEARNER_TOKEN,
            refresh_token: VALID_LEARNER_REFRESH,
            expires_in: 3600,
          },
        }),
      })
      const res = (await sessionPost(req)) as NextResponse

      expect(res.status).toBe(200)
      // The supplied token is never written back as a cookie; the route signs out.
      expect(res.cookies.get('sb-access-token')?.value).toBe('')
      expect(res.cookies.get('sb-refresh-token')?.value).toBe('')
    })

    it('8. An attacker-controlled session cannot be fixed onto the browser', async () => {
      const req = new NextRequest('https://prodily.app/api/auth/session', {
        method: 'POST',
        body: JSON.stringify({
          session: { access_token: VALID_LEARNER_TOKEN, refresh_token: ATTACKER_REFRESH },
        }),
      })
      const res = (await sessionPost(req)) as NextResponse

      expect(res.cookies.get('sb-access-token')?.value).not.toBe(VALID_LEARNER_TOKEN)
      expect(res.cookies.get('sb-refresh-token')?.value).not.toBe(ATTACKER_REFRESH)
      expect(res.cookies.get('sb-refresh-token')?.value).not.toBe('rotated-attacker-refresh')
    })

    it('9. Sign-out clears both session cookies', async () => {
      const req = new NextRequest('https://prodily.app/api/auth/session', {
        method: 'POST',
        body: JSON.stringify({ action: 'sign_out' }),
        headers: { cookie: `sb-refresh-token=${VALID_LEARNER_REFRESH}` },
      })
      const res = (await sessionPost(req)) as NextResponse

      expect(res.status).toBe(200)
      expect(res.cookies.get('sb-access-token')?.value).toBe('')
      expect(res.cookies.get('sb-refresh-token')?.value).toBe('')
      // An empty value with a non-positive max-age is what actually removes the
      // cookie; asserting the value alone would pass on a cookie that still lives.
      expect(res.cookies.get('sb-access-token')?.maxAge ?? 0).toBeLessThanOrEqual(0)
      expect(res.cookies.get('sb-refresh-token')?.maxAge ?? 0).toBeLessThanOrEqual(0)
    })

    it('10. Sign-out revokes the refresh token at the provider when one is present', async () => {
      const req = new NextRequest('https://prodily.app/api/auth/session', {
        method: 'POST',
        body: JSON.stringify({ action: 'sign_out' }),
        headers: { cookie: `sb-refresh-token=${VALID_LEARNER_REFRESH}` },
      })
      const res = await sessionPost(req)
      const data = await res.json()

      // Reported rather than silent: a cleared cookie with a live refresh token behind
      // it is a different outcome from a clean logout, and the caller can surface it.
      expect(data.revocation).toBe('revoked')
    })

    it('11. Sign-out succeeds with no cookies at all, and reports nothing to revoke', async () => {
      const req = new NextRequest('https://prodily.app/api/auth/session', {
        method: 'POST',
        body: JSON.stringify({ action: 'sign_out' }),
      })
      const res = (await sessionPost(req)) as NextResponse
      const data = await res.json()

      // Signing out must work when the access token has already expired — which is
      // exactly when a learner is most likely to be clicking it.
      expect(res.status).toBe(200)
      expect(data.revocation).toBe('skipped')
      expect(res.cookies.get('sb-access-token')?.value).toBe('')
    })

    it('12. GET /api/auth/session returns user identity for active session', async () => {
      const req = new NextRequest('https://prodily.app/api/auth/session', {
        headers: {
          cookie: `sb-access-token=${VALID_LEARNER_TOKEN}`,
        },
      })
      const res = await sessionGet(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.authenticated).toBe(true)
      expect(data.user.id).toBe('usr_learner_1')
      expect(data.user.email).toBe('learner@example.com')
      expect(data.user.full_name).toBe('Learner One')
    })

    it('13. GET /api/auth/session returns authenticated: false when unauthenticated', async () => {
      const req = new NextRequest('https://prodily.app/api/auth/session')
      const res = await sessionGet(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.authenticated).toBe(false)
      expect(data.user).toBeNull()
    })
  })

  describe('Invariant 3: Refresh Token Flow & Rotation', () => {
    it('14. POST /api/auth/refresh without token returns 400', async () => {
      const req = new NextRequest('https://prodily.app/api/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({}),
      })
      const res = await refreshPost(req)
      expect(res.status).toBe(400)
    })

    it('15. POST /api/auth/refresh with invalid token returns 401 and clears cookies', async () => {
      const req = new NextRequest('https://prodily.app/api/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: INVALID_REFRESH }),
      })
      const res = (await refreshPost(req)) as NextResponse
      expect(res.status).toBe(401)
      expect(res.cookies.get('sb-access-token')?.value).toBe('')
      expect(res.cookies.get('sb-refresh-token')?.value).toBe('')
    })

    it('16. POST /api/auth/refresh with valid token returns new session and rotated cookies', async () => {
      const req = new NextRequest('https://prodily.app/api/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: VALID_LEARNER_REFRESH }),
      })
      const res = (await refreshPost(req)) as NextResponse
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      // B13-A / F-SEC-8: a browser caller gets the rotated pair as httpOnly cookies and
      // nothing readable. The body carries no `session` key at all — not an empty one,
      // so there is no token for a script to find.
      expect(data.session).toBeUndefined()
      expect(res.cookies.get('sb-access-token')?.value).toBe(VALID_LEARNER_TOKEN)
      expect(res.cookies.get('sb-refresh-token')?.value).toBe('rotated-learner-refresh-token')
    })
  })

  describe('Invariant 5: Logout & Session Invalidation', () => {
    it('17. POST /api/auth/logout clears session cookies', async () => {
      const req = new NextRequest('https://prodily.app/api/auth/logout', {
        method: 'POST',
        headers: {
          cookie: `sb-access-token=${VALID_LEARNER_TOKEN}; sb-refresh-token=${VALID_LEARNER_REFRESH}`,
        },
      })
      // B7-D: the route now returns through withRoute, whose declared return type
      // is the wider `Response`. The runtime value is still the NextResponse the
      // handler built, so the assertions below are unchanged — only the type is
      // narrowed for them.
      const res = (await logoutPost(req)) as NextResponse
      expect(res.status).toBe(200)
      expect(res.cookies.get('sb-access-token')?.value).toBe('')
      expect(res.cookies.get('sb-refresh-token')?.value).toBe('')
    })

    it('18. POST /api/auth/session with action: sign_out clears session cookies', async () => {
      const req = new NextRequest('https://prodily.app/api/auth/session', {
        method: 'POST',
        body: JSON.stringify({ action: 'sign_out' }),
      })
      const res = (await sessionPost(req)) as NextResponse
      expect(res.status).toBe(200)
      expect(res.cookies.get('sb-access-token')?.value).toBe('')
      expect(res.cookies.get('sb-refresh-token')?.value).toBe('')
    })
  })

  describe('Invariant 6: Authenticated Route Helpers & Admin Guard', () => {
    it('19. getAuthenticatedUserFromRequest resolves user from Bearer header', async () => {
      const req = new Request('https://prodily.app/api/profile', {
        headers: {
          Authorization: `Bearer ${VALID_LEARNER_TOKEN}`,
        },
      })
      const user = await getAuthenticatedUserFromRequest(req)
      expect(user).not.toBeNull()
      expect(user?.id).toBe('usr_learner_1')
    })

    it('20. getAuthenticatedUserFromRequest rejects invalid / forged token', async () => {
      const req = new Request('https://prodily.app/api/profile', {
        headers: {
          Authorization: `Bearer ${TAMPERED_TOKEN}`,
        },
      })
      const user = await getAuthenticatedUserFromRequest(req)
      expect(user).toBeNull()
    })

    it('21. requireAdminUser rejects non-admin learner even with valid session', async () => {
      const req = new Request('https://prodily.app/api/admin/settings', {
        headers: {
          Authorization: `Bearer ${VALID_LEARNER_TOKEN}`,
        },
      })
      const result = await requireAdminUser(req)
      expect(result.authorized).toBe(false)
      expect(result.statusCode).toBe(403)
    })

    it('22. requireAdminUser grants access to verified admin', async () => {
      const req = new Request('https://prodily.app/api/admin/settings', {
        headers: {
          Authorization: `Bearer ${VALID_ADMIN_TOKEN}`,
        },
      })
      const result = await requireAdminUser(req)
      expect(result.authorized).toBe(true)
      expect(result.userId).toBe('usr_admin_1')
    })
  })
})
