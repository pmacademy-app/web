/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  validateCapstoneTransition,
  validateCapstoneSubmission,
  deriveCapstoneStatus,
  calculateCapstoneWordCount,
} from '@/lib/capstones'
import {
  saveDraftAction,
  submitCapstoneAction,
  getModuleCapstonesOverview,
} from '@/lib/capstones-db'
import { ModerationService } from '@/lib/admin/moderation-service'
import { POST as submitPostHandler } from '../../app/api/capstones/[module]/submit/route'
import { POST as draftPostHandler } from '../../app/api/capstones/[module]/draft/route'

function createMockRequest(url: string, options: {
  method?: string
  headers?: Record<string, string>
  body?: string
}) {
  const parsedUrl = new URL(url)
  const headerMap = new Map<string, string>()
  if (options.headers) {
    Object.entries(options.headers).forEach(([k, v]) => headerMap.set(k.toLowerCase(), v))
  }

  return {
    url,
    nextUrl: parsedUrl,
    method: options.method || 'POST',
    headers: {
      get: (headerName: string) => headerMap.get(headerName.toLowerCase()) || null,
    },
    text: async () => options.body || '',
    json: async () => JSON.parse(options.body || '{}'),
  } as any
}

const validLongContent = `
# Product Opportunity Brief: Customer Onboarding Improvement

## 1. Problem Statement
The user onboarding dropoff rate is currently 42% within the first 14 days. Customers report feeling overwhelmed by excessive initial configuration steps and unclear value propositions.

## 2. Target Persona & User Segment
Our primary target user persona is the Early Career Product Manager trying to quickly set up their workspace. Their main constraint is limited time during work hours.

## 3. Jobs-To-Be-Done (JTBD)
- **Core Job:** When I first sign up for the platform, I want a guided setup wizard so that I can reach my first value milestone in under 5 minutes.
- **Emotional Job:** Feel confident and competent using the tool.

## 4. Business Impact & Success Metrics
- **Primary Metric:** 14-day onboarding activation rate increase from 58% to 75%.
- **Secondary Metrics:** Time to first active project creation reduced from 20 minutes to 5 minutes.
- **Guardrail Metric:** User support ticket volume should not increase by more than 5%.

## 5. Key Risks & Hypotheses
We hypothesize that replacing raw forms with an interactive step-by-step checklist will increase activation by reducing cognitive overload.
`.repeat(2)

