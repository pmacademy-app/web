/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { submitCapstoneAction } from '../capstones-db'
import { getPublicPortfolioData } from '../portfolio-db'
import {
  trackCapstoneSubmitted,
  trackPortfolioArtifactCreated,
  trackPortfolioVisitedFromCapstone,
} from '../analytics'

// Mock global notification dispatcher to observe events
vi.mock('../notifications/dispatcher', () => ({
  globalNotificationDispatcher: {
    dispatch: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../notifications/events/connectors', () => ({
  initializeNotificationConnectors: vi.fn(),
}))

describe('Phase 4: Capstone → Direct-to-Portfolio Integration Test Suite', () => {
  const validOpportunityBrief = `
# Product Opportunity Brief: Customer Activation & Retention Improvement

## 1. Problem Statement
The user onboarding dropoff rate is currently 42% within the first 14 days. Customers report feeling overwhelmed by excessive initial configuration steps and lack of clear progress indicators. Solving this will unlock immediate customer retention and increase core product engagement.

## 2. Jobs-To-Be-Done (JTBD)
When a new product manager signs up for our workspace, they want a guided, friction-free onboarding checklist so that they can configure their first project dashboard in under 5 minutes without consulting engineering support.

## 3. Target Personas & User Segment
Our primary user is the Early Career Product Manager and Senior PM transitioning into SaaS. Their main operational constraint is limited setup time during intense work sprints. Secondary persona is the Associate PM learning foundational frameworks.

## 4. Success Metrics & Guardrails
- Primary Metric: 14-day user onboarding completion rate increases from 58% to 80%.
- Secondary Metric: Time to first completed project deliverable drops from 25 minutes to 6 minutes.
- Guardrail Metric: User support ticket submissions regarding setup must not exceed 3% of new signups.
`.repeat(2)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  function createMockSupabase(overrides: {
    isPortfolioPublic?: boolean
    capstoneSubmissions?: any[]
    existingInsertIsPublicCheck?: (isPublic: boolean) => void
  } = {}) {
    const isPortfolioPublic = overrides.isPortfolioPublic ?? true

    return {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            ilike: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'usr-1',
                username: 'arivera',
                name: 'Alex Rivera',
                bio: 'Passionate PM building products',
                is_portfolio_public: isPortfolioPublic,
                total_xp: 350,
              },
            }),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: 'usr-1',
                username: 'arivera',
                email: 'alex@example.com',
                name: 'Alex Rivera',
                is_portfolio_public: isPortfolioPublic,
                total_xp: 350,
              },
            }),
            limit: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'usr-1',
                  username: 'arivera',
                  name: 'Alex Rivera',
                  bio: 'Passionate PM building products',
                  is_portfolio_public: isPortfolioPublic,
                  total_xp: 350,
                },
              ],
              error: null,
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }
        }
        if (table === 'capstone_submissions') {
          const submissions = overrides.capstoneSubmissions ?? []
          const chain: any = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockImplementation(() => chain),
            in: vi.fn().mockImplementation(() => chain),
            neq: vi.fn().mockImplementation(() => chain),
            order: vi.fn().mockImplementation(() => chain),
            limit: vi.fn().mockResolvedValue({ data: submissions }),
            then: (resolve: any) => resolve({ data: submissions, error: null }),
            insert: vi.fn().mockImplementation((payload) => {
              if (overrides.existingInsertIsPublicCheck) {
                overrides.existingInsertIsPublicCheck(payload.is_public)
              }
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'cap-sub-1',
                      user_id: 'usr-1',
                      module_slug: 'foundations',
                      status: 'submitted',
                      is_public: payload.is_public,
                      content: validOpportunityBrief,
                      submitted_at: '2026-08-27T12:00:00Z',
                    },
                    error: null,
                  }),
                }),
              }
            }),
          }
          return chain
        }
        if (table === 'user_lesson_progress') {
          const chain: any = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockImplementation(() => chain),
            in: vi.fn().mockResolvedValue({
              data: Array.from({ length: 10 }, (_, i) => ({ lesson_id: `les_${i}`, status: 'completed' })),
              error: null,
            }),
            then: (resolve: any) => resolve({
              data: Array.from({ length: 10 }, (_, i) => ({ lesson_id: `les_${i}`, status: 'completed' })),
              error: null,
            }),
          }
          return chain
        }
        if (table === 'reflections') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: [] }),
            limit: vi.fn().mockResolvedValue({ data: [] }),
            insert: vi.fn().mockResolvedValue({ data: [], error: null }),
          }
        }
        if (table === 'xp_events') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            insert: vi.fn().mockResolvedValue({ data: [], error: null }),
          }
        }
        if (table === 'system_settings') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          }
        }
        if (table === 'user_streaks') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { current_streak: 1, longest_streak: 1 } }),
            upsert: vi.fn().mockResolvedValue({ data: [], error: null }),
          }
        }
        if (table === 'skill_ratings') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [] }),
          }
        }
        return { select: vi.fn().mockReturnThis() }
      }),
    } as any
  }

  describe('1. Capstone Submission & Portfolio Privacy Rules', () => {
    it('creates capstone submission with is_public: true when portfolio is public and learner has not opted out', async () => {
      let insertedIsPublic: boolean | undefined
      const mockSupabase = createMockSupabase({
        isPortfolioPublic: true,
        existingInsertIsPublicCheck: (isPub) => {
          insertedIsPublic = isPub
        },
      })

      const res = await submitCapstoneAction(
        mockSupabase,
        'usr-1',
        'foundations',
        validOpportunityBrief,
        'Great learning experience',
        true,
        true
      )

      expect(res.success).toBe(true)
      expect(insertedIsPublic).toBe(true)
      expect(res.submission.is_public).toBe(true)
      expect(res.submission.status).toBe('submitted')
      expect(res.xpEarned).toBe(150)
    })

    it('sets is_public: false when learner explicitly opts out of public display', async () => {
      let insertedIsPublic: boolean | undefined
      const mockSupabase = createMockSupabase({
        isPortfolioPublic: true,
        existingInsertIsPublicCheck: (isPub) => {
          insertedIsPublic = isPub
        },
      })

      const res = await submitCapstoneAction(
        mockSupabase,
        'usr-1',
        'foundations',
        validOpportunityBrief,
        '',
        false,
        false // explicit opt-out
      )

      expect(res.success).toBe(true)
      expect(insertedIsPublic).toBe(false)
      expect(res.submission.is_public).toBe(false)
    })

    it('defaults is_public: false when learner entire portfolio is marked private in users table', async () => {
      let insertedIsPublic: boolean | undefined
      const mockSupabase = createMockSupabase({
        isPortfolioPublic: false, // Entire portfolio private
        existingInsertIsPublicCheck: (isPub) => {
          insertedIsPublic = isPub
        },
      })

      const res = await submitCapstoneAction(
        mockSupabase,
        'usr-private',
        'foundations',
        validOpportunityBrief
      )

      expect(res.success).toBe(true)
      expect(insertedIsPublic).toBe(false)
      expect(res.submission.is_public).toBe(false)
    })

    it('forces is_public: false when learner entire portfolio is private even if client requests isPublic: true', async () => {
      let insertedIsPublic: boolean | undefined
      const mockSupabase = createMockSupabase({
        isPortfolioPublic: false,
        existingInsertIsPublicCheck: (isPub) => {
          insertedIsPublic = isPub
        },
      })

      const res = await submitCapstoneAction(
        mockSupabase,
        'usr-private',
        'foundations',
        validOpportunityBrief,
        '',
        false,
        true // Client attempts to pass isPublic: true
      )

      expect(res.success).toBe(true)
      expect(insertedIsPublic).toBe(false)
      expect(res.submission.is_public).toBe(false)
    })
  })

  describe('2. Idempotency & Duplicate Prevention', () => {
    it('idempotently returns existing submission without creating duplicates or re-awarding XP', async () => {
      const existingSubmission = {
        id: 'existing-sub-id',
        user_id: 'usr-1',
        module_slug: 'foundations',
        status: 'submitted',
        is_public: true,
        content: validOpportunityBrief,
        submitted_at: '2026-08-20T10:00:00Z',
      }

      const mockSupabase = createMockSupabase({
        isPortfolioPublic: true,
        capstoneSubmissions: [existingSubmission],
      })

      const res = await submitCapstoneAction(
        mockSupabase,
        'usr-1',
        'foundations',
        validOpportunityBrief
      )

      expect(res.success).toBe(true)
      expect(res.submission.id).toBe('existing-sub-id')
      expect(res.xpEarned).toBe(0)
      expect(res.message).toBe('Capstone already submitted.')
    })
  })

  describe('3. Public Portfolio Rendering & Moderation Respect', () => {
    it('renders public capstones with wordCount, competencyCluster, and learningObjectives', async () => {
      const submittedCapstone = {
        id: 'cap-sub-1',
        user_id: 'usr-1',
        module_slug: 'foundations',
        status: 'submitted',
        is_public: true,
        content: validOpportunityBrief,
        submitted_at: '2026-08-27T12:00:00Z',
      }

      const mockSupabase = createMockSupabase({
        isPortfolioPublic: true,
        capstoneSubmissions: [submittedCapstone],
      })

      const portfolio = await getPublicPortfolioData(mockSupabase, 'arivera')
      expect(portfolio).not.toBeNull()
      expect(portfolio?.user.username).toBe('arivera')
      expect(portfolio?.capstones.length).toBe(1)

      const item = portfolio!.capstones[0]
      expect(item.id).toBe('cap-sub-1')
      expect(item.moduleSlug).toBe('foundations')
      expect(item.title).toBe('Product Opportunity Brief & Problem Definition')
      expect(item.deliverableType).toBe('Opportunity Brief')
      expect(item.competencyCluster).toBe('strategy')
      expect(item.wordCount).toBeGreaterThan(150)
      expect(item.status).toBe('submitted')
      expect(item.learningObjectives.length).toBeGreaterThan(0)
    })

    it('returns null when entire portfolio is private', async () => {
      const mockSupabase = createMockSupabase({
        isPortfolioPublic: false,
      })

      const portfolio = await getPublicPortfolioData(mockSupabase, 'arivera')
      expect(portfolio).toBeNull()
    })
  })

  describe('4. Phase 4 Analytics & Zero-PII Guarantees', () => {
    it('fires trackPortfolioArtifactCreated and trackPortfolioVisitedFromCapstone without throwing', () => {
      const mockGtag = vi.fn()
      vi.stubGlobal('window', { gtag: mockGtag })

      expect(() => trackCapstoneSubmitted('foundations', 'Product Foundations')).not.toThrow()
      expect(mockGtag).toHaveBeenCalledWith('event', 'capstone_submit', {
        module_slug: 'foundations',
        module_title: 'Product Foundations',
      })

      expect(() => trackPortfolioArtifactCreated('foundations', true)).not.toThrow()
      expect(mockGtag).toHaveBeenCalledWith('event', 'portfolio_artifact_created', {
        module_slug: 'foundations',
        is_public: true,
      })

      expect(() => trackPortfolioVisitedFromCapstone('foundations')).not.toThrow()
      expect(mockGtag).toHaveBeenCalledWith('event', 'portfolio_visited_from_capstone', {
        module_slug: 'foundations',
      })

      // Verify zero PII in payloads
      const allCalls = mockGtag.mock.calls
      for (const call of allCalls) {
        const payload = JSON.stringify(call[2] || {})
        expect(payload).not.toContain('email')
        expect(payload).not.toContain('@')
        expect(payload).not.toContain('password')
        expect(payload).not.toContain('token')
      }

      vi.unstubAllGlobals()
    })

    it('analytics functions are null-safe when window or gtag is absent', () => {
      vi.stubGlobal('window', undefined)
      expect(() => trackPortfolioArtifactCreated('foundations', true)).not.toThrow()
      expect(() => trackPortfolioVisitedFromCapstone('foundations')).not.toThrow()
      vi.unstubAllGlobals()
    })
  })
})
