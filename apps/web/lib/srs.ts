/**
 * SM-2 Spaced Repetition Algorithm (Architecture.md §1, §6).
 * Standard implementation matching Anki reference specs.
 */

export interface SRSState {
  repetitions: number
  intervalDays: number
  easeFactor: number
}

export type SRSRating = 0 | 1 | 2 | 3 | 4 | 5
// 0: Complete blackout, 1: Incorrect, 2: Hard recall, 3: Pass, 4: Good, 5: Perfect recall

export function calculateSM2(
  rating: SRSRating,
  previousState: SRSState = { repetitions: 0, intervalDays: 0, easeFactor: 2.5 }
): SRSState & { nextReviewAt: Date } {
  let { repetitions, intervalDays, easeFactor } = previousState

  if (rating >= 3) {
    // Successful recall
    if (repetitions === 0) {
      intervalDays = 1
    } else if (repetitions === 1) {
      intervalDays = 6
    } else {
      intervalDays = Math.round(intervalDays * easeFactor)
    }
    repetitions += 1
  } else {
    // Failed recall — reset repetitions and interval
    repetitions = 0
    intervalDays = 1
  }

  // Calculate new Ease Factor: EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  easeFactor = easeFactor + (0.1 - (5 - rating) * (0.08 + (5 - rating) * 0.02))
  if (easeFactor < 1.3) {
    easeFactor = 1.3
  }

  const nextReviewAt = new Date()
  nextReviewAt.setDate(nextReviewAt.getDate() + intervalDays)

  return {
    repetitions,
    intervalDays,
    easeFactor: Number(easeFactor.toFixed(2)),
    nextReviewAt,
  }
}
