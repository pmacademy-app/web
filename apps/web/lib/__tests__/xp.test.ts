import { describe, it, expect } from 'vitest'
import {
  calculateLevel,
  calculateQuizXp,
  verifyTheoryReadEngagement,
  getXpAmountForSource,
  LEVEL_THRESHOLDS,
  XP_VALUES,
} from '../xp'

describe('PM Academy XP & Level Engine Test Suite', () => {
  describe('calculateLevel (Level & Career Title Computation)', () => {
    it('returns Level 1 for 0 XP', () => {
      const info = calculateLevel(0)
      expect(info.level).toBe(1)
      expect(info.title).toBe('Associate PM Trainee')
      expect(info.progress).toBe(0)
      expect(info.progressRatio).toBe(0)
      expect(info.xpRemaining).toBe(250)
      expect(info.currentLevelMinXp).toBe(0)
      expect(info.nextLevelMinXp).toBe(250)
    })

    it('returns Level 1 for negative XP gracefully', () => {
      const info = calculateLevel(-100)
      expect(info.level).toBe(1)
      expect(info.title).toBe('Associate PM Trainee')
      expect(info.progress).toBe(0)
      expect(info.xpRemaining).toBe(250)
    })

    it('calculates mid-level progress accurately (Level 2 at 500 XP)', () => {
      const info = calculateLevel(500)
      expect(info.level).toBe(2)
      expect(info.title).toBe('Junior PM')
      expect(info.progress).toBe(50)
      expect(info.progressRatio).toBe(0.5)
      expect(info.xpRemaining).toBe(250)
      expect(info.currentLevelMinXp).toBe(250)
      expect(info.nextLevelMinXp).toBe(750)
    })

    it('handles exact threshold boundaries cleanly', () => {
      const info = calculateLevel(750)
      expect(info.level).toBe(3)
      expect(info.title).toBe('PM')
      expect(info.progress).toBe(0)
      expect(info.xpRemaining).toBe(750)
    })

    it('maps all PRD level titles in exact sequence', () => {
      const expectedTitles = [
        'Associate PM Trainee',
        'Junior PM',
        'PM',
        'Senior PM',
        'Group PM',
        'VP Product',
        'Chief Product Officer',
      ]

      const actualSequence = LEVEL_THRESHOLDS.slice(0, 7).map((t) => t.title)
      expect(actualSequence).toEqual(expectedTitles)
    })

    it('handles maximum level (Level 9 / Chief Product Officer) cleanly', () => {
      const info = calculateLevel(15000)
      expect(info.level).toBe(9)
      expect(info.title).toBe('Chief Product Officer')
      expect(info.progress).toBe(100)
      expect(info.progressRatio).toBe(1.0)
      expect(info.xpRemaining).toBe(0)
    })
  })

  describe('Quiz XP & First-Attempt Perfect Score Bonus', () => {
    it('awards full quiz XP and 25 bonus XP for 15/15 first attempt', () => {
      const result = calculateQuizXp(15, 15, true, 0)
      expect(result.incrementalQuizXp).toBe(75)
      expect(result.perfectBonusXp).toBe(25)
      expect(result.totalXp).toBe(100)
    })

    it('does not award bonus XP for partial score (14/15)', () => {
      const result = calculateQuizXp(14, 15, true, 0)
      expect(result.incrementalQuizXp).toBe(70)
      expect(result.perfectBonusXp).toBe(0)
      expect(result.totalXp).toBe(70)
    })

    it('calculates incremental XP on re-attempt correctly', () => {
      const result = calculateQuizXp(15, 15, false, 50)
      expect(result.incrementalQuizXp).toBe(25)
      expect(result.perfectBonusXp).toBe(0)
      expect(result.totalXp).toBe(25)
    })

    it('returns 0 incremental XP if score does not exceed previous best', () => {
      const result = calculateQuizXp(10, 15, false, 50)
      expect(result.incrementalQuizXp).toBe(0)
      expect(result.totalXp).toBe(0)
    })
  })

  describe('Theory Read Anti-Gaming Engagement Verification', () => {
    it('approves engagement meeting both dwell time and scroll depth', () => {
      const result = verifyTheoryReadEngagement(60, 85, 2)
      expect(result.isEligible).toBe(true)
    })

    it('rejects fast skim with insufficient dwell time (< 45s)', () => {
      const result = verifyTheoryReadEngagement(20, 100, 2)
      expect(result.isEligible).toBe(false)
      expect(result.reason).toMatch(/Minimum active reading time not met/)
    })

    it('rejects insufficient scroll depth (< 80%)', () => {
      const result = verifyTheoryReadEngagement(90, 50, 2)
      expect(result.isEligible).toBe(false)
      expect(result.reason).toMatch(/Insufficient scroll depth/)
    })

    it('rejects invalid negative inputs', () => {
      const result = verifyTheoryReadEngagement(-10, 85, 2)
      expect(result.isEligible).toBe(false)
    })
  })

  describe('Extensible XP Sources', () => {
    it('returns correct XP constants for all source types', () => {
      expect(getXpAmountForSource('theory_read')).toBe(XP_VALUES.THEORY_READ)
      expect(getXpAmountForSource('quiz_correct', { correctCount: 4 })).toBe(20)
      expect(getXpAmountForSource('quiz_bonus')).toBe(XP_VALUES.QUIZ_PERFECT_BONUS)
      expect(getXpAmountForSource('flashcard')).toBe(XP_VALUES.FLASHCARD_REVIEW)
      expect(getXpAmountForSource('reflection')).toBe(XP_VALUES.REFLECTION_SUBMITTED)
      expect(getXpAmountForSource('capstone')).toBe(XP_VALUES.CAPSTONE_SUBMITTED)
      expect(getXpAmountForSource('streak')).toBe(XP_VALUES.DAILY_STREAK_BASE)
    })
  })
})
