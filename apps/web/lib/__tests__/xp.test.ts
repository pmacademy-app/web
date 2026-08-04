import { describe, it } from 'node:test'
import assert from 'node:assert'
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
      assert.strictEqual(info.level, 1)
      assert.strictEqual(info.title, 'Associate PM Trainee')
      assert.strictEqual(info.progress, 0)
      assert.strictEqual(info.progressRatio, 0)
      assert.strictEqual(info.xpRemaining, 250)
      assert.strictEqual(info.currentLevelMinXp, 0)
      assert.strictEqual(info.nextLevelMinXp, 250)
    })

    it('returns Level 1 for negative XP gracefully', () => {
      const info = calculateLevel(-100)
      assert.strictEqual(info.level, 1)
      assert.strictEqual(info.title, 'Associate PM Trainee')
      assert.strictEqual(info.progress, 0)
      assert.strictEqual(info.xpRemaining, 250)
    })

    it('calculates mid-level progress accurately (Level 2 at 500 XP)', () => {
      // Level 2 range: 250 to 750 (diff: 500 XP). 500 XP total = 250 XP into level = 50%
      const info = calculateLevel(500)
      assert.strictEqual(info.level, 2)
      assert.strictEqual(info.title, 'Junior PM')
      assert.strictEqual(info.progress, 50)
      assert.strictEqual(info.progressRatio, 0.5)
      assert.strictEqual(info.xpRemaining, 250)
      assert.strictEqual(info.currentLevelMinXp, 250)
      assert.strictEqual(info.nextLevelMinXp, 750)
    })

    it('handles exact threshold boundaries cleanly', () => {
      // Level 3 threshold: 750 XP
      const info = calculateLevel(750)
      assert.strictEqual(info.level, 3)
      assert.strictEqual(info.title, 'PM')
      assert.strictEqual(info.progress, 0)
      assert.strictEqual(info.xpRemaining, 750) // Next is Level 4 at 1500 XP (diff 750)
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
      assert.deepStrictEqual(actualSequence, expectedTitles)
    })

    it('handles maximum level (Level 9 / Chief Product Officer) cleanly', () => {
      const info = calculateLevel(15000)
      assert.strictEqual(info.level, 9)
      assert.strictEqual(info.title, 'Chief Product Officer')
      assert.strictEqual(info.progress, 100)
      assert.strictEqual(info.progressRatio, 1.0)
      assert.strictEqual(info.xpRemaining, 0)
    })
  })

  describe('Quiz XP & First-Attempt Perfect Score Bonus', () => {
    it('awards full quiz XP and 25 bonus XP for 15/15 first attempt', () => {
      const result = calculateQuizXp(15, 15, true, 0)
      assert.strictEqual(result.incrementalQuizXp, 75)
      assert.strictEqual(result.perfectBonusXp, 25)
      assert.strictEqual(result.totalXp, 100)
    })

    it('does not award bonus XP for partial score (14/15)', () => {
      const result = calculateQuizXp(14, 15, true, 0)
      assert.strictEqual(result.incrementalQuizXp, 70)
      assert.strictEqual(result.perfectBonusXp, 0)
      assert.strictEqual(result.totalXp, 70)
    })

    it('calculates incremental XP on re-attempt correctly', () => {
      // Previously earned 50 XP (10 correct). Now gets 15 correct (75 XP). Incremental = 25 XP.
      const result = calculateQuizXp(15, 15, false, 50)
      assert.strictEqual(result.incrementalQuizXp, 25)
      assert.strictEqual(result.perfectBonusXp, 0)
      assert.strictEqual(result.totalXp, 25)
    })

    it('returns 0 incremental XP if score does not exceed previous best', () => {
      const result = calculateQuizXp(10, 15, false, 50)
      assert.strictEqual(result.incrementalQuizXp, 0)
      assert.strictEqual(result.totalXp, 0)
    })
  })

  describe('Theory Read Anti-Gaming Engagement Verification', () => {
    it('approves engagement meeting both dwell time and scroll depth', () => {
      const result = verifyTheoryReadEngagement(60, 85, 2)
      assert.strictEqual(result.isEligible, true)
    })

    it('rejects fast skim with insufficient dwell time (< 45s)', () => {
      const result = verifyTheoryReadEngagement(20, 100, 2)
      assert.strictEqual(result.isEligible, false)
      assert.match(result.reason || '', /Minimum active reading time not met/)
    })

    it('rejects insufficient scroll depth (< 80%)', () => {
      const result = verifyTheoryReadEngagement(90, 50, 2)
      assert.strictEqual(result.isEligible, false)
      assert.match(result.reason || '', /Insufficient scroll depth/)
    })

    it('rejects invalid negative inputs', () => {
      const result = verifyTheoryReadEngagement(-10, 85, 2)
      assert.strictEqual(result.isEligible, false)
    })
  })

  describe('Extensible XP Sources', () => {
    it('returns correct XP constants for all source types', () => {
      assert.strictEqual(getXpAmountForSource('theory_read'), XP_VALUES.THEORY_READ)
      assert.strictEqual(
        getXpAmountForSource('quiz_correct', { correctCount: 4 }),
        20
      )
      assert.strictEqual(getXpAmountForSource('quiz_bonus'), XP_VALUES.QUIZ_PERFECT_BONUS)
      assert.strictEqual(getXpAmountForSource('flashcard'), XP_VALUES.FLASHCARD_REVIEW)
      assert.strictEqual(getXpAmountForSource('reflection'), XP_VALUES.REFLECTION_SUBMITTED)
      assert.strictEqual(getXpAmountForSource('capstone'), XP_VALUES.CAPSTONE_SUBMITTED)
      assert.strictEqual(getXpAmountForSource('streak'), XP_VALUES.DAILY_STREAK_BASE)
    })
  })
})
