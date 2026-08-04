/**
 * SM-2 Spaced Repetition Algorithm (PRD.md §4.4, Architecture.md §1, §6).
 * Pure functions matching Anki reference specs. Isolated from UI.
 */

export interface SRSState {
  repetitions: number
  intervalDays: number
  easeFactor: number
}

export type SRSRating = 0 | 1 | 2 | 3 | 4 | 5
// 0: Complete blackout, 1: Incorrect, 2: Difficult, 3: Pass, 4: Good, 5: Perfect recall

export interface FlashcardItem {
  id: string
  lessonId: string
  front: string
  back: string
  concept?: string
  module?: string
}

export interface UserFlashcardSRSRow {
  user_id: string
  flashcard_id: string
  ease_factor: number
  interval_days: number
  repetitions: number
  next_review_at: string
  created_at?: string
  updated_at?: string
}

export interface ReviewStats {
  dueTodayCount: number
  upcomingCount: number
  completedTodayCount: number
  totalUnlockedCount: number
  averageRecallQuality: number
}

export interface ProcessedReviewResult extends SRSState {
  nextReviewAt: Date
  isPassed: boolean
}

/**
 * Calculates new Ease Factor: EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
 * Floor clamped strictly at 1.3.
 */
export function updateEaseFactor(currentEaseFactor: number, rating: SRSRating): number {
  const newEf = currentEaseFactor + (0.1 - (5 - rating) * (0.08 + (5 - rating) * 0.02))
  return Number(Math.max(1.3, newEf).toFixed(2))
}

/**
 * Calculates interval in days based on repetitions count, ease factor, and rating.
 */
export function calculateInterval(
  repetitions: number,
  easeFactor: number,
  rating: SRSRating
): { newRepetitions: number; newIntervalDays: number } {
  if (rating < 3) {
    // Failed recall: reset repetitions to 0 and interval to 1 day
    return { newRepetitions: 0, newIntervalDays: 1 }
  }

  // Successful recall (rating >= 3)
  if (repetitions === 0) {
    return { newRepetitions: 1, newIntervalDays: 1 }
  }
  if (repetitions === 1) {
    return { newRepetitions: 2, newIntervalDays: 6 }
  }

  const newInterval = Math.round((repetitions === 2 ? 6 : 1) * Math.pow(easeFactor, repetitions - 1))
  return {
    newRepetitions: repetitions + 1,
    newIntervalDays: Math.max(1, Math.round(newInterval)),
  }
}

/**
 * Core SM-2 algorithm function. Given a rating and previous state, returns next state & review date.
 */
export function calculateSM2(
  rating: SRSRating,
  previousState: SRSState = { repetitions: 0, intervalDays: 0, easeFactor: 2.5 }
): ProcessedReviewResult {
  const clampedRating = Math.min(5, Math.max(0, Math.round(rating))) as SRSRating
  const { repetitions, easeFactor } = previousState

  let newRepetitions = repetitions
  let newIntervalDays = 1

  if (clampedRating >= 3) {
    if (repetitions === 0) {
      newIntervalDays = 1
    } else if (repetitions === 1) {
      newIntervalDays = 6
    } else {
      newIntervalDays = Math.max(1, Math.round(previousState.intervalDays * easeFactor))
    }
    newRepetitions += 1
  } else {
    newRepetitions = 0
    newIntervalDays = 1
  }

  const newEaseFactor = updateEaseFactor(easeFactor, clampedRating)
  const nextReviewAt = new Date()
  nextReviewAt.setDate(nextReviewAt.getDate() + newIntervalDays)

  return {
    repetitions: newRepetitions,
    intervalDays: newIntervalDays,
    easeFactor: newEaseFactor,
    nextReviewAt,
    isPassed: clampedRating >= 3,
  }
}

/**
 * Filters due cards scheduled on or before given date/time, plus unreviewed new cards.
 */
export function getDueCards(
  allUnlockedCards: FlashcardItem[],
  srsRecordsMap: Map<string, UserFlashcardSRSRow>,
  now: Date = new Date()
): FlashcardItem[] {
  const nowTime = now.getTime()

  return allUnlockedCards.filter((card) => {
    const record = srsRecordsMap.get(card.id)
    if (!record) {
      // Unreviewed card: due immediately!
      return true
    }

    const reviewTime = new Date(record.next_review_at).getTime()
    return reviewTime <= nowTime
  })
}

/**
 * Counts cards scheduled for review after current date/time.
 */
export function getUpcomingReviewsCount(
  allUnlockedCards: FlashcardItem[],
  srsRecordsMap: Map<string, UserFlashcardSRSRow>,
  now: Date = new Date()
): number {
  const nowTime = now.getTime()

  return allUnlockedCards.filter((card) => {
    const record = srsRecordsMap.get(card.id)
    if (!record) return false
    const reviewTime = new Date(record.next_review_at).getTime()
    return reviewTime > nowTime
  }).length
}

/**
 * Aggregates review metrics for user dashboard and review statistics.
 */
export function calculateReviewStats(
  allUnlockedCards: FlashcardItem[],
  srsRecordsMap: Map<string, UserFlashcardSRSRow>,
  completedTodayCount: number = 0,
  now: Date = new Date()
): ReviewStats {
  const dueTodayCount = getDueCards(allUnlockedCards, srsRecordsMap, now).length
  const upcomingCount = getUpcomingReviewsCount(allUnlockedCards, srsRecordsMap, now)

  let totalEase = 0
  let evaluatedCount = 0

  for (const record of srsRecordsMap.values()) {
    totalEase += record.ease_factor
    evaluatedCount += 1
  }

  const averageRecallQuality = evaluatedCount > 0 ? Number((totalEase / evaluatedCount).toFixed(2)) : 2.5

  return {
    dueTodayCount,
    upcomingCount,
    completedTodayCount,
    totalUnlockedCount: allUnlockedCards.length,
    averageRecallQuality,
  }
}

