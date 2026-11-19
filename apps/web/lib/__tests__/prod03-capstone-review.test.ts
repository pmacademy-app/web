import { describe, expect, it } from 'vitest'

import {
  capstoneReviewSchema,
  validateRubricScores,
} from '@/lib/capstones/rubric'
import {
  getLatestReviewAction,
  validateCapstoneTransition,
} from '@/lib/capstones'

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

})
