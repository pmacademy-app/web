import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getPublicPortfolioData, updatePortfolioSettings } from '../portfolio/portfolio-db'
import { generatePersonJsonLd } from '../portfolio/portfolio'
// The admin grant/revoke routes and their authorization tests moved to the admin console
// repository. This suite keeps the learner-side Fellow guarantees.
describe('Unit 2: Fellow Identity Test Suite', () => {
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
                eq: vi.fn(() => ({
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
                eq: vi.fn(() => ({
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
})
