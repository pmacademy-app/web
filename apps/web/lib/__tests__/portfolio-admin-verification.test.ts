import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { ModerationService } from '@/lib/admin/moderation-service'
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
      expect(json.error).toBe('Authentication required')
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
      expect(json.error).toContain('Admin privileges required')
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
              update: vi.fn(() => ({
                eq: vi.fn(async () => ({ error: null })),
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

  describe('3. ModerationService.getPortfolios Data Aggregation', () => {
    it('returns only public portfolios enriched with capstone counts, bio, and fellow status', async () => {
      const mockUsers = [
        {
          id: 'u-1',
          name: 'Sarah Chen',
          username: 'sarahc',
          email: 'sarah@example.com',
          avatar_url: 'https://example.com/avatar1.jpg',
          bio: 'Platform Product Manager with 5 years experience.',
          is_fellow: false,
          is_portfolio_public: true,
          created_at: '2026-08-01T00:00:00Z',
        },
        {
          id: 'u-2',
          name: 'Alex Mercer',
          username: 'alexm',
          email: 'alex@example.com',
          avatar_url: null,
          bio: 'Aspiring PM focused on growth.',
          is_fellow: true,
          is_portfolio_public: true,
          created_at: '2026-08-05T00:00:00Z',
        },
      ]

      const mockCapstones = [
        { user_id: 'u-1' },
        { user_id: 'u-1' },
        { user_id: 'u-2' },
      ]

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'users') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(() => ({
                    range: vi.fn(async () => ({ data: mockUsers, error: null })),
                  })),
                })),
              })),
            }
          }
          if (table === 'capstone_submissions') {
            return {
              select: vi.fn(() => ({
                in: vi.fn(() => ({
                  in: vi.fn(() => ({
                    neq: vi.fn(async () => ({ data: mockCapstones, error: null })),
                  })),
                })),
              })),
            }
          }
          return {}
        }),
      } as unknown as SupabaseClient<Database>
      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabase)

      const result = await ModerationService.getPortfolios()
      expect(result.failed).toBe(false)
      expect(result.portfolios).toHaveLength(2)

      // First portfolio (Pending Verification)
      expect(result.portfolios[0].userId).toBe('u-1')
      expect(result.portfolios[0].learnerName).toBe('Sarah Chen')
      expect(result.portfolios[0].username).toBe('sarahc')
      expect(result.portfolios[0].email).toBe('sarah@example.com')
      expect(result.portfolios[0].isFellow).toBe(false)
      expect(result.portfolios[0].capstoneCount).toBe(2)

      // Second portfolio (Verified Fellow)
      expect(result.portfolios[1].userId).toBe('u-2')
      expect(result.portfolios[1].learnerName).toBe('Alex Mercer')
      expect(result.portfolios[1].username).toBe('alexm')
      expect(result.portfolios[1].isFellow).toBe(true)
      expect(result.portfolios[1].capstoneCount).toBe(1)
    })
  })
})
