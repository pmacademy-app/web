import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  calculateSM2,
  updateEaseFactor,
  calculateInterval,
  getDueCards,
  getUpcomingReviewsCount,
  calculateReviewStats,
  FlashcardItem,
  UserFlashcardSRSRow,
} from '../srs'

describe('PM Academy SM-2 Spaced Repetition Engine Test Suite', () => {
  describe('Ease Factor Calculations', () => {
    it('increases ease factor on perfect recall (rating 5)', () => {
      const newEf = updateEaseFactor(2.5, 5)
      assert.strictEqual(newEf, 2.6)
    })

    it('decreases ease factor on failed recall (rating 0)', () => {
      const newEf = updateEaseFactor(2.5, 0)
      assert.strictEqual(newEf, 1.7)
    })

    it('strictly clamps ease factor floor at 1.3', () => {
      let ef = 1.4
      ef = updateEaseFactor(ef, 0)
      assert.strictEqual(ef, 1.3)

      // Multiple bad ratings should stay at 1.3 minimum
      ef = updateEaseFactor(ef, 0)
      assert.strictEqual(ef, 1.3)
    })
  })

  describe('SM-2 Interval & Repetition Progression', () => {
    it('schedules 1-day interval on first successful review (rep 0 -> 1)', () => {
      const intervalRes = calculateInterval(0, 2.5, 4)
      assert.strictEqual(intervalRes.newRepetitions, 1)
      assert.strictEqual(intervalRes.newIntervalDays, 1)

      const result = calculateSM2(4, { repetitions: 0, intervalDays: 0, easeFactor: 2.5 })
      assert.strictEqual(result.repetitions, 1)
      assert.strictEqual(result.intervalDays, 1)
      assert.strictEqual(result.isPassed, true)
    })

    it('schedules 6-day interval on second successful review (rep 1 -> 2)', () => {
      const result = calculateSM2(4, { repetitions: 1, intervalDays: 1, easeFactor: 2.5 })
      assert.strictEqual(result.repetitions, 2)
      assert.strictEqual(result.intervalDays, 6)
      assert.strictEqual(result.isPassed, true)
    })

    it('multiplies interval by ease factor on third successful review (rep 2 -> 3)', () => {
      const result = calculateSM2(4, { repetitions: 2, intervalDays: 6, easeFactor: 2.5 })
      assert.strictEqual(result.repetitions, 3)
      assert.strictEqual(result.intervalDays, 15) // Math.round(6 * 2.5) = 15
      assert.strictEqual(result.isPassed, true)
    })

    it('resets repetitions to 0 and interval to 1 on failed recall (rating < 3)', () => {
      const resultFail = calculateSM2(1, { repetitions: 4, intervalDays: 30, easeFactor: 2.5 })
      assert.strictEqual(resultFail.repetitions, 0)
      assert.strictEqual(resultFail.intervalDays, 1)
      assert.strictEqual(resultFail.isPassed, false)
    })
  })

  describe('Due Cards & Queue Filtering', () => {
    const mockUnlockedCards: FlashcardItem[] = [
      { id: 'card_1', lessonId: 'les_1', front: 'Front 1', back: 'Back 1' },
      { id: 'card_2', lessonId: 'les_1', front: 'Front 2', back: 'Back 2' },
      { id: 'card_3', lessonId: 'les_2', front: 'Front 3', back: 'Back 3' },
    ]

    it('marks unreviewed cards as due immediately', () => {
      const srsMap = new Map<string, UserFlashcardSRSRow>()
      const due = getDueCards(mockUnlockedCards, srsMap, new Date())

      assert.strictEqual(due.length, 3)
    })

    it('filters out future-scheduled cards from due queue', () => {
      const now = new Date('2026-08-05T12:00:00Z')
      const pastDate = new Date('2026-08-04T12:00:00Z').toISOString()
      const futureDate = new Date('2026-08-08T12:00:00Z').toISOString()

      const srsMap = new Map<string, UserFlashcardSRSRow>([
        ['card_1', { user_id: 'u1', flashcard_id: 'card_1', ease_factor: 2.5, interval_days: 1, repetitions: 1, next_review_at: pastDate }],
        ['card_2', { user_id: 'u1', flashcard_id: 'card_2', ease_factor: 2.5, interval_days: 5, repetitions: 2, next_review_at: futureDate }],
      ])

      const due = getDueCards(mockUnlockedCards, srsMap, now)
      assert.strictEqual(due.length, 2) // card_1 (past due) + card_3 (new/unreviewed)
      assert.strictEqual(due[0].id, 'card_1')
      assert.strictEqual(due[1].id, 'card_3')

      const upcomingCount = getUpcomingReviewsCount(mockUnlockedCards, srsMap, now)
      assert.strictEqual(upcomingCount, 1) // card_2 is scheduled in the future
    })
  })

  describe('Review Statistics Aggregation', () => {
    it('aggregates review metrics accurately', () => {
      const mockUnlockedCards: FlashcardItem[] = [
        { id: 'card_1', lessonId: 'les_1', front: 'F1', back: 'B1' },
        { id: 'card_2', lessonId: 'les_1', front: 'F2', back: 'B2' },
      ]

      const srsMap = new Map<string, UserFlashcardSRSRow>([
        ['card_1', { user_id: 'u1', flashcard_id: 'card_1', ease_factor: 2.7, interval_days: 6, repetitions: 2, next_review_at: '2026-08-10T00:00:00Z' }],
      ])

      const stats = calculateReviewStats(mockUnlockedCards, srsMap, 5, new Date('2026-08-05T00:00:00Z'))

      assert.strictEqual(stats.totalUnlockedCount, 2)
      assert.strictEqual(stats.completedTodayCount, 5)
      assert.strictEqual(stats.averageRecallQuality, 2.7)
    })
  })
})