describe('Phase 8 — Capstone State Consistency, Progress Integrity & Submission Reliability', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('1. State Transition Machine Validation', () => {
    it('permits valid learner transitions and rejects illegal learner transitions', () => {
      // Allowed learner transitions
      expect(validateCapstoneTransition('unlocked', 'draft', 'learner').allowed).toBe(true)
      expect(validateCapstoneTransition('draft', 'draft', 'learner').allowed).toBe(true)
      expect(validateCapstoneTransition('draft', 'submitted', 'learner').allowed).toBe(true)
      expect(validateCapstoneTransition('unlocked', 'submitted', 'learner').allowed).toBe(true)

      // Forbidden learner transitions
      expect(validateCapstoneTransition('submitted', 'draft', 'learner').allowed).toBe(false)
      expect(validateCapstoneTransition('reviewed', 'draft', 'learner').allowed).toBe(false)
      expect(validateCapstoneTransition('reviewed', 'submitted', 'learner').allowed).toBe(false)
      expect(validateCapstoneTransition('draft', 'reviewed', 'learner').allowed).toBe(false)
      expect(validateCapstoneTransition('submitted', 'reviewed', 'learner').allowed).toBe(false)
    })

    it('permits valid admin transitions and rejects illegal admin transitions', () => {
      // Allowed admin transitions
      expect(validateCapstoneTransition('submitted', 'reviewed', 'admin').allowed).toBe(true)
      expect(validateCapstoneTransition('reviewed', 'reviewed', 'admin').allowed).toBe(true)
      expect(validateCapstoneTransition('submitted', 'draft', 'admin').allowed).toBe(true)

      // Forbidden admin transitions
      expect(validateCapstoneTransition('draft', 'reviewed', 'admin').allowed).toBe(false)
    })
  })

  describe('2. Submission Validation & Word Count', () => {
    it('accurately calculates word count stripping markdown formatting', () => {
      const md = '# Title\n\n**Bold Text** and *Italic* with a [Link](https://prodily.app).'
      const { wordCount } = calculateCapstoneWordCount(md)
      expect(wordCount).toBe(8)
    })

    it('rejects submissions that do not meet minimum word count', () => {
      const shortText = 'This is too short.'
      const validation = validateCapstoneSubmission('foundations', shortText)
      expect(validation.isValid).toBe(false)
      expect(validation.reason).toContain('Minimum 250 words required')
    })
  })

  describe('3. Draft Mutation Integrity (saveDraftAction)', () => {
    it('saves a new draft for an unlocked module', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'user_lesson_progress') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: Array.from({ length: 8 }, (_, i) => ({ lesson_id: `les_found_${i}`, status: 'completed' })),
                error: null,
              }),
            }
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [] }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'cap-1', user_id: 'usr-1', module_slug: 'foundations', status: 'draft', content: 'Draft content' },
                  error: null,
                }),
              }),
            }),
          }
        }),
      } as any

      const res = await saveDraftAction(mockSupabase, 'usr-1', 'foundations', 'Draft content')
      expect(res.success).toBe(true)
      expect(res.submission.status).toBe('draft')
    })

    it('prevents overwriting an already submitted capstone when saving draft', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: [{ id: 'cap-sub', user_id: 'usr-1', module_slug: 'foundations', status: 'submitted', content: 'Final submitted work' }],
          }),
        }),
      } as any

      const res = await saveDraftAction(mockSupabase, 'usr-1', 'foundations', 'New draft attempt')
      expect(res.success).toBe(true)
      expect(res.submission.status).toBe('submitted')
      expect(res.submission.content).toBe('Final submitted work')
    })
  })

  describe('4. Submission Reliability & Duplicate Protection (submitCapstoneAction)', () => {
    it('submits capstone, updates status to submitted, awards 150 XP, and records reflection', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'capstone_submissions') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({ data: [] }),
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'cap-sub-1',
                      user_id: 'usr-1',
                      module_slug: 'foundations',
                      status: 'submitted',
                      content: validLongContent,
                      submitted_at: new Date().toISOString(),
                    },
                    error: null,
                  }),
                }),
              }),
            }
          }
          if (table === 'reflections') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
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
          if (table === 'users') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: { total_xp: 500 } }),
              maybeSingle: vi.fn().mockResolvedValue({ data: { total_xp: 500 } }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }
          }
          if (table === 'user_lesson_progress') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: Array.from({ length: 8 }, (_, i) => ({ lesson_id: `les_found_${i}`, status: 'completed' })),
                error: null,
              }),
            }
          }
          if (table === 'user_streaks') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
              insert: vi.fn().mockResolvedValue({ data: [], error: null }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }
          }
          if (table === 'system_settings') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: { value: 150 } }),
            }
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        }),
      } as any

      const res = await submitCapstoneAction(
        mockSupabase,
        'usr-1',
        'foundations',
        validLongContent,
        'My reflection notes',
        true
      )

      expect(res.success).toBe(true)
      expect(res.submission.status).toBe('submitted')
      expect(res.xpEarned).toBe(150)
    })

    it('handles duplicate submit requests idempotently without duplicate XP awards', async () => {
      const existingSubmission = {
        id: 'cap-sub-existing',
        user_id: 'usr-1',
        module_slug: 'foundations',
        status: 'submitted',
        content: validLongContent,
        submitted_at: new Date().toISOString(),
      }

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [existingSubmission] }),
        }),
      } as any

      const res = await submitCapstoneAction(mockSupabase, 'usr-1', 'foundations', validLongContent)
      expect(res.success).toBe(true)
      expect(res.submission.id).toBe('cap-sub-existing')
      expect(res.xpEarned).toBe(0)
      expect(res.message).toBe('Capstone already submitted.')
    })
  })

  describe('5. Status Derivation & Progress Calculation', () => {
    it('correctly derives capstone status based on lesson progress and submission records', () => {
      expect(deriveCapstoneStatus('submitted')).toBe('submitted')
      expect(deriveCapstoneStatus('reviewed')).toBe('reviewed')
      expect(deriveCapstoneStatus('draft')).toBe('draft')
      expect(deriveCapstoneStatus(null, 8)).toBe('unlocked')
      expect(deriveCapstoneStatus(null, 3)).toBe('locked')
    })

    it('computes 9 module overview items with unlocked states', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'capstone_submissions') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockResolvedValue({
                data: [
                  { id: 'sub-1', module_slug: 'foundations', status: 'submitted', submitted_at: '2026-08-01T00:00:00Z' },
                ],
                error: null,
              }),
            }
          }
          if (table === 'user_lesson_progress') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              // Returns 8 completed lessons for foundations
              then: (resolve: any) => resolve({
                data: [
                  { lesson_id: 'les_zoyq8a', status: 'completed' },
                  { lesson_id: 'les_prrl23', status: 'completed' },
                  { lesson_id: 'les_0q4aih', status: 'completed' },
                  { lesson_id: 'les_04ix6b', status: 'completed' },
                  { lesson_id: 'les_aovj2y', status: 'completed' },
                  { lesson_id: 'les_8trb62', status: 'completed' },
                  { lesson_id: 'les_5rbthl', status: 'completed' },
                  { lesson_id: 'les_8psivf', status: 'completed' },
                ],
                error: null,
              }),
            }
          }
          return { select: vi.fn().mockReturnThis() }
        }),
      } as any

      const items = await getModuleCapstonesOverview(mockSupabase, 'usr-1')
      expect(items.length).toBe(9)
      expect(items[0].status).toBe('submitted')
      expect(items[0].unlocked).toBe(true)
      // Module 2 (discovery) has 0 lessons completed, must be locked!
      expect(items[1].status).toBe('locked')
      expect(items[1].unlocked).toBe(false)
    })

    it('ensures Module 3 remains locked when Module 1 and 2 are submitted but Module 3 has 0 lessons', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'capstone_submissions') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockResolvedValue({
                data: [
                  { id: 'sub-1', module_slug: 'foundations', status: 'submitted', submitted_at: '2026-08-01T00:00:00Z' },
                  { id: 'sub-2', module_slug: 'discovery', status: 'submitted', submitted_at: '2026-08-02T00:00:00Z' },
                ],
                error: null,
              }),
            }
          }
          if (table === 'user_lesson_progress') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              // 0 completed lessons for Module 3 (design)
              then: (resolve: any) => resolve({ data: [], error: null }),
            }
          }
          return { select: vi.fn().mockReturnThis() }
        }),
      } as any

      const items = await getModuleCapstonesOverview(mockSupabase, 'usr-aditya')
      expect(items[0].status).toBe('submitted') // Module 1
      expect(items[1].status).toBe('submitted') // Module 2
      expect(items[2].status).toBe('locked')    // Module 3 (design) MUST BE LOCKED
      expect(items[2].unlocked).toBe(false)
    })

    it('rejects new draft or submission creation when module has fewer than 8 completed lessons', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'capstone_submissions') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({ data: [] }),
            }
          }
          if (table === 'user_lesson_progress') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: [
                  { lesson_id: 'les_bhb1lc', status: 'completed' }, // Only 1 lesson completed in design
                ],
                error: null,
              }),
            }
          }
          return { select: vi.fn().mockReturnThis() }
        }),
      } as any

      await expect(
        saveDraftAction(mockSupabase, 'usr-aditya', 'design', 'Some draft text')
      ).rejects.toThrow('Capstone is locked until at least 8 lessons in this module are completed')

      await expect(
        submitCapstoneAction(mockSupabase, 'usr-aditya', 'design', validLongContent)
      ).rejects.toThrow('You must complete at least 8 lessons in this module first')
    })
  })

  describe('6. Admin Moderation & Review (ModerationService.reviewCapstone)', () => {
    it('approving a capstone sets status to reviewed and is_public to true', async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({ data: [{ id: 'sub-123' }], error: null }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      } as any

      const success = await ModerationService.reviewCapstone('admin-1', 'admin@prodily.app', 'sub-123', 'approve', mockClient)
      expect(success).toBe(true)
    })

    it('rejecting a capstone sets status to reviewed and is_public to false', async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({ data: [{ id: 'sub-456' }], error: null }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      } as any

      const success = await ModerationService.reviewCapstone('admin-1', 'admin@prodily.app', 'sub-456', 'reject', mockClient)
      expect(success).toBe(true)
    })
  })

  describe('7. API Route Endpoints Authorization', () => {
    it('returns HTTP 401 for unauthenticated submission requests', async () => {
      const req = createMockRequest('http://localhost:3000/api/capstones/foundations/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'Test submission content' }),
      })

      const res = await submitPostHandler(req, { params: Promise.resolve({ module: 'foundations' }) })
      expect(res.status).toBe(401)
    })

    it('returns HTTP 401 for unauthenticated draft requests', async () => {
      const req = createMockRequest('http://localhost:3000/api/capstones/foundations/draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'Draft content' }),
      })

      const res = await draftPostHandler(req, { params: Promise.resolve({ module: 'foundations' }) })
      expect(res.status).toBe(401)
    })

    it('returns HTTP 404 for invalid module slugs', async () => {
      const req = createMockRequest('http://localhost:3000/api/capstones/invalid-slug/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'Content' }),
      })

      const res = await submitPostHandler(req, { params: Promise.resolve({ module: 'invalid-slug' }) })
      expect(res.status).toBe(404)
    })
  })
})
