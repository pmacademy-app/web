import { describe, expect, it, vi } from 'vitest'

import {
  capstoneReviewSchema,
  validateRubricScores,
} from '@/lib/capstones/rubric'
import {
  getLatestReviewAction,
  validateCapstoneTransition,
} from '@/lib/capstones'
import { ModerationService } from '@/lib/admin/moderation-service'

describe('PROD-03 / AG-26 Capstone Review and Resubmission', () => {
  describe('1. Rubric Score Validation (validateRubricScores)', () => {
    it('Unknown requirement ID rejected', () => {
      const scoresWithUnknown = {
        req_problem: 3,
        req_jtbd: 2,
        req_personas: 3,
        req_metrics: 2,
        unknown_requirement_id: 3,
      }

      const result = validateRubricScores('foundations', scoresWithUnknown)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Unknown requirement ID: "unknown_requirement_id"')
    })

    it('rejects missing requirement IDs', () => {
      const scoresMissingMetrics = {
        req_problem: 3,
        req_jtbd: 2,
        req_personas: 3,
      }

      const result = validateRubricScores('foundations', scoresMissingMetrics)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Missing score for requirement: "req_metrics"')
    })

    it('rejects scores out of the 0..3 range', () => {
      const scoresTooHigh = {
        req_problem: 4,
        req_jtbd: 2,
        req_personas: 3,
        req_metrics: 2,
      }

      const highResult = validateRubricScores('foundations', scoresTooHigh)
      expect(highResult.valid).toBe(false)
      expect(highResult.error).toContain('must be an integer between 0 and 3')

      const scoresNegative = {
        req_problem: -1,
        req_jtbd: 2,
        req_personas: 3,
        req_metrics: 2,
      }

      const negativeResult = validateRubricScores('foundations', scoresNegative)
      expect(negativeResult.valid).toBe(false)
      expect(negativeResult.error).toContain('must be an integer between 0 and 3')

      const scoresNonInteger = {
        req_problem: 2.5,
        req_jtbd: 2,
        req_personas: 3,
        req_metrics: 2,
      }

      const nonIntResult = validateRubricScores('foundations', scoresNonInteger)
      expect(nonIntResult.valid).toBe(false)
      expect(nonIntResult.error).toContain('must be an integer between 0 and 3')
    })

    it('accepts valid scores for all module requirements', () => {
      const validScores = {
        req_problem: 3,
        req_jtbd: 2,
        req_personas: 3,
        req_metrics: 1,
      }

      const result = validateRubricScores('foundations', validScores)
      expect(result.valid).toBe(true)
      expect(result.expectedRequirements?.length).toBe(4)
    })

    it('rejects unknown module slug', () => {
      const result = validateRubricScores('nonexistent-module', { req_problem: 3 })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Unknown capstone module')
    })
  })

  describe('2. Zod Review Schema Validation (capstoneReviewSchema)', () => {
    const validScores = {
      req_problem: 3,
      req_jtbd: 2,
      req_personas: 3,
      req_metrics: 1,
    }

    it('Reject without feedback rejected', () => {
      const missingFeedback = capstoneReviewSchema.safeParse({
        action: 'reject',
        scores: validScores,
      })
      expect(missingFeedback.success).toBe(false)
      if (!missingFeedback.success) {
        expect(missingFeedback.error.issues[0].message).toBe(
          'Feedback is required when rejecting or requesting changes.'
        )
      }

      const emptyFeedback = capstoneReviewSchema.safeParse({
        action: 'reject',
        scores: validScores,
        feedback: '   ',
      })
      expect(emptyFeedback.success).toBe(false)
    })

    it('Request changes without feedback rejected', () => {
      const missingFeedback = capstoneReviewSchema.safeParse({
        action: 'request_changes',
        scores: validScores,
      })
      expect(missingFeedback.success).toBe(false)
      if (!missingFeedback.success) {
        expect(missingFeedback.error.issues[0].message).toBe(
          'Feedback is required when rejecting or requesting changes.'
        )
      }

      const emptyFeedback = capstoneReviewSchema.safeParse({
        action: 'request_changes',
        scores: validScores,
        feedback: '',
      })
      expect(emptyFeedback.success).toBe(false)
    })

    it('Approve without feedback is allowed', () => {
      const result = capstoneReviewSchema.safeParse({
        action: 'approve',
        scores: validScores,
      })
      expect(result.success).toBe(true)
    })

    it('Approve with optional feedback is allowed', () => {
      const result = capstoneReviewSchema.safeParse({
        action: 'approve',
        scores: validScores,
        feedback: 'Excellent work on the opportunity brief.',
      })
      expect(result.success).toBe(true)
    })

    it('Reject with feedback is allowed', () => {
      const result = capstoneReviewSchema.safeParse({
        action: 'reject',
        scores: validScores,
        feedback: 'Does not meet the minimum requirements for problem framing.',
      })
      expect(result.success).toBe(true)
    })

    it('Request changes with feedback is allowed', () => {
      const result = capstoneReviewSchema.safeParse({
        action: 'request_changes',
        scores: validScores,
        feedback: 'Please clarify your JTBD statement and success metrics.',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('3. Transition and Resubmission Rules (validateCapstoneTransition)', () => {
    it('Resubmit after request_changes allowed', () => {
      const resString = validateCapstoneTransition('reviewed', 'submitted', 'learner', 'request_changes')
      expect(resString.allowed).toBe(true)

      const resObj = validateCapstoneTransition('reviewed', 'submitted', 'learner', {
        lastReviewAction: 'request_changes',
      })
      expect(resObj.allowed).toBe(true)
    })

    it('Resubmit after reject allowed', () => {
      const resString = validateCapstoneTransition('reviewed', 'submitted', 'learner', 'reject')
      expect(resString.allowed).toBe(true)

      const resObj = validateCapstoneTransition('reviewed', 'submitted', 'learner', {
        lastReviewAction: 'reject',
      })
      expect(resObj.allowed).toBe(true)
    })

    it('Resubmit after approve refused', () => {
      const resString = validateCapstoneTransition('reviewed', 'submitted', 'learner', 'approve')
      expect(resString.allowed).toBe(false)
      expect(resString.reason).toBe('Cannot resubmit an approved capstone.')

      const resObj = validateCapstoneTransition('reviewed', 'submitted', 'learner', {
        lastReviewAction: 'approve',
      })
      expect(resObj.allowed).toBe(false)
      expect(resObj.reason).toBe('Cannot resubmit an approved capstone.')
    })

    it('Resubmit without review action info defaults to refused', () => {
      const resDefault = validateCapstoneTransition('reviewed', 'submitted', 'learner')
      expect(resDefault.allowed).toBe(false)
      expect(resDefault.reason).toBe('Cannot resubmit an already reviewed capstone.')
    })

    it('Learner cannot transition reviewed capstone back to draft', () => {
      const res = validateCapstoneTransition('reviewed', 'draft', 'learner', 'request_changes')
      expect(res.allowed).toBe(false)
      expect(res.reason).toBe('Cannot revert a submitted or reviewed capstone back to draft.')
    })
  })

  describe('4. Latest Review Action Resolution (getLatestReviewAction)', () => {
    it('resolves action from review_history array', () => {
      const submission = {
        is_public: false,
        review_history: [
          { action: 'reject', reviewed_at: '2026-11-13T10:00:00Z' },
          { action: 'request_changes', reviewed_at: '2026-11-14T10:00:00Z' },
        ],
      }
      expect(getLatestReviewAction(submission)).toBe('request_changes')
    })

    it('falls back to is_public boolean when history is absent', () => {
      expect(getLatestReviewAction({ is_public: true })).toBe('approve')
      expect(getLatestReviewAction({ is_public: false })).toBe('reject')
      expect(getLatestReviewAction({ is_public: null })).toBeNull()
    })
  })

  describe('5. ModerationService.reviewCapstone with Rubric and History', () => {
    it('appends review record to review_history and stores scores and feedback', async () => {
      const mockUpdatedRows: unknown[] = []
      let updatedPayload: {
        status?: string
        is_public?: boolean
        review_scores?: unknown
        review_feedback?: string | null
        review_history?: unknown
      } | null = null

      const fakeClient = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: 'sub-test-1',
                  user_id: 'user-test-1',
                  module_slug: 'foundations',
                  status: 'submitted',
                  is_public: false,
                  reviewed_at: null,
                  revision_count: 0,
                  review_history: [],
                  review_scores: null,
                  review_feedback: null,
                },
                error: null,
              })),
            })),
          })),
          update: vi.fn((payload: Record<string, unknown>) => {
            updatedPayload = payload
            return {
              eq: vi.fn(() => ({
                select: vi.fn(async () => ({
                  data: [{ id: 'sub-test-1' }],
                  error: null,
                })),
              })),
            }
          }),
        })),
      }

      const scores = { req_problem: 3, req_jtbd: 2, req_personas: 3, req_metrics: 2 }
      const feedback = 'Well thought out problem statement. Please add more detail on metrics.'

      const success = await ModerationService.reviewCapstone(
        'admin-user-1',
        'admin@example.com',
        'sub-test-1',
        'request_changes',
        { scores, feedback },
        fakeClient
      )

      expect(success).toBe(true)
      expect(updatedPayload).not.toBeNull()
      const payload = updatedPayload as unknown as Record<string, unknown>
      expect(payload.status).toBe('reviewed')
      expect(payload.is_public).toBe(false)
      expect(payload.review_scores).toEqual(scores)
      expect(payload.review_feedback).toBe(feedback)

      const history = payload.review_history as Array<Record<string, unknown>>
      expect(Array.isArray(history)).toBe(true)
      expect(history.length).toBe(1)
      expect(history[0].action).toBe('request_changes')
      expect(history[0].scores).toEqual(scores)
      expect(history[0].feedback).toBe(feedback)
      expect(history[0].reviewed_by).toBe('admin-user-1')
    })
  })
})
