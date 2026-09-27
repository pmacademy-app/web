/**
 * Phase 3 — First Session / Activation Test Suite
 *
 * Guards the Phase 3 behavioural changes described in docs/IMPLEMENTATION_PLAN.md §Phase 3:
 *   3.2  The lesson-completion screen renders on quiz completion (not only reflection).
 *   3.3  The completion CTA names the next lesson when it is known.
 *   3.6  Flashcards unlock after theory is read (retrieval practice before the quiz),
 *        while reflection stays gated on lesson completion; the flashcard-deck advance
 *        never jumps to a still-locked reflection tab.
 *
 * These exercise the real exported helpers from the lesson shell so the tests track the
 * shipped code rather than a re-implementation of its logic. (3.1 onboarding routing and
 * 3.4 theory-gate feedback are verified in the onboarding and T4 suites respectively.)
 */

import { describe, it, expect } from 'vitest'
import {
  isTabUnlocked,
  lessonCompletedFromQuiz,
  flashcardsAdvanceTarget,
  nextLessonCtaLabel,
} from '@/app/(app)/academy/[moduleSlug]/[lessonId]/lesson-content'
import type { LessonProgressV2 } from '@/hooks/use-lesson-progress-v2'
import {
  ONBOARDING_PRIMARY_DESTINATION,
  ONBOARDING_SECONDARY_DESTINATION,
} from '@/app/onboarding/onboarding-destinations'

const progress = (overrides: Partial<LessonProgressV2>): LessonProgressV2 => ({
  status: 'not_started',
  theory_read_at: null,
  quiz_score: null,
  quiz_attempts: 0,
  xp_earned: 0,
  completed_at: null,
  ...overrides,
})

describe('Phase 3 — First Session / Activation', () => {
  describe('3.1 — onboarding routes to the lowest-friction first action', () => {
    it('sends the dominant CTA to the dashboard kickoff card, not the raw curriculum', () => {
      expect(ONBOARDING_PRIMARY_DESTINATION).toBe('/dashboard')
      expect(ONBOARDING_SECONDARY_DESTINATION).toBe('/academy')
      expect(ONBOARDING_PRIMARY_DESTINATION).not.toBe(ONBOARDING_SECONDARY_DESTINATION)
    })
  })

  describe('3.2 — completion screen renders on quiz completion', () => {
    it('treats a completed quiz submission as lesson completion', () => {
      expect(lessonCompletedFromQuiz({ isCompleted: true })).toBe(true)
      expect(lessonCompletedFromQuiz({ success: true })).toBe(true)
      expect(lessonCompletedFromQuiz({ isCompleted: true, success: false })).toBe(true)
    })

    it('does not complete on an unsuccessful / non-completing submission', () => {
      expect(lessonCompletedFromQuiz({ isCompleted: false, success: false })).toBe(false)
      expect(lessonCompletedFromQuiz({})).toBe(false)
      expect(lessonCompletedFromQuiz(null)).toBe(false)
      expect(lessonCompletedFromQuiz(undefined)).toBe(false)
    })
  })

  describe('3.3 — completion CTA points to the next lesson', () => {
    it('names the next lesson when its title is known', () => {
      expect(nextLessonCtaLabel('Product Discovery')).toBe('Next Lesson: Product Discovery →')
    })

    it('falls back to a generic label when no next-lesson title is available', () => {
      expect(nextLessonCtaLabel(null)).toBe('Continue to Next Lesson →')
      expect(nextLessonCtaLabel(undefined)).toBe('Continue to Next Lesson →')
      expect(nextLessonCtaLabel('')).toBe('Continue to Next Lesson →')
    })
  })

  describe('3.6 — flashcards unlock after theory, reflection stays post-completion', () => {
    it('keeps flashcards and reflection locked before theory is read', () => {
      const started = progress({ status: 'in_progress', theory_read_at: null })
      expect(isTabUnlocked('flashcards', started)).toBe(false)
      expect(isTabUnlocked('reflection', started)).toBe(false)
    })

    it('unlocks flashcards once theory is read but keeps reflection locked until completion', () => {
      const theoryRead = progress({
        status: 'in_progress',
        theory_read_at: '2026-09-25T12:00:00.000Z',
      })
      expect(isTabUnlocked('quiz', theoryRead)).toBe(true)
      expect(isTabUnlocked('flashcards', theoryRead)).toBe(true)
      expect(isTabUnlocked('reflection', theoryRead)).toBe(false)
    })

    it('unlocks reflection only when the lesson is completed', () => {
      const completed = progress({
        status: 'completed',
        theory_read_at: '2026-09-25T12:00:00.000Z',
        completed_at: '2026-09-25T12:05:00.000Z',
      })
      expect(isTabUnlocked('flashcards', completed)).toBe(true)
      expect(isTabUnlocked('reflection', completed)).toBe(true)
    })

    it('advances the flashcard deck to reflection only when reflection is unlocked', () => {
      // Reached flashcards before completing the lesson → go on to the quiz.
      expect(flashcardsAdvanceTarget(false)).toBe('quiz')
      // Revisiting a completed lesson → reflection is available.
      expect(flashcardsAdvanceTarget(true)).toBe('reflection')
    })
  })
})
