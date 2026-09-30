/**
 * Phase 8.2 — capstone review aging (pure, server- and client-safe).
 *
 * Gives the admin queue honest visibility into how long submissions have waited for review, using
 * ONLY the real `submitted_at` / `reviewed_at` timestamps. It invents no SLA: the tiers below
 * describe *elapsed time* ("aging" = has been waiting a while), they are NOT a promised turnaround
 * window and must not be presented as a deadline. A real SLA is deferred (Phase 8.3) until enough
 * `reviewed_at` turnaround data exists to commit to one from observed capacity.
 *
 * The tier boundaries are descriptive buckets for sorting/emphasis only. They are intentionally
 * generic (day-scale) and carry no contractual meaning.
 */

export type ReviewAgeTier = 'fresh' | 'waiting' | 'aging' | 'reviewed'

export interface ReviewAge {
  /** Whole days since submission (to review, or to `now` if still unreviewed). */
  days: number
  /** Whether the submission is still awaiting its first review. */
  awaitingReview: boolean
  /** Descriptive tier — elapsed-time bucket for emphasis/sort, NOT an SLA. */
  tier: ReviewAgeTier
  /** Short human label, e.g. "Waiting 5d", "Reviewed after 2d", "Submitted today". */
  label: string
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Descriptive day-scale boundaries for the "waiting" vs "aging" emphasis. Not an SLA. */
export const REVIEW_AGE_WAITING_DAYS = 3
export const REVIEW_AGE_AGING_DAYS = 7

function wholeDaysBetween(fromMs: number, toMs: number): number {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 0
  return Math.max(0, Math.floor((toMs - fromMs) / MS_PER_DAY))
}

/**
 * Computes the age of a capstone submission relative to review.
 *
 * @param submittedAt ISO timestamp the learner submitted.
 * @param reviewedAt  ISO timestamp of the first review, or null/undefined if still awaiting review.
 * @param now         Reference time (defaults to now); injectable for deterministic tests.
 */
export function computeReviewAge(
  submittedAt: string | null | undefined,
  reviewedAt?: string | null,
  now: Date = new Date()
): ReviewAge {
  const submittedMs = submittedAt ? Date.parse(submittedAt) : NaN
  const awaitingReview = !reviewedAt

  if (!Number.isFinite(submittedMs)) {
    return { days: 0, awaitingReview, tier: awaitingReview ? 'waiting' : 'reviewed', label: awaitingReview ? 'Waiting' : 'Reviewed' }
  }

  if (!awaitingReview) {
    const reviewedMs = Date.parse(reviewedAt as string)
    const days = Number.isFinite(reviewedMs) ? wholeDaysBetween(submittedMs, reviewedMs) : 0
    return {
      days,
      awaitingReview: false,
      tier: 'reviewed',
      label: days === 0 ? 'Reviewed same day' : `Reviewed after ${days}d`,
    }
  }

  const days = wholeDaysBetween(submittedMs, now.getTime())
  const tier: ReviewAgeTier =
    days >= REVIEW_AGE_AGING_DAYS ? 'aging' : days >= REVIEW_AGE_WAITING_DAYS ? 'waiting' : 'fresh'
  const label = days === 0 ? 'Submitted today' : `Waiting ${days}d`
  return { days, awaitingReview: true, tier, label }
}
