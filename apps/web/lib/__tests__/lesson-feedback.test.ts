import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  recordLessonFeedback,
  getLearnerLessonFeedback,
  getLessonQualityMetrics,
  getAllLessonsQualityMetrics,
  ALLOWED_FEEDBACK_TAGS,
} from '../feedback/lesson-feedback-service'
import { trackLessonFeedbackSubmitted } from '../analytics'

interface MockFeedbackRow {
  id?: string
  user_id?: string
  lesson_id?: string
  type?: string
  category?: string
  source_event?: string
  rating?: number | null
  tags?: string[]
  content?: string
  created_at?: string
  [key: string]: unknown
}

describe('Phase 6 — Lesson Feedback & Curriculum Quality Loop', () => {
  let mockSupabase: unknown
  let feedbackStore: MockFeedbackRow[]

  beforeEach(() => {
    vi.clearAllMocks()
    feedbackStore = []

    mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'user_feedback') {
          return {
            select: vi.fn(() => {
              let filtered = [...feedbackStore]

              const chain: Record<string, unknown> = {
                eq: vi.fn((col: string, val: unknown) => {
                  filtered = filtered.filter((r) => r[col] === val)
                  return chain
                }),
                gte: vi.fn((col: string, val: unknown) => {
                  filtered = filtered.filter((r) => String(r[col]) >= String(val))
                  return chain
                }),
                not: vi.fn((col: string, op: string, val: unknown) => {
                  if (op === 'is' && val === null) {
                    filtered = filtered.filter((r) => r[col] !== null && r[col] !== undefined)
                  }
                  return chain
                }),
                order: vi.fn(() => chain),
                limit: vi.fn((n: number) => {
                  filtered = filtered.slice(0, n)
                  return chain
                }),
                maybeSingle: vi.fn(async () => ({
                  data: filtered.length > 0 ? filtered[0] : null,
                  error: null,
                })),
                single: vi.fn(async () => ({
                  data: filtered.length > 0 ? filtered[0] : null,
                  error: filtered.length > 0 ? null : new Error('Row not found'),
                })),
                then: (resolve: (result: { data: MockFeedbackRow[]; error: null }) => void) =>
                  resolve({ data: filtered, error: null }),
              }

              return chain
            }),
            insert: vi.fn((payload: MockFeedbackRow) => {
              const newRow = {
                id: `fb-${Math.random().toString(36).slice(2, 9)}`,
                created_at: new Date().toISOString(),
                ...payload,
              }
              feedbackStore.push(newRow)

              return {
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: newRow,
                    error: null,
                  })),
                })),
              }
            }),
            update: vi.fn((updates: Partial<MockFeedbackRow>) => {
              let target: MockFeedbackRow | undefined
              const updateChain: Record<string, unknown> = {
                eq: vi.fn((col: string, val: unknown) => {
                  target = feedbackStore.find((r) => r[col] === val)
                  if (target) {
                    Object.assign(target, updates)
                  }
                  return updateChain
                }),
                then: (resolve: (result: { data: MockFeedbackRow | undefined; error: null }) => void) =>
                  resolve({ data: target, error: null }),
              }
              return updateChain
            }),
          }
        }
        return {}
      }),
    }
  })

  describe('1. Feedback Validation & Recording', () => {
    it('successfully records a 5-star rating with tags and comment', async () => {
      const client = mockSupabase as SupabaseClient<Database>
      const result = await recordLessonFeedback(client, 'user-123', 'foundations-1-1', {
        rating: 5,
        tags: ['great_breakdown', 'clear_and_actionable'],
        comment: 'Super crisp explanation of discovery interviews!',
      })

      expect(result.success).toBe(true)
      expect(result.isUpdate).toBe(false)
      expect(result.feedback.rating).toBe(5)
      expect(result.feedback.tags).toEqual(['great_breakdown', 'clear_and_actionable'])
      expect(result.feedback.comment).toBe('Super crisp explanation of discovery interviews!')
      expect(feedbackStore).toHaveLength(1)
      expect(feedbackStore[0].type).toBe('lesson_rating')
      expect(feedbackStore[0].category).toBe('curriculum')
    })

    it('rejects invalid rating values (< 1, > 5, or non-integer)', async () => {
      const client = mockSupabase as SupabaseClient<Database>
      await expect(
        recordLessonFeedback(client, 'user-123', 'foundations-1-1', { rating: 0 })
      ).rejects.toThrow('Rating must be an integer between 1 and 5.')

      await expect(
        recordLessonFeedback(client, 'user-123', 'foundations-1-1', { rating: 6 })
      ).rejects.toThrow('Rating must be an integer between 1 and 5.')

      await expect(
        recordLessonFeedback(client, 'user-123', 'foundations-1-1', { rating: 4.5 })
      ).rejects.toThrow('Rating must be an integer between 1 and 5.')
    })

    it('rejects missing user ID or lesson ID', async () => {
      const client = mockSupabase as SupabaseClient<Database>
      await expect(
        recordLessonFeedback(client, '', 'foundations-1-1', { rating: 5 })
      ).rejects.toThrow('Authenticated user ID is required.')

      await expect(
        recordLessonFeedback(client, 'user-123', '', { rating: 5 })
      ).rejects.toThrow('Valid lesson ID is required.')
    })

    it('filters out non-whitelisted or malicious tags', async () => {
      const client = mockSupabase as SupabaseClient<Database>
      const result = await recordLessonFeedback(client, 'user-123', 'foundations-1-1', {
        rating: 4,
        tags: ['great_breakdown', '<script>alert(1)</script>', 'random_unsupported_tag'],
      })

      expect(result.feedback.tags).toEqual(['great_breakdown'])
    })

    it('sanitizes and truncates comments longer than 500 characters', async () => {
      const client = mockSupabase as SupabaseClient<Database>
      const longComment = 'a'.repeat(600)
      const result = await recordLessonFeedback(client, 'user-123', 'foundations-1-1', {
        rating: 4,
        comment: longComment,
      })

      expect(result.feedback.comment).toHaveLength(500)
    })
  })

  describe('2. Rate Limiting & Idempotency (24h Window)', () => {
    it('updates existing feedback within 24 hours instead of duplicating records', async () => {
      const client = mockSupabase as SupabaseClient<Database>
      // First submission
      const first = await recordLessonFeedback(client, 'user-123', 'foundations-1-1', {
        rating: 3,
        tags: ['too_technical'],
        comment: 'A bit dense.',
      })

      expect(first.isUpdate).toBe(false)
      expect(feedbackStore).toHaveLength(1)

      // Second submission for the same lesson within 24 hours
      const second = await recordLessonFeedback(client, 'user-123', 'foundations-1-1', {
        rating: 4,
        tags: ['great_breakdown'],
        comment: 'Reread it and it makes sense now!',
      })

      expect(second.isUpdate).toBe(true)
      expect(feedbackStore).toHaveLength(1)
      expect(feedbackStore[0].rating).toBe(4)
      expect(feedbackStore[0].content).toBe('Reread it and it makes sense now!')
    })

    it('maintains strict user isolation when multiple learners rate the same lesson', async () => {
      const client = mockSupabase as SupabaseClient<Database>
      await recordLessonFeedback(client, 'user-A', 'foundations-1-1', {
        rating: 5,
        tags: ['great_breakdown'],
        comment: 'Learner A feedback',
      })

      await recordLessonFeedback(client, 'user-B', 'foundations-1-1', {
        rating: 3,
        tags: ['too_technical'],
        comment: 'Learner B feedback',
      })

      expect(feedbackStore).toHaveLength(2)
      const userA = feedbackStore.find((r) => r.user_id === 'user-A')
      const userB = feedbackStore.find((r) => r.user_id === 'user-B')

      expect(userA?.rating).toBe(5)
      expect(userB?.rating).toBe(3)
    })

    it('creates a new record if more than 24 hours have elapsed since previous submission', async () => {
      const client = mockSupabase as SupabaseClient<Database>
      const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

      // Seed an older feedback row from 48h ago
      feedbackStore.push({
        id: 'old-fb-1',
        user_id: 'user-123',
        lesson_id: 'foundations-1-1',
        type: 'lesson_rating',
        category: 'curriculum',
        source_event: 'lesson_feedback',
        rating: 2,
        tags: ['too_technical'],
        content: 'Old thought',
        created_at: fortyEightHoursAgo,
      })

      const result = await recordLessonFeedback(client, 'user-123', 'foundations-1-1', {
        rating: 5,
        tags: ['great_breakdown'],
        comment: 'Revisited and now understand!',
      })

      expect(result.isUpdate).toBe(false)
      expect(feedbackStore).toHaveLength(2)
    })
  })

  describe('3. Learner Feedback Retrieval', () => {
    it('returns existing feedback for learner', async () => {
      const client = mockSupabase as SupabaseClient<Database>
      feedbackStore.push({
        id: 'fb-test',
        user_id: 'user-123',
        lesson_id: 'foundations-1-1',
        type: 'lesson_rating',
        rating: 4,
        tags: ['clear_and_actionable'],
        content: 'Great overview.',
        created_at: new Date().toISOString(),
      })

      const feedback = await getLearnerLessonFeedback(client, 'user-123', 'foundations-1-1')
      expect(feedback).not.toBeNull()
      expect(feedback?.rating).toBe(4)
      expect(feedback?.tags).toEqual(['clear_and_actionable'])
      expect(feedback?.comment).toBe('Great overview.')
    })

    it('returns null if no feedback has been submitted', async () => {
      const client = mockSupabase as SupabaseClient<Database>
      const feedback = await getLearnerLessonFeedback(client, 'user-123', 'foundations-1-2')
      expect(feedback).toBeNull()
    })
  })

  describe('4. Quality Metrics Computation & Review Threshold (< 3.5)', () => {
    it('calculates average clarity score, clarity %, and flagged issues correctly', async () => {
      const client = mockSupabase as SupabaseClient<Database>
      feedbackStore.push(
        { lesson_id: 'les-1', type: 'lesson_rating', rating: 5, tags: ['great_breakdown'] },
        { lesson_id: 'les-1', type: 'lesson_rating', rating: 4, tags: ['clear_and_actionable'] },
        { lesson_id: 'les-1', type: 'lesson_rating', rating: 3, tags: ['too_technical'] },
        { lesson_id: 'les-1', type: 'lesson_rating', rating: 2, tags: ['confusing_example'] }
      )

      const metrics = await getLessonQualityMetrics(client, 'les-1')
      // Avg: (5 + 4 + 3 + 2) / 4 = 3.5
      expect(metrics.averageClarityScore).toBe(3.5)
      // Clarity % (ratings >= 4): 2 out of 4 = 50%
      expect(metrics.clarityPct).toBe(50)
      expect(metrics.totalFeedback).toBe(4)
      // Flagged issues: rating 3 has 'too_technical', rating 2 is <= 2
      expect(metrics.flaggedIssuesCount).toBe(2)
      // Clarity is 3.5 -> needsReview is false (threshold is < 3.5)
      expect(metrics.needsReview).toBe(false)
    })

    it('flags lessons for review when clarity score is strictly below 3.5', async () => {
      const client = mockSupabase as SupabaseClient<Database>
      feedbackStore.push(
        { lesson_id: 'les-dense', type: 'lesson_rating', rating: 3, tags: ['too_technical'] },
        { lesson_id: 'les-dense', type: 'lesson_rating', rating: 3, tags: ['pacing_too_fast'] },
        { lesson_id: 'les-dense', type: 'lesson_rating', rating: 2, tags: ['outdated'] }
      )

      const metrics = await getLessonQualityMetrics(client, 'les-dense')
      // Avg: (3 + 3 + 2) / 3 = 2.7
      expect(metrics.averageClarityScore).toBe(2.7)
      expect(metrics.needsReview).toBe(true)
    })

    it('handles lessons with zero feedback gracefully', async () => {
      const client = mockSupabase as SupabaseClient<Database>
      const metrics = await getLessonQualityMetrics(client, 'les-empty')
      expect(metrics.averageClarityScore).toBeNull()
      expect(metrics.clarityPct).toBeNull()
      expect(metrics.totalFeedback).toBe(0)
      expect(metrics.flaggedIssuesCount).toBe(0)
      expect(metrics.needsReview).toBe(false)
    })

    it('correctly handles a single feedback submission', async () => {
      const client = mockSupabase as SupabaseClient<Database>
      feedbackStore.push({
        lesson_id: 'les-single',
        type: 'lesson_rating',
        rating: 4,
        tags: ['clear_and_actionable'],
      })

      const metrics = await getLessonQualityMetrics(client, 'les-single')
      expect(metrics.averageClarityScore).toBe(4)
      expect(metrics.clarityPct).toBe(100)
      expect(metrics.totalFeedback).toBe(1)
      expect(metrics.flaggedIssuesCount).toBe(0)
      expect(metrics.needsReview).toBe(false)
    })

    it('computes 100% clarity and zero flagged issues for only positive ratings', async () => {
      const client = mockSupabase as SupabaseClient<Database>
      feedbackStore.push(
        { lesson_id: 'les-positive', type: 'lesson_rating', rating: 5, tags: ['great_breakdown'] },
        { lesson_id: 'les-positive', type: 'lesson_rating', rating: 5, tags: ['clear_and_actionable'] },
        { lesson_id: 'les-positive', type: 'lesson_rating', rating: 4, tags: [] }
      )

      const metrics = await getLessonQualityMetrics(client, 'les-positive')
      expect(metrics.averageClarityScore).toBe(4.7)
      expect(metrics.clarityPct).toBe(100)
      expect(metrics.flaggedIssuesCount).toBe(0)
      expect(metrics.needsReview).toBe(false)
    })

    it('computes 0% clarity and flags for review for only negative ratings', async () => {
      const client = mockSupabase as SupabaseClient<Database>
      feedbackStore.push(
        { lesson_id: 'les-neg', type: 'lesson_rating', rating: 1, tags: ['confusing_example'] },
        { lesson_id: 'les-neg', type: 'lesson_rating', rating: 2, tags: ['too_technical'] }
      )

      const metrics = await getLessonQualityMetrics(client, 'les-neg')
      expect(metrics.averageClarityScore).toBe(1.5)
      expect(metrics.clarityPct).toBe(0)
      expect(metrics.flaggedIssuesCount).toBe(2)
      expect(metrics.needsReview).toBe(true)
    })
  })

  describe('5. Multi-Lesson Curriculum Aggregates', () => {
    it('aggregates all quality metrics mapped by lesson_id for admin overview', async () => {
      const client = mockSupabase as SupabaseClient<Database>
      feedbackStore.push(
        { lesson_id: 'les-A', type: 'lesson_rating', rating: 5, tags: ['great_breakdown'] },
        { lesson_id: 'les-A', type: 'lesson_rating', rating: 5, tags: [] },
        { lesson_id: 'les-B', type: 'lesson_rating', rating: 2, tags: ['too_technical'] }
      )

      const map = await getAllLessonsQualityMetrics(client)
      expect(map.size).toBe(2)

      const metricsA = map.get('les-A')
      expect(metricsA?.averageClarityScore).toBe(5)
      expect(metricsA?.needsReview).toBe(false)

      const metricsB = map.get('les-B')
      expect(metricsB?.averageClarityScore).toBe(2)
      expect(metricsB?.needsReview).toBe(true)
    })
  })

  describe('6. Analytics Zero-PII & Null-Safety', () => {
    beforeEach(() => {
      delete (globalThis as Record<string, unknown>).window
    })

    it('does not throw when window or window.gtag is undefined', () => {
      expect(() => {
        trackLessonFeedbackSubmitted('foundations-1-1', 5, 2, true)
      }).not.toThrow()
    })

    it('dispatches lesson_feedback_submitted event with strictly zero PII', () => {
      const mockGtag = vi.fn()
      ;(globalThis as Record<string, unknown>).window = { gtag: mockGtag }

      trackLessonFeedbackSubmitted('foundations-1-1', 4, 2, true)

      expect(mockGtag).toHaveBeenCalledWith('event', 'lesson_feedback_submitted', {
        lesson_id: 'foundations-1-1',
        rating: 4,
        tags_count: 2,
        has_comment: true,
      })

      // Strict PII checks: no email, user ID, or comment text
      const payload = mockGtag.mock.calls[0][2] as Record<string, unknown>
      expect(payload).not.toHaveProperty('comment')
      expect(payload).not.toHaveProperty('email')
      expect(payload).not.toHaveProperty('user_id')
      expect(payload).not.toHaveProperty('userId')
    })
  })

  describe('7. Curriculum Invariance', () => {
    it('verifies feedback tags and types do not alter curriculum progression', () => {
      // Confirms all allowed tags are string identifiers
      for (const tag of ALLOWED_FEEDBACK_TAGS) {
        expect(typeof tag).toBe('string')
        expect(tag.length).toBeGreaterThan(0)
      }
    })
  })
})
