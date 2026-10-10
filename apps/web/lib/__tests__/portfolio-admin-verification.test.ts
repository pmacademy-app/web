import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { createServiceRoleClient } from '@/lib/supabase'

// Mock guard and logger
const mockRequireAdminUser = vi.fn()
const mockLogAdminAction = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/admin/guard', () => ({
  requireAdminUser: (req: Request) => mockRequireAdminUser(req),
  logAdminAction: (
    adminId: string,
    email: string,
    action: string,
    target: string,
    id?: string,
    details?: Record<string, unknown>
  ) => mockLogAdminAction(adminId, email, action, target, id, details),
}))

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: vi.fn(),
  createAuthenticatedServerClient: vi.fn(),
}))

// A grant now dispatches `fellow.granted`; keep the real dispatcher/connectors (which would
// write in-app rows and queue email through the mocked client) out of these route tests.
// The event itself is covered by fellow-granted-event.test.ts.
const mockDispatch = vi.fn(async (event: unknown) => {
  void event
  return { dispatched: true, handlerCount: 0, errors: [] as unknown[] }
})
vi.mock('@/lib/notifications/dispatcher', () => ({
  globalNotificationDispatcher: { dispatch: (e: unknown) => mockDispatch(e) },
}))
vi.mock('@/lib/notifications/events/connectors', () => ({
  initializeNotificationConnectors: vi.fn(),
}))

// Import route handlers
import { POST as fellowStatusPost } from '../../app/api/admin/users/[id]/fellow-status/route'

describe('Admin Portfolio Verification & Queue Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('1. Security & Admin Authorization Checks', () => {
    it('rejects unauthenticated requests with 401', async () => {
      mockRequireAdminUser.mockResolvedValueOnce({
        authorized: false,
        error: 'Authentication required',
        statusCode: 401,
      })

      const req = new NextRequest('http://localhost:3000/api/admin/users/usr-1/fellow-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFellow: true }),
      })

      const res = await fellowStatusPost(req, { params: Promise.resolve({ id: 'usr-1' }) })
      expect(res.status).toBe(401)
      const json = await res.json()
      // B7-G2: denials now use the wrapper's canonical, non-enumerating copy — a
      // refusal must not tell the caller which check refused it. The status code is
      // the contract that matters here and is unchanged.
      expect(json.code).toBe('UNAUTHORIZED')
      expect(json.error).toBe('Authentication required.')
    })

    it('rejects non-admin user requests with 403', async () => {
      mockRequireAdminUser.mockResolvedValueOnce({
        authorized: false,
        error: 'Access denied: Admin privileges required',
        statusCode: 403,
      })

      const req = new NextRequest('http://localhost:3000/api/admin/users/usr-1/fellow-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFellow: true }),
      })

      const res = await fellowStatusPost(req, { params: Promise.resolve({ id: 'usr-1' }) })
      expect(res.status).toBe(403)
      const json = await res.json()
      // B7-G2: see the note above — the guard's specific reason is deliberately no
      // longer published. It is still recorded in the denial audit row.
      expect(json.code).toBe('FORBIDDEN')
      expect(json.error).toBe('You do not have permission to perform this action.')
    })

    it('rejects requests with missing or non-boolean isFellow with 400', async () => {
      mockRequireAdminUser.mockResolvedValueOnce({
        authorized: true,
        userId: 'admin-1',
        email: 'admin@prodily.co',
      })

      const req = new NextRequest('http://localhost:3000/api/admin/users/usr-1/fellow-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFellow: 'invalid-string' }),
      })

      const res = await fellowStatusPost(req, { params: Promise.resolve({ id: 'usr-1' }) })
      expect(res.status).toBe(400)
    })
  })

  describe('2. Public vs Private Portfolio Invariant Enforcement', () => {
    it('allows verifying a user with a public portfolio (is_portfolio_public = true)', async () => {
      mockRequireAdminUser.mockResolvedValueOnce({
        authorized: true,
        userId: 'admin-1',
        email: 'admin@prodily.co',
      })

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'users') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: { id: 'usr-pub', username: 'publicpm', is_portfolio_public: true },
                    error: null,
                  })),
                })),
              })),
              // A grant is conditional: update → eq('id') → eq('is_fellow', false) → select('id').
              update: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    select: vi.fn(async () => ({ data: [{ id: 'usr-pub' }], error: null })),
                  })),
                })),
              })),
            }
          }
          return {}
        }),
      } as unknown as SupabaseClient<Database>
      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabase)

      const req = new NextRequest('http://localhost:3000/api/admin/users/usr-pub/fellow-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFellow: true }),
      })

      const res = await fellowStatusPost(req, { params: Promise.resolve({ id: 'usr-pub' }) })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
      expect(json.isFellow).toBe(true)
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        'admin-1',
        'admin@prodily.co',
        'grant_fellow_status',
        'user',
        'usr-pub',
        { isFellow: true }
      )
    })

    it('strictly REJECTS verifying a user with a private portfolio (is_portfolio_public = false) with 400', async () => {
      mockRequireAdminUser.mockResolvedValueOnce({
        authorized: true,
        userId: 'admin-1',
        email: 'admin@prodily.co',
      })

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'users') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: { id: 'usr-priv', username: 'privatepm', is_portfolio_public: false },
                    error: null,
                  })),
                })),
              })),
              update: vi.fn(() => ({
                eq: vi.fn(async () => ({ error: null })),
              })),
            }
          }
          return {}
        }),
      } as unknown as SupabaseClient<Database>
      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabase)

      const req = new NextRequest('http://localhost:3000/api/admin/users/usr-priv/fellow-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFellow: true }),
      })

      const res = await fellowStatusPost(req, { params: Promise.resolve({ id: 'usr-priv' }) })
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toContain('Cannot verify a private portfolio')
    })

    it('allows unverifying a verified portfolio (isFellow = false) even if user later made portfolio private', async () => {
      mockRequireAdminUser.mockResolvedValueOnce({
        authorized: true,
        userId: 'admin-1',
        email: 'admin@prodily.co',
      })

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'users') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: { id: 'usr-rev', username: 'revokepm', is_portfolio_public: false },
                    error: null,
                  })),
                })),
              })),
              update: vi.fn(() => ({
                eq: vi.fn(async () => ({ error: null })),
              })),
            }
          }
          return {}
        }),
      } as unknown as SupabaseClient<Database>
      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabase)

      const req = new NextRequest('http://localhost:3000/api/admin/users/usr-rev/fellow-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFellow: false }),
      })

      const res = await fellowStatusPost(req, { params: Promise.resolve({ id: 'usr-rev' }) })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
      expect(json.isFellow).toBe(false)
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        'admin-1',
        'admin@prodily.co',
        'revoke_fellow_status',
        'user',
        'usr-rev',
        { isFellow: false }
      )
    })
  })
})
