import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generatePersonJsonLd } from '../portfolio'
import { LEVEL_THRESHOLDS } from '../xp'
import { generateMetadata } from '@/app/(portfolio)/p/[username]/page'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// Mock Supabase service role client
vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: vi.fn(),
}))

import { createServiceRoleClient } from '@/lib/supabase'

describe('Unit 1: Portfolio Credibility & Copy Accuracy Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function createMockSupabaseWithUser(userOverrides: Record<string, unknown> = {}, capstones: Array<Record<string, unknown>> = []) {
    const user = {
      id: 'usr-credibility-1',
      username: 'pmcandidate',
      name: 'Sarah Chen',
      bio: 'Product manager specializing in growth and retention loops.',
      avatar_url: null,
      linkedin_url: 'https://linkedin.com/in/sarahchen',
      github_url: 'https://github.com/sarahchen',
      website_url: 'https://sarahchen.dev',
      is_portfolio_public: true,
      portfolio_layout: ['hero', 'capstones', 'radar', 'achievements', 'progress'],
      featured_capstone_id: null,
      portfolio_view_count: 10,
      total_xp: 8500, // Level 7 -> 'Chief Product Officer' in gamification
      current_streak: 14,
      longest_streak: 21,
      ...userOverrides,
    }

    return {
      from: vi.fn((table: string) => {
        if (table === 'users') {
          return {
            select: vi.fn(() => ({
              ilike: vi.fn(() => ({
                limit: vi.fn(async () => ({
                  data: [user],
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
                    })),
                  })),
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
                  data: [{ lesson_id: 'lesson-1', status: 'completed' }],
                })),
              })),
            })),
          }
        }
        if (table === 'reflections') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({ data: [] })),
              })),
            })),
          }
        }
        if (table === 'user_radar_skills') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(async () => ({ data: [] })),
            })),
          }
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: [] })),
          })),
        }
      }),
      rpc: vi.fn(async () => ({ error: null })),
    } as unknown as SupabaseClient<Database>
  }

  describe('1. Schema.org Person JSON-LD Credibility & Accuracy', () => {
    it('does not emit worksFor organization object', () => {
      const jsonLd = generatePersonJsonLd({
        name: 'Sarah Chen',
        username: 'sarahchen',
        bio: 'Product Manager building SaaS.',
        siteOrigin: 'https://prodily.adityagangwani.me',
      })

      expect(jsonLd.worksFor).toBeUndefined()
      expect('worksFor' in jsonLd).toBe(false)
    })

    it('does not emit gamification level title as real professional jobTitle', () => {
      const jsonLd = generatePersonJsonLd({
        name: 'Sarah Chen',
        username: 'sarahchen',
        title: 'Chief Product Officer',
        bio: 'Product Manager building SaaS.',
        siteOrigin: 'https://prodily.adityagangwani.me',
      })

      expect(jsonLd.jobTitle).toBeUndefined()
      expect('jobTitle' in jsonLd).toBe(false)
    })

    it('does not contain misleading verified claims in description fallback', () => {
      const jsonLd = generatePersonJsonLd({
        name: 'Sarah Chen',
        username: 'sarahchen',
        bio: null,
        siteOrigin: 'https://prodily.adityagangwani.me',
      })

      expect(typeof jsonLd.description).toBe('string')
      expect((jsonLd.description as string).toLowerCase()).not.toContain('verified')
    })
  })

  describe('2. Public Portfolio Metadata Credibility (generateMetadata)', () => {
    it('does not interpolate XP-derived titles (e.g. Chief Product Officer, Senior PM) into meta description', async () => {
      const mockSupabase = createMockSupabaseWithUser({
        total_xp: 8500, // Level 7: 'Chief Product Officer' in gamification
        bio: 'Focused on platform product strategy.',
      })
      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabase)

      const metadata = await generateMetadata({ params: Promise.resolve({ username: 'pmcandidate' }) })

      expect(metadata.description).toBeDefined()
      const desc = metadata.description as string

      // Must NOT contain any professional job title from LEVEL_THRESHOLDS
      for (const threshold of LEVEL_THRESHOLDS) {
        // Exclude general short terms like 'PM' substring checks, check full titles
        if (threshold.title !== 'PM') {
          expect(desc).not.toContain(threshold.title)
        }
      }
      expect(desc).not.toContain('Chief Product Officer')
      expect(desc).not.toContain('VP Product')
      expect(desc).not.toContain('Senior PM')
      expect(desc).toContain('Focused on platform product strategy.')
    })

    it('removes unconditional verified claims from fallback meta description when bio is empty', async () => {
      const mockSupabase = createMockSupabaseWithUser({
        bio: null,
        total_xp: 500,
      })
      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabase)

      const metadata = await generateMetadata({ params: Promise.resolve({ username: 'pmcandidate' }) })
      const desc = metadata.description as string

      expect(desc).toContain("Explore Sarah Chen's Product Management portfolio")
      expect(desc.toLowerCase()).not.toContain('verified product management portfolio')
    })

    it('removes verified claim from OpenGraph image alt text', async () => {
      const mockSupabase = createMockSupabaseWithUser()
      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabase)

      const metadata = await generateMetadata({ params: Promise.resolve({ username: 'pmcandidate' }) })
      const ogImages = metadata.openGraph?.images as Array<{ alt?: string }>

      expect(ogImages).toBeDefined()
      expect(ogImages.length).toBeGreaterThan(0)
      expect(ogImages[0].alt).toBe('Sarah Chen — Product Portfolio')
      expect(ogImages[0].alt?.toLowerCase()).not.toContain('verified')
    })

    it('generates Fellow-specific title and meta description when user is designated as Fellow', async () => {
      const mockSupabase = createMockSupabaseWithUser({
        is_fellow: true,
        bio: 'Product Management Fellow focusing on fintech platform strategy.',
        total_xp: 4200,
      })
      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabase)

      const metadata = await generateMetadata({ params: Promise.resolve({ username: 'pmcandidate' }) })

      expect(metadata.title).toBe('Sarah Chen — Product Management Fellow at Prodily | Portfolio')
      const desc = metadata.description as string
      expect(desc).toContain('Sarah Chen — Product Management Fellow at Prodily')
      expect(desc).toContain('Product Management Fellow focusing on fintech platform strategy.')
    })

    it('generates standard non-fellow title and description when is_fellow is false', async () => {
      const mockSupabase = createMockSupabaseWithUser({
        is_fellow: false,
        bio: 'Product Manager building workflow software.',
        total_xp: 1200,
      })
      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabase)

      const metadata = await generateMetadata({ params: Promise.resolve({ username: 'pmcandidate' }) })

      expect(metadata.title).toBe('Sarah Chen — Product Portfolio')
      const desc = metadata.description as string
      expect(desc).not.toContain('Product Management Fellow')
      expect(desc).toContain("Sarah Chen's Product Management portfolio and applied capstones")
      expect(desc).toContain('Product Manager building workflow software.')
    })
  })

  describe('3. Capstone Status Differentiation Logic', () => {
    it('accurately preserves reviewed vs submitted statuses for presentation layer', async () => {
      const mockSubmissions = [
        {
          id: 'cap-reviewed',
          user_id: 'usr-credibility-1',
          module_slug: 'foundations',
          status: 'reviewed',
          content: 'Full opportunity brief deliverable.',
          is_public: true,
          submitted_at: '2026-08-15T12:00:00Z',
        },
        {
          id: 'cap-submitted',
          user_id: 'usr-credibility-1',
          module_slug: 'discovery',
          status: 'submitted',
          content: 'User interview synthesis deliverable.',
          is_public: true,
          submitted_at: '2026-08-20T12:00:00Z',
        },
      ]

      const mockSupabase = createMockSupabaseWithUser({}, mockSubmissions)
      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabase)

      const { getPublicPortfolioData } = await import('../portfolio-db')
      const data = await getPublicPortfolioData(mockSupabase, 'pmcandidate')

      expect(data).not.toBeNull()
      expect(data?.capstones.length).toBe(2)

      const reviewedCap = data?.capstones.find((c) => c.id === 'cap-reviewed')
      const submittedCap = data?.capstones.find((c) => c.id === 'cap-submitted')

      expect(reviewedCap?.status).toBe('reviewed')
      expect(submittedCap?.status).toBe('submitted')
    })
  })
})
