import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getPublicPortfolioData,
  getPortfolioSettings,
  updatePortfolioSettings,
  incrementPortfolioViewCount,
  getLearnerSubmittedCapstones,
  DEFAULT_PORTFOLIO_LAYOUT,
  type PortfolioSectionId,
} from '../portfolio-db'
import {
  trackPortfolioLayoutUpdated,
  trackPortfolioFeaturedCapstoneSet,
  trackPortfolioViewed,
} from '../analytics'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

describe('Phase 5: Portfolio Evolution & Customization Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  // Helper to build a flexible mock Supabase client
  function createMockSupabase(overrides: {
    userData?: Record<string, unknown> | null
    submissions?: Array<Record<string, unknown>>
    userError?: unknown
    updateHandler?: (payload: Record<string, unknown>) => void
    rpcHandler?: (fn: string, args: Record<string, unknown>) => void
  } = {}) {
    const defaultUser = {
      id: 'usr-123',
      username: 'pmexpert',
      name: 'Alex Mercer',
      bio: 'Principal PM focusing on B2B SaaS architecture.',
      avatar_url: null,
      linkedin_url: 'https://linkedin.com/in/alexmercer',
      github_url: 'https://github.com/alexmercer',
      website_url: 'https://alexmercer.io',
      is_portfolio_public: true,
      portfolio_layout: ['hero', 'capstones', 'radar', 'achievements', 'progress'],
      featured_capstone_id: 'cap-1',
      portfolio_view_count: 42,
      total_xp: 950,
      current_streak: 5,
      longest_streak: 12,
    }

    const user = overrides.userData !== undefined ? overrides.userData : defaultUser

    const mockSubmissions = overrides.submissions ?? [
      {
        id: 'cap-1',
        user_id: 'usr-123',
        module_slug: 'foundations',
        status: 'submitted',
        content: 'This is a verified product opportunity brief analyzing market opportunity.',
        is_public: true,
        submitted_at: '2026-08-20T10:00:00Z',
      },
      {
        id: 'cap-2',
        user_id: 'usr-123',
        module_slug: 'discovery',
        status: 'submitted',
        content: 'User discovery synthesis and customer interview transcripts.',
        is_public: false, // Explicitly private
        submitted_at: '2026-08-22T14:00:00Z',
      },
    ]

    return {
      from: vi.fn((table: string) => {
        if (table === 'users') {
          return {
            select: vi.fn(() => ({
              ilike: vi.fn(() => ({
                limit: vi.fn(async () => ({
                  data: user ? [user] : [],
                  error: overrides.userError ?? null,
                })),
                neq: vi.fn(() => ({
                  limit: vi.fn(async () => ({
                    data: [],
                  })),
                })),
              })),
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: user,
                  error: overrides.userError ?? null,
                })),
                maybeSingle: vi.fn(async () => ({
                  data: user,
                  error: overrides.userError ?? null,
                })),
              })),
            })),
            update: vi.fn((payload: Record<string, unknown>) => {
              if (overrides.updateHandler) overrides.updateHandler(payload)
              return {
                eq: vi.fn(async () => ({ error: null })),
              }
            }),
          }
        }

        if (table === 'capstone_submissions') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn((field: string, val: string) => {
                if (field === 'id') {
                  return {
                    eq: vi.fn((_uField: string, uVal: string) => ({
                      maybeSingle: vi.fn(async () => {
                        const found = mockSubmissions.find(
                          (s) => s.id === val && s.user_id === uVal
                        )
                        return { data: found || null, error: null }
                      }),
                    })),
                  }
                }
                return {
                  in: vi.fn(() => ({
                    neq: vi.fn(() => ({
                      order: vi.fn(async () => ({
                        data: mockSubmissions.filter((s) => s.is_public !== false),
                      })),
                    })),
                    order: vi.fn(async () => ({
                      data: mockSubmissions,
                    })),
                  })),
                }
              }),
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
                eq: vi.fn(async () => ({
                  data: [],
                })),
              })),
            })),
          }
        }

        if (table === 'user_radar_skills') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(async () => ({
                data: [],
              })),
            })),
          }
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: [] })),
          })),
        }
      }),
      rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
        if (overrides.rpcHandler) overrides.rpcHandler(fn, args)
        return { error: null }
      }),
    } as unknown as SupabaseClient<Database>
  }

  describe('1. Portfolio Layout & Section Reordering', () => {
    it('loads configured custom portfolio layout on public portfolio', async () => {
      const mockSupabase = createMockSupabase()
      const data = await getPublicPortfolioData(mockSupabase, 'pmexpert')

      expect(data).not.toBeNull()
      expect(data?.user.portfolioLayout).toEqual([
        'hero',
        'capstones',
        'radar',
        'achievements',
        'progress',
      ])
    })

    it('falls back safely to DEFAULT_PORTFOLIO_LAYOUT for legacy users without custom layout', async () => {
      const mockSupabase = createMockSupabase({
        userData: {
          id: 'legacy-usr',
          username: 'legacyuser',
          name: 'Legacy Learner',
          is_portfolio_public: true,
          portfolio_layout: null, // Legacy user
          featured_capstone_id: null,
          portfolio_view_count: 0,
          total_xp: 100,
        },
      })

      const data = await getPublicPortfolioData(mockSupabase, 'legacyuser')

      expect(data).not.toBeNull()
      expect(data?.user.portfolioLayout).toEqual(DEFAULT_PORTFOLIO_LAYOUT)
    })

    it('persists reordered section layout in updatePortfolioSettings', async () => {
      let savedPayload: Record<string, unknown> | null = null
      const mockSupabase = createMockSupabase({
        updateHandler: (payload) => {
          savedPayload = payload
        },
      })

      const customLayout: PortfolioSectionId[] = ['hero', 'achievements', 'radar', 'capstones']
      const res = await updatePortfolioSettings(mockSupabase, 'usr-123', {
        username: 'pmexpert',
        name: 'Alex Mercer',
        bio: 'Updated bio',
        avatarUrl: '',
        linkedinUrl: '',
        githubUrl: '',
        websiteUrl: '',
        isPortfolioPublic: true,
        portfolioLayout: customLayout,
      })

      expect(res.success).toBe(true)
      expect(savedPayload ? (savedPayload as Record<string, unknown>)['portfolio_layout'] : null).toEqual(customLayout)
      expect(res.settings.portfolioLayout).toEqual(customLayout)
    })
  })

  describe('2. Featured Deliverable Pinning & Privacy Enforcement', () => {
    it('resolves and attaches featured capstone when it is public', async () => {
      const mockSupabase = createMockSupabase()
      const data = await getPublicPortfolioData(mockSupabase, 'pmexpert')

      expect(data).not.toBeNull()
      expect(data?.featuredCapstone).not.toBeNull()
      expect(data?.featuredCapstone?.id).toBe('cap-1')
      expect(data?.featuredCapstone?.moduleSlug).toBe('foundations')
      expect(data?.featuredCapstone?.wordCount).toBeGreaterThan(0)
    })

    it('strictly resolves featuredCapstone to null if learner featured an unapproved/private capstone', async () => {
      // Learner sets featured_capstone_id to cap-2, which has is_public: false
      const mockSupabase = createMockSupabase({
        userData: {
          id: 'usr-123',
          username: 'pmexpert',
          name: 'Alex Mercer',
          is_portfolio_public: true,
          portfolio_layout: DEFAULT_PORTFOLIO_LAYOUT,
          featured_capstone_id: 'cap-2', // cap-2 is private!
          portfolio_view_count: 10,
        },
      })

      const data = await getPublicPortfolioData(mockSupabase, 'pmexpert')

      expect(data).not.toBeNull()
      // Critical Privacy Guarantee: Even though featured_capstone_id is 'cap-2',
      // cap-2 is excluded from public submissions query, so featuredCapstone must evaluate to null!
      expect(data?.featuredCapstone).toBeNull()
    })

    it('resolves featuredCapstone to null when featured_capstone_id is null or non-existent', async () => {
      const mockSupabase = createMockSupabase({
        userData: {
          id: 'usr-123',
          username: 'pmexpert',
          name: 'Alex Mercer',
          is_portfolio_public: true,
          portfolio_layout: DEFAULT_PORTFOLIO_LAYOUT,
          featured_capstone_id: 'non-existent-uuid',
          portfolio_view_count: 5,
        },
      })

      const data = await getPublicPortfolioData(mockSupabase, 'pmexpert')

      expect(data).not.toBeNull()
      expect(data?.featuredCapstone).toBeNull()
    })

    it('saves featured_capstone_id in updatePortfolioSettings', async () => {
      let savedPayload: Record<string, unknown> | null = null
      const mockSupabase = createMockSupabase({
        updateHandler: (payload) => {
          savedPayload = payload
        },
      })

      const res = await updatePortfolioSettings(mockSupabase, 'usr-123', {
        username: 'pmexpert',
        name: 'Alex Mercer',
        bio: '',
        avatarUrl: '',
        linkedinUrl: '',
        githubUrl: '',
        websiteUrl: '',
        isPortfolioPublic: true,
        featuredCapstoneId: 'cap-1',
      })

      expect(res.success).toBe(true)
      expect(savedPayload ? (savedPayload as Record<string, unknown>)['featured_capstone_id'] : null).toBe('cap-1')
      expect(res.settings.featuredCapstoneId).toBe('cap-1')
    })

    it('rejects non-owned or non-existent capstone IDs in updatePortfolioSettings', async () => {
      const mockSupabase = createMockSupabase()

      await expect(
        updatePortfolioSettings(mockSupabase, 'usr-123', {
          username: 'pmexpert',
          name: 'Alex Mercer',
          bio: '',
          avatarUrl: '',
          linkedinUrl: '',
          githubUrl: '',
          websiteUrl: '',
          isPortfolioPublic: true,
          featuredCapstoneId: 'other-user-capstone-uuid',
        })
      ).rejects.toThrow('Selected featured capstone does not exist or does not belong to you.')
    })

    it('filters out invalid section IDs and preserves hero in layout', async () => {
      let savedPayload: Record<string, unknown> | null = null
      const mockSupabase = createMockSupabase({
        updateHandler: (payload) => {
          savedPayload = payload
        },
      })

      const maliciousLayout = ['hacked_section', 'radar', 'malicious_code'] as unknown as PortfolioSectionId[]
      const res = await updatePortfolioSettings(mockSupabase, 'usr-123', {
        username: 'pmexpert',
        name: 'Alex Mercer',
        bio: '',
        avatarUrl: '',
        linkedinUrl: '',
        githubUrl: '',
        websiteUrl: '',
        isPortfolioPublic: true,
        portfolioLayout: maliciousLayout,
      })

      expect(res.success).toBe(true)
      const layout = savedPayload
        ? ((savedPayload as Record<string, unknown>)['portfolio_layout'] as string[])
        : []
      expect(layout).toContain('hero')
      expect(layout).toContain('radar')
      expect(layout).not.toContain('hacked_section')
      expect(layout).not.toContain('malicious_code')
    })
  })

  describe('3. Atomic Visitor Analytics & Engagement Tracking', () => {
    it('calls increment_portfolio_view_count stored procedure on public portfolio view', async () => {
      let calledFn = ''
      let passedArgs: Record<string, unknown> = {}

      const mockSupabase = createMockSupabase({
        rpcHandler: (fn, args) => {
          calledFn = fn
          passedArgs = args
        },
      })

      await incrementPortfolioViewCount(mockSupabase, 'usr-123')

      expect(calledFn).toBe('increment_portfolio_view_count')
      expect(passedArgs).toEqual({ target_user_id: 'usr-123' })
    })

    it('falls back to select-update if RPC fails, incrementing view count safely', async () => {
      let updateRun = false
      const mockSupabase = {
        rpc: vi.fn(async () => ({ error: { message: 'Procedure not found' } })),
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { portfolio_view_count: 15, is_portfolio_public: true },
              })),
            })),
          })),
          update: vi.fn((payload: Record<string, unknown>) => {
            if (payload.portfolio_view_count === 16) {
              updateRun = true
            }
            return {
              eq: vi.fn(async () => ({ error: null })),
            }
          }),
        })),
      } as unknown as SupabaseClient<Database>

      await incrementPortfolioViewCount(mockSupabase, 'usr-123')

      expect(updateRun).toBe(true)
    })

    it('returns portfolioViewCount in getPortfolioSettings', async () => {
      const mockSupabase = createMockSupabase()
      const settings = await getPortfolioSettings(mockSupabase, 'usr-123')

      expect(settings.portfolioViewCount).toBe(42)
    })
  })

  describe('4. Learner Submitted Capstones Dropdown', () => {
    it('returns all submitted capstones with deliverable metadata for selection', async () => {
      const mockSupabase = createMockSupabase()
      const capstones = await getLearnerSubmittedCapstones(mockSupabase, 'usr-123')

      expect(capstones.length).toBe(2)
      expect(capstones[0].id).toBe('cap-1')
      expect(capstones[0].moduleSlug).toBe('foundations')
      expect(capstones[0].deliverableType).toBe('Opportunity Brief')
      expect(capstones[0].isPublic).toBe(true)

      expect(capstones[1].id).toBe('cap-2')
      expect(capstones[1].moduleSlug).toBe('discovery')
      expect(capstones[1].isPublic).toBe(false)
    })
  })

  describe('5. Analytics Payloads & Zero-PII Guarantees', () => {
    it('tracks portfolio_layout_updated with layout array and zero PII', () => {
      const gtagMock = vi.fn()
      vi.stubGlobal('window', { gtag: gtagMock })

      trackPortfolioLayoutUpdated(['hero', 'capstones', 'radar'])

      expect(gtagMock).toHaveBeenCalledWith('event', 'portfolio_layout_updated', {
        layout: ['hero', 'capstones', 'radar'],
      })
    })

    it('tracks portfolio_featured_capstone_set with module_slug and zero PII', () => {
      const gtagMock = vi.fn()
      vi.stubGlobal('window', { gtag: gtagMock })

      trackPortfolioFeaturedCapstoneSet('foundations')

      expect(gtagMock).toHaveBeenCalledWith('event', 'portfolio_featured_capstone_set', {
        module_slug: 'foundations',
      })
    })

    it('tracks portfolio_viewed with username and zero PII', () => {
      const gtagMock = vi.fn()
      vi.stubGlobal('window', { gtag: gtagMock })

      trackPortfolioViewed('pmexpert')

      expect(gtagMock).toHaveBeenCalledWith('event', 'portfolio_viewed', {
        username: 'pmexpert',
      })
    })

    it('analytics helpers remain safe and non-blocking when gtag is not defined', () => {
      vi.stubGlobal('window', undefined)
      expect(() => {
        trackPortfolioLayoutUpdated(['hero', 'radar'])
        trackPortfolioFeaturedCapstoneSet('strategy')
        trackPortfolioViewed('guest')
      }).not.toThrow()
    })
  })

  describe('6. OpenGraph Dynamic Social Preview Specifications', () => {
    it('generates valid image response for portfolio OG route', async () => {
      const { GET } = await import('@/app/api/og/portfolio/[username]/route')
      const req = new Request('http://localhost:3000/api/og/portfolio/pmexpert')
      const res = await GET(req, { params: Promise.resolve({ username: 'pmexpert' }) })

      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('image/png')
    })
  })
})
