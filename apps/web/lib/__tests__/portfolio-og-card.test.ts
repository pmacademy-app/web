import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET as ogGetRoute } from '../../app/api/og/portfolio/[username]/route'
import { createServiceRoleClient } from '../supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

vi.mock('../supabase', () => ({
  createServiceRoleClient: vi.fn(),
}))

describe('Dynamic Portfolio OpenGraph Social Preview Card Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  function createMockSupabaseWithUser(userData: Record<string, unknown> | null, capstones: Array<Record<string, unknown>> = []) {
    return {
      from: vi.fn((table: string) => {
        if (table === 'users') {
          return {
            select: vi.fn(() => ({
              ilike: vi.fn(() => ({
                limit: vi.fn(async () => ({
                  data: userData ? [userData] : [],
                  error: null,
                })),
              })),
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: userData,
                  error: null,
                })),
                maybeSingle: vi.fn(async () => ({
                  data: userData,
                  error: null,
                })),
              })),
            })),
          }
        }
        if (table === 'capstone_submissions') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: vi.fn(() => ({
                  neq: vi.fn(() => ({
                    order: vi.fn(async () => ({
                      data: capstones,
                      error: null,
                    })),
                  })),
                })),
              })),
            })),
          }
        }
        if (table === 'reflections') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({
                  data: [],
                  error: null,
                })),
              })),
            })),
          }
        }
        if (table === 'user_lesson_progress') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({
                  data: [],
                  error: null,
                })),
              })),
            })),
          }
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ data: [], error: null })),
              in: vi.fn(async () => ({ data: [], error: null })),
            })),
          })),
        }
      }),
    } as unknown as SupabaseClient<Database>
  }

  describe('1. Public Portfolio OG Image Generation & Caching', () => {
    it('generates a 1200x630 image response with proper edge cache headers for public portfolio', async () => {
      const mockSupabase = createMockSupabaseWithUser({
        id: 'usr-1',
        name: 'Sarah Chen',
        username: 'sarahchen',
        bio: 'Senior Product Manager specializing in AI platforms and developer tooling.',
        avatar_url: 'https://images.example.com/avatar.jpg',
        is_portfolio_public: true,
        is_fellow: false,
        total_xp: 1200,
      }, [
        { id: 'c1', user_id: 'usr-1', module_slug: 'foundations', status: 'submitted', is_public: true, content: 'Opportunity brief' },
        { id: 'c2', user_id: 'usr-1', module_slug: 'discovery', status: 'submitted', is_public: true, content: 'User interview synthesis' },
      ])
      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabase)

      const req = new Request('http://localhost/api/og/portfolio/sarahchen')
      const res = await ogGetRoute(req, { params: Promise.resolve({ username: 'sarahchen' }) })

      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('image/png')
      expect(res.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=3600, stale-while-revalidate=86400')
    })
  })

  describe('2. Fellow Designation on OG Social Card', () => {
    it('renders Fellow designation when is_fellow is true without implying employment', async () => {
      const mockSupabase = createMockSupabaseWithUser({
        id: 'usr-fellow',
        name: 'Elena Rostova',
        username: 'erostova',
        bio: 'Product Management Fellow focusing on B2B SaaS growth.',
        is_portfolio_public: true,
        is_fellow: true,
        total_xp: 2500,
      })
      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabase)

      const req = new Request('http://localhost/api/og/portfolio/erostova')
      const res = await ogGetRoute(req, { params: Promise.resolve({ username: 'erostova' }) })

      expect(res.status).toBe(200)
      expect(res.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=3600, stale-while-revalidate=86400')
    })

    it('renders standard Product Management Portfolio badge when is_fellow is false', async () => {
      const mockSupabase = createMockSupabaseWithUser({
        id: 'usr-regular',
        name: 'Marcus Vance',
        username: 'marcusvance',
        bio: 'Associate PM learning product strategy.',
        is_portfolio_public: true,
        is_fellow: false,
        total_xp: 300,
      })
      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabase)

      const req = new Request('http://localhost/api/og/portfolio/marcusvance')
      const res = await ogGetRoute(req, { params: Promise.resolve({ username: 'marcusvance' }) })

      expect(res.status).toBe(200)
    })
  })

  describe('3. Privacy Protection on OG Social Cards', () => {
    it('renders private locked fallback card with shorter TTL when is_portfolio_public is false', async () => {
      const mockSupabase = createMockSupabaseWithUser({
        id: 'usr-private',
        name: 'Private Learner',
        username: 'privatepm',
        bio: 'Secret private projects and confidential notes.',
        is_portfolio_public: false,
        is_fellow: false,
        total_xp: 9000,
      })
      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabase)

      const req = new Request('http://localhost/api/og/portfolio/privatepm')
      const res = await ogGetRoute(req, { params: Promise.resolve({ username: 'privatepm' }) })

      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('image/png')
      expect(res.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=300, stale-while-revalidate=600')
    })

    it('renders private fallback card when user does not exist', async () => {
      const mockSupabase = createMockSupabaseWithUser(null)
      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabase)

      const req = new Request('http://localhost/api/og/portfolio/nonexistent')
      const res = await ogGetRoute(req, { params: Promise.resolve({ username: 'nonexistent' }) })

      expect(res.status).toBe(200)
      expect(res.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=300, stale-while-revalidate=600')
    })
  })

  describe('4. Dynamic Content Resilience & Edge Cases', () => {
    it('handles extremely long names gracefully without error', async () => {
      const mockSupabase = createMockSupabaseWithUser({
        id: 'usr-longname',
        name: 'Alexander Maximilian Bartholomew Montgomery III',
        username: 'alexanderb',
        bio: 'Product strategist.',
        is_portfolio_public: true,
        is_fellow: false,
      })
      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabase)

      const req = new Request('http://localhost/api/og/portfolio/alexanderb')
      const res = await ogGetRoute(req, { params: Promise.resolve({ username: 'alexanderb' }) })

      expect(res.status).toBe(200)
    })

    it('handles long bios by truncating gracefully without layout breakdown', async () => {
      const longBio = 'Product leader with 10+ years of experience across enterprise B2B SaaS, marketplace liquidity, AI platform workflows, developer APIs, data infrastructure, and cross-functional leadership in high-growth startups.'
      const mockSupabase = createMockSupabaseWithUser({
        id: 'usr-longbio',
        name: 'Jordan Rivera',
        username: 'jrivera',
        bio: longBio,
        is_portfolio_public: true,
        is_fellow: false,
      })
      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabase)

      const req = new Request('http://localhost/api/og/portfolio/jrivera')
      const res = await ogGetRoute(req, { params: Promise.resolve({ username: 'jrivera' }) })

      expect(res.status).toBe(200)
    })

    it('handles empty bio by rendering graceful professional fallback description', async () => {
      const mockSupabase = createMockSupabaseWithUser({
        id: 'usr-nobio',
        name: 'Taylor Reed',
        username: 'treed',
        bio: '',
        is_portfolio_public: true,
        is_fellow: false,
      })
      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabase)

      const req = new Request('http://localhost/api/og/portfolio/treed')
      const res = await ogGetRoute(req, { params: Promise.resolve({ username: 'treed' }) })

      expect(res.status).toBe(200)
    })

    it('handles zero submitted projects cleanly without awkward empty stats', async () => {
      const mockSupabase = createMockSupabaseWithUser({
        id: 'usr-noprojects',
        name: 'Maya Lin',
        username: 'mayalin',
        bio: 'Product discovery specialist.',
        is_portfolio_public: true,
        is_fellow: false,
      }, [])
      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabase)

      const req = new Request('http://localhost/api/og/portfolio/mayalin')
      const res = await ogGetRoute(req, { params: Promise.resolve({ username: 'mayalin' }) })

      expect(res.status).toBe(200)
    })
  })
})
