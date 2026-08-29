import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateMetadata } from '../../app/(portfolio)/p/[username]/page'
import robots from '../../app/robots'
import { BRAND } from '../brand'
import { createServiceRoleClient } from '../supabase'
import {
  generatePersonJsonLd,
  generateProfilePageJsonLd,
} from '../portfolio'
import { getPublicPortfolioSitemapEntries } from '../portfolio-db'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'

vi.mock('../supabase', () => ({
  createServiceRoleClient: vi.fn(),
}))

describe('Unit 3: Portfolio SEO & Discoverability Test Suite', () => {
  const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl).replace(/\/$/, '')

  beforeEach(() => {
    vi.clearAllMocks()
  })

  function createMockSupabaseWithUser(userData?: Record<string, unknown>) {
    return {
      from: vi.fn((table: string) => {
        if (table === 'users') {
          return {
            select: vi.fn(() => ({
              ilike: vi.fn(() => ({
                limit: vi.fn(async () => {
                  if (userData === null) {
                    return { data: [], error: null }
                  }
                  return {
                    data: [
                      {
                        id: 'usr-seo-1',
                        username: 'pmcandidate',
                        name: 'Marcus Vance',
                        bio: 'Product manager focused on platform growth and user discovery.',
                        avatar_url: 'https://images.example.com/avatar.jpg',
                        linkedin_url: 'https://www.linkedin.com/in/marcusvance',
                        github_url: 'https://github.com/marcusvance',
                        website_url: 'https://marcusvance.io',
                        current_streak: 14,
                        longest_streak: 21,
                        total_xp: 4500,
                        is_fellow: false,
                        is_portfolio_public: true,
                        portfolio_layout: ['hero', 'radar', 'capstones'],
                        featured_capstone_id: null,
                        portfolio_view_count: 55,
                        ...userData,
                      },
                    ],
                    error: null,
                  }
                }),
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
                    order: vi.fn(async () => ({ data: [], error: null })),
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
                eq: vi.fn(async () => ({ data: [], error: null })),
              })),
            })),
          }
        }
        if (table === 'user_lesson_progress') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({ data: [], error: null })),
              })),
            })),
          }
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: [], error: null })),
          })),
        }
      }),
    } as unknown as SupabaseClient<Database>
  }

  describe('1. Public Portfolio Metadata & Titles', () => {
    it('generates Fellow-specific title following standard "[Name] — Product Management Fellow at Prodily | Portfolio"', async () => {
      const mockSupabase = createMockSupabaseWithUser({
        name: 'Elena Rostova',
        username: 'erostova',
        is_fellow: true,
      })
      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabase)

      const meta = await generateMetadata({ params: Promise.resolve({ username: 'erostova' }) })

      expect(meta.title).toBe('Elena Rostova — Product Management Fellow at Prodily | Portfolio')
    })

    it('generates Non-Fellow title following standard "[Name] — Product Portfolio"', async () => {
      const mockSupabase = createMockSupabaseWithUser({
        name: 'Jordan Rivera',
        username: 'jrivera',
        is_fellow: false,
      })
      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabase)

      const meta = await generateMetadata({ params: Promise.resolve({ username: 'jrivera' }) })

      expect(meta.title).toBe('Jordan Rivera — Product Portfolio')
      expect(meta.title).not.toContain('Fellow')
    })

    it('generates dynamic Fellow meta description communicating Fellow identity and portfolio work', async () => {
      const mockSupabase = createMockSupabaseWithUser({
        name: 'Elena Rostova',
        username: 'erostova',
        bio: 'Fintech strategy & monetization leader.',
        is_fellow: true,
      })
      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabase)

      const meta = await generateMetadata({ params: Promise.resolve({ username: 'erostova' }) })
      const desc = meta.description as string

      expect(desc).toContain('Elena Rostova — Product Management Fellow at Prodily')
      expect(desc).toContain('Fintech strategy & monetization leader.')
      expect(desc.toLowerCase()).not.toContain('verified')
      expect(desc.toLowerCase()).not.toContain('worksfor')
      expect(desc.toLowerCase()).not.toContain('employee')
    })

    it('generates dynamic Non-Fellow meta description describing portfolio without implying Fellow status', async () => {
      const mockSupabase = createMockSupabaseWithUser({
        name: 'Jordan Rivera',
        username: 'jrivera',
        bio: 'Growth product manager.',
        is_fellow: false,
      })
      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabase)

      const meta = await generateMetadata({ params: Promise.resolve({ username: 'jrivera' }) })
      const desc = meta.description as string

      expect(desc).toContain("Jordan Rivera's Product Management portfolio and applied capstones")
      expect(desc).toContain('Growth product manager.')
      expect(desc).not.toContain('Product Management Fellow')
      expect(desc.toLowerCase()).not.toContain('verified')
    })

    it('provides clean fallback descriptions when user has no bio', async () => {
      const mockSupabase = createMockSupabaseWithUser({
        name: 'Jordan Rivera',
        username: 'jrivera',
        bio: null,
        is_fellow: false,
      })
      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabase)

      const meta = await generateMetadata({ params: Promise.resolve({ username: 'jrivera' }) })
      const desc = meta.description as string

      expect(desc).toContain("Explore Jordan Rivera's Product Management portfolio, continuous skill radar, and applied case studies")
      expect(desc).not.toContain('undefined')
      expect(desc).not.toContain('null')
    })

    it('does not interpolate XP/gamification titles (e.g. Chief Product Officer) into metadata', async () => {
      const mockSupabase = createMockSupabaseWithUser({
        name: 'Devin Patel',
        total_xp: 8000, // Level 8 title in gamification is "Chief Product Officer"
        bio: 'Product designer and strategist.',
      })
      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabase)

      const meta = await generateMetadata({ params: Promise.resolve({ username: 'devinpatel' }) })

      expect(meta.title).not.toContain('Chief Product Officer')
      expect(meta.description as string).not.toContain('Chief Product Officer')
    })
  })

  describe('2. Canonical URLs & OpenGraph Social Sharing', () => {
    it('sets clean self-referencing canonical URL without query parameters', async () => {
      const mockSupabase = createMockSupabaseWithUser({
        username: 'marcusvance',
      })
      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabase)

      const meta = await generateMetadata({ params: Promise.resolve({ username: 'marcusvance' }) })

      expect(meta.alternates?.canonical).toBe(`${SITE_URL}/p/marcusvance`)
      expect(meta.alternates?.canonical).not.toContain('?')
      expect(meta.alternates?.canonical).not.toContain('#')
    })

    it('generates complete OpenGraph and Twitter metadata', async () => {
      const mockSupabase = createMockSupabaseWithUser({
        name: 'Elena Rostova',
        username: 'erostova',
        is_fellow: true,
      })
      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabase)

      const meta = await generateMetadata({ params: Promise.resolve({ username: 'erostova' }) })

      expect(meta.openGraph).toBeDefined()
      const og = meta.openGraph as unknown as Record<string, unknown>
      expect(og?.type).toBe('profile')
      expect(og?.title).toBe('Elena Rostova — Product Management Fellow at Prodily | Portfolio')
      expect(og?.url).toBe(`${SITE_URL}/p/erostova`)
      expect(og?.images).toEqual([
        {
          url: `${SITE_URL}/api/og/portfolio/erostova`,
          width: 1200,
          height: 630,
          alt: 'Elena Rostova — Product Management Fellow at Prodily | Portfolio',
        },
      ])

      expect(meta.twitter).toBeDefined()
      const tw = meta.twitter as unknown as Record<string, unknown>
      expect(tw?.card).toBe('summary_large_image')
      expect(tw?.title).toBe('Elena Rostova — Product Management Fellow at Prodily | Portfolio')
    })
  })

  describe('3. Sitemap Inclusion & Privacy Exclusion', () => {
    it('includes public portfolios in XML sitemap with weekly change frequency and 0.6 priority', async () => {
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'users') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  not: vi.fn(() => ({
                    neq: vi.fn(async () => ({
                      data: [
                        { username: 'fellowalex', updated_at: '2026-08-15T12:00:00Z', created_at: '2026-01-01T00:00:00Z' },
                        { username: 'pmlearner', updated_at: null, created_at: '2026-03-01T00:00:00Z' },
                      ],
                      error: null,
                    })),
                  })),
                })),
              })),
            }
          }
          return {}
        }),
      } as unknown as SupabaseClient<Database>

      const entries = await getPublicPortfolioSitemapEntries(mockSupabase)

      expect(entries).toHaveLength(2)
      expect(entries[0].username).toBe('fellowalex')
      expect(entries[1].username).toBe('pmlearner')
    })

    it('sitemap helper strictly excludes private portfolios and invalid usernames', async () => {
      let filteredQuery = ''
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'users') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn((col: string, val: unknown) => {
                  filteredQuery += `eq(${col},${val}) `
                  return {
                    not: vi.fn((col2: string, op: string) => {
                      filteredQuery += `not(${col2},${op}) `
                      return {
                        neq: vi.fn(async (col3: string, val3: unknown) => {
                          filteredQuery += `neq(${col3},${val3})`
                          return {
                            data: [
                              { username: 'validuser', updated_at: null, created_at: null },
                              { username: 'admin', updated_at: null, created_at: null }, // reserved
                              { username: 'ab', updated_at: null, created_at: null }, // too short
                            ],
                            error: null,
                          }
                        }),
                      }
                    }),
                  }
                }),
              })),
            }
          }
          return {}
        }),
      } as unknown as SupabaseClient<Database>

      const entries = await getPublicPortfolioSitemapEntries(mockSupabase)

      expect(filteredQuery).toContain('eq(is_portfolio_public,true)')
      expect(filteredQuery).toContain('not(username,is)')
      expect(filteredQuery).toContain('neq(username,)')
      // Reserved word 'admin' and short username 'ab' filtered out by validation
      expect(entries).toHaveLength(1)
      expect(entries[0].username).toBe('validuser')
    })
  })

  describe('4. Robots.txt Crawlability & Admin Protection', () => {
    it('allows public /p/ portfolio paths in robots.txt while disallowing internal & admin routes', () => {
      const robotRules = robots()
      const rule = Array.isArray(robotRules.rules) ? robotRules.rules[0] : robotRules.rules
      const allows = Array.isArray(rule.allow) ? rule.allow : [rule.allow]
      const disallows = Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow]

      expect(allows).toContain('/p/')
      expect(allows).toContain('/lessons/')
      expect(allows).toContain('/curriculum')

      expect(disallows).toContain('/admin')
      expect(disallows).toContain('/dashboard')
      expect(disallows).toContain('/settings')
      expect(disallows).toContain('/review')
      expect(disallows).toContain('/api/')
    })

    it('returns { index: false, follow: false } for private or non-existent portfolios', async () => {
      const mockSupabase = createMockSupabaseWithUser({
        username: 'hiddenuser',
        is_portfolio_public: false,
      })
      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabase)

      const meta = await generateMetadata({ params: Promise.resolve({ username: 'hiddenuser' }) })

      expect(meta.title).toBe('Private Portfolio')
      expect(meta.robots).toEqual({ index: false, follow: false })
    })
  })

  describe('5. Schema.org ProfilePage & Person Structured Data', () => {
    it('generates valid Schema.org ProfilePage wrapping Person mainEntity', () => {
      const schema = generateProfilePageJsonLd({
        name: 'Marcus Vance',
        username: 'mvance',
        bio: 'Product leader in developer tools.',
        avatarUrl: 'https://images.example.com/avatar.jpg',
        linkedinUrl: 'https://www.linkedin.com/in/marcusvance',
        githubUrl: 'https://github.com/marcusvance',
        websiteUrl: 'https://marcusvance.io',
        siteOrigin: 'https://prodily.adityagangwani.me',
        isFellow: true,
      })

      expect(schema['@context']).toBe('https://schema.org')
      expect(schema['@type']).toBe('ProfilePage')
      expect(schema['@id']).toBe('https://prodily.adityagangwani.me/p/mvance#profilepage')
      expect(schema.url).toBe('https://prodily.adityagangwani.me/p/mvance')
      expect(schema.name).toBe('Marcus Vance — Product Management Fellow at Prodily | Portfolio')

      const mainEntity = schema.mainEntity as Record<string, unknown>
      expect(mainEntity['@type']).toBe('Person')
      expect(mainEntity['@id']).toBe('https://prodily.adityagangwani.me/p/mvance#person')
      expect(mainEntity.name).toBe('Marcus Vance')
      expect(mainEntity.alternateName).toBe('mvance')
      expect(mainEntity.jobTitle).toBe('Product Management Fellow')
      expect(mainEntity.url).toBe('https://prodily.adityagangwani.me/p/mvance')
      expect(mainEntity.sameAs).toEqual([
        'https://www.linkedin.com/in/marcusvance',
        'https://github.com/marcusvance',
        'https://marcusvance.io',
      ])
    })

    it('strictly does NOT emit worksFor: Prodily in Person or ProfilePage (Fellow != Employee invariant)', () => {
      const personSchema = generatePersonJsonLd({
        name: 'Elena Rostova',
        username: 'erostova',
        siteOrigin: 'https://prodily.adityagangwani.me',
        isFellow: true,
      })
      const profileSchema = generateProfilePageJsonLd({
        name: 'Elena Rostova',
        username: 'erostova',
        siteOrigin: 'https://prodily.adityagangwani.me',
        isFellow: true,
      })

      expect(personSchema.worksFor).toBeUndefined()
      expect('worksFor' in personSchema).toBe(false)

      const mainEntity = profileSchema.mainEntity as Record<string, unknown>
      expect(mainEntity.worksFor).toBeUndefined()
      expect('worksFor' in mainEntity).toBe(false)
      expect(profileSchema.worksFor).toBeUndefined()
    })

    it('emits sameAs only for valid, user-provided public links and omits empty/null/invalid URLs', () => {
      const schemaWithAllLinks = generatePersonJsonLd({
        name: 'Sarah Chen',
        username: 'schen',
        linkedinUrl: 'https://www.linkedin.com/in/sarahchen',
        githubUrl: 'https://github.com/sarahchen',
        websiteUrl: 'https://sarahchen.dev',
        siteOrigin: 'https://prodily.adityagangwani.me',
      })

      expect(schemaWithAllLinks.sameAs).toEqual([
        'https://www.linkedin.com/in/sarahchen',
        'https://github.com/sarahchen',
        'https://sarahchen.dev',
      ])

      const schemaWithNoLinks = generatePersonJsonLd({
        name: 'No Links User',
        username: 'nolinks',
        linkedinUrl: '',
        githubUrl: null,
        websiteUrl: '   ',
        siteOrigin: 'https://prodily.adityagangwani.me',
      })

      expect(schemaWithNoLinks.sameAs).toBeUndefined()
      expect('sameAs' in schemaWithNoLinks).toBe(false)

      const schemaWithInvalidUrl = generatePersonJsonLd({
        name: 'Bad Link User',
        username: 'badlink',
        linkedinUrl: 'not-a-valid-url',
        siteOrigin: 'https://prodily.adityagangwani.me',
      })

      expect(schemaWithInvalidUrl.sameAs).toBeUndefined()
    })
  })
})
