import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getPublicPortfolioData, updatePortfolioSettings } from '../portfolio-db'
import { generatePersonJsonLd } from '../portfolio'
import { AdminConsoleService } from '../admin/service'

// Spy on guard and audit log
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

// Import route handlers
import { POST as fellowStatusPost, PATCH as fellowStatusPatch } from '../../app/api/admin/users/[id]/fellow-status/route'
import { POST as adminUserActionPost } from '../../app/api/admin/users/[id]/route'

describe('Unit 2: Fellow Identity & Admin Control Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  describe('1. Fellow Identity in Public Portfolio Data Layer', () => {
    it('defaults isFellow to false for regular users where is_fellow is false or null', async () => {
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'users') {
            return {
              select: vi.fn(() => ({
                ilike: vi.fn(() => ({
                  limit: vi.fn(async () => ({
                    data: [
                      {
                        id: 'usr-regular',
                        username: 'regularuser',
                        name: 'Regular Learner',
                        bio: 'Aspiring PM',
                        is_portfolio_public: true,
                        is_fellow: false,
                        total_xp: 400,
                      },
                    ],
                    error: null,
                  })),
                })),
              })),
            }
          }
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({ data: [] })),
                in: vi.fn(() => ({
                  neq: vi.fn(() => ({
                    order: vi.fn(async () => ({ data: [] })),
                  })),
                })),
              })),
            })),
          }
        }),
        rpc: vi.fn(async () => ({ error: null })),
      } as unknown as SupabaseClient<Database>

      const result = await getPublicPortfolioData(mockSupabase, 'regularuser')
      expect(result).not.toBeNull()
      expect(result?.user.isFellow).toBe(false)
    })

    it('accurately surfaces isFellow = true for designated fellow users', async () => {
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'users') {
            return {
              select: vi.fn(() => ({
                ilike: vi.fn(() => ({
                  limit: vi.fn(async () => ({
                    data: [
                      {
                        id: 'usr-fellow',
                        username: 'pmfellow',
                        name: 'Elena Rostova',
                        bio: 'Product Management Fellow focusing on AI products.',
                        is_portfolio_public: true,
                        is_fellow: true,
                        total_xp: 2400,
                      },
                    ],
                    error: null,
                  })),
                })),
              })),
            }
          }
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({ data: [] })),
                in: vi.fn(() => ({
                  neq: vi.fn(() => ({
                    order: vi.fn(async () => ({ data: [] })),
                  })),
                })),
              })),
            })),
          }
        }),
        rpc: vi.fn(async () => ({ error: null })),
      } as unknown as SupabaseClient<Database>

      const result = await getPublicPortfolioData(mockSupabase, 'pmfellow')
      expect(result).not.toBeNull()
      expect(result?.user.isFellow).toBe(true)
      expect(result?.user.name).toBe('Elena Rostova')
    })
  })

  describe('2. Person Schema JSON-LD Credibility & Fellow Designation', () => {
    it('sets jobTitle to "Product Management Fellow" when isFellow is true without adding worksFor', () => {
      const jsonLd = generatePersonJsonLd({
        name: 'Marcus Vance',
        username: 'mvance',
        bio: 'Product Management Fellow at Prodily.',
        siteOrigin: 'https://prodily.co',
        isFellow: true,
      })

      expect(jsonLd['@context']).toBe('https://schema.org')
      expect(jsonLd['@type']).toBe('Person')
      expect(jsonLd.name).toBe('Marcus Vance')
      expect(jsonLd.jobTitle).toBe('Product Management Fellow')
      expect(jsonLd.worksFor).toBeUndefined() // Invariant: Fellow != Employee
    })

    it('omits jobTitle entirely for non-fellows without adding worksFor', () => {
      const jsonLd = generatePersonJsonLd({
        name: 'Jordan Rivera',
        username: 'jrivera',
        bio: 'Learner studying product discovery.',
        siteOrigin: 'https://prodily.co',
        isFellow: false,
      })

      expect(jsonLd.name).toBe('Jordan Rivera')
      expect(jsonLd.jobTitle).toBeUndefined()
      expect(jsonLd.worksFor).toBeUndefined()
    })
  })

  describe('3. Settings API Isolation & Security Invariant', () => {
    it('never includes is_fellow in updatePortfolioSettings database payload even if malicious request body contains it', async () => {
      let interceptedPayload: Record<string, unknown> | null = null

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'users') {
            return {
              select: vi.fn(() => ({
                ilike: vi.fn(() => ({
                  neq: vi.fn(() => ({
                    limit: vi.fn(async () => ({ data: [], error: null })),
                  })),
                })),
              })),
              update: vi.fn((payload: Record<string, unknown>) => {
                interceptedPayload = payload
                return {
                  eq: vi.fn(async () => ({ error: null })),
                }
              }),
            }
          }
          return {}
        }),
      } as unknown as SupabaseClient<Database>

      // Attempt to sneak is_fellow / isFellow through the learner settings updater
      const maliciousData = {
        username: 'sneakyuser',
        name: 'Sneaky User',
        bio: 'Attempting to self-assign fellow status',
        avatarUrl: '',
        linkedinUrl: '',
        githubUrl: '',
        websiteUrl: '',
        isPortfolioPublic: true,
        isFellow: true,
        is_fellow: true,
      }

      await updatePortfolioSettings(mockSupabase, 'usr-123', maliciousData as unknown as Parameters<typeof updatePortfolioSettings>[2])

      expect(interceptedPayload).not.toBeNull()
      expect(interceptedPayload).not.toHaveProperty('is_fellow')
      expect(interceptedPayload).not.toHaveProperty('isFellow')
      expect((interceptedPayload as unknown as Record<string, unknown>)?.username).toBe('sneakyuser')
    })
  })

  describe('4. Admin-Only Control & API Authorization', () => {
    it('rejects unauthenticated requests to fellow-status route with 401', async () => {
      mockRequireAdminUser.mockResolvedValueOnce({
        authorized: false,
        error: 'Authentication required',
        statusCode: 401,
      })

      const req = new NextRequest('http://localhost:3000/api/admin/users/usr-target/fellow-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFellow: true }),
      })

      const res = await fellowStatusPost(req, { params: Promise.resolve({ id: 'usr-target' }) })
      expect(res.status).toBe(401)
      const data = await res.json()
      expect(data.error).toBe('Authentication required')
    })

    it('rejects non-admin requests to fellow-status route with 403', async () => {
      mockRequireAdminUser.mockResolvedValueOnce({
        authorized: false,
        error: 'Access denied: Admin privileges required',
        statusCode: 403,
      })

      const req = new NextRequest('http://localhost:3000/api/admin/users/usr-target/fellow-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFellow: true }),
      })

      const res = await fellowStatusPost(req, { params: Promise.resolve({ id: 'usr-target' }) })
      expect(res.status).toBe(403)
      const data = await res.json()
      expect(data.error).toContain('Admin privileges required')
    })

    it('rejects invalid or missing isFellow payload with 400', async () => {
      mockRequireAdminUser.mockResolvedValueOnce({
        authorized: true,
        userId: 'admin-1',
        email: 'admin@prodily.co',
      })

      const req = new NextRequest('http://localhost:3000/api/admin/users/usr-target/fellow-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFellow: 'not-a-boolean' }),
      })

      const res = await fellowStatusPost(req, { params: Promise.resolve({ id: 'usr-target' }) })
      expect(res.status).toBe(400)
    })

    it('allows admin to grant Fellow status and logs audit entry', async () => {
      mockRequireAdminUser.mockResolvedValueOnce({
        authorized: true,
        userId: 'admin-1',
        email: 'admin@prodily.co',
      })

      const toggleSpy = vi.spyOn(AdminConsoleService, 'toggleUserFellowStatus').mockResolvedValueOnce(true)

      const req = new NextRequest('http://localhost:3000/api/admin/users/usr-target/fellow-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFellow: true }),
      })

      const res = await fellowStatusPost(req, { params: Promise.resolve({ id: 'usr-target' }) })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
      expect(json.targetUserId).toBe('usr-target')
      expect(json.isFellow).toBe(true)

      expect(toggleSpy).toHaveBeenCalledWith('usr-target', true)
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        'admin-1',
        'admin@prodily.co',
        'grant_fellow_status',
        'user',
        'usr-target',
        { isFellow: true }
      )
    })

    it('allows admin to revoke Fellow status and logs audit entry', async () => {
      mockRequireAdminUser.mockResolvedValueOnce({
        authorized: true,
        userId: 'admin-1',
        email: 'admin@prodily.co',
      })

      const toggleSpy = vi.spyOn(AdminConsoleService, 'toggleUserFellowStatus').mockResolvedValueOnce(true)

      const req = new NextRequest('http://localhost:3000/api/admin/users/usr-target/fellow-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFellow: false }),
      })

      const res = await fellowStatusPatch(req, { params: Promise.resolve({ id: 'usr-target' }) })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
      expect(json.isFellow).toBe(false)

      expect(toggleSpy).toHaveBeenCalledWith('usr-target', false)
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        'admin-1',
        'admin@prodily.co',
        'revoke_fellow_status',
        'user',
        'usr-target',
        { isFellow: false }
      )
    })

    it('supports set_fellow_status action through main admin users [id] POST endpoint', async () => {
      mockRequireAdminUser.mockResolvedValueOnce({
        authorized: true,
        userId: 'admin-1',
        email: 'admin@prodily.co',
      })

      const toggleSpy = vi.spyOn(AdminConsoleService, 'toggleUserFellowStatus').mockResolvedValueOnce(true)

      const req = new NextRequest('http://localhost:3000/api/admin/users/usr-target', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_fellow_status', isFellow: true }),
      })

      const res = await adminUserActionPost(req, { params: Promise.resolve({ id: 'usr-target' }) })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
      expect(json.isFellow).toBe(true)
      expect(toggleSpy).toHaveBeenCalledWith('usr-target', true)
    })
  })
})
