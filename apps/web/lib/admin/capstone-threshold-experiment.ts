/**
 * Phase 7 — capstone threshold experiment measurement (server-side, Phase 2 funnel layer).
 *
 * The plan mandates the existing server-side Phase 2 funnel (not GA4) as the authoritative
 * measurement layer, and to "prefer deriving metrics from existing progress tables". Because the
 * experiment assignment is a DETERMINISTIC function of `users.id` + `users.created_at`
 * (see `lib/capstone-threshold-experiment.ts`), the treatment/control cohorts are reconstructed
 * with NO persisted assignment and NO new event stream: every metric below is derived from
 * `capstone_submissions` and `user_lesson_progress` (+ `users.created_at`) that the platform
 * already writes.
 *
 * This module is a pure aggregator. The caller assembles one row per learner from those tables and
 * this module segments the rows by the deterministic variant and computes the metrics. The key
 * question it answers is the blueprint's: *does earlier access to application (a lower threshold)
 * cause more learners to actually produce a PM artifact and subsequently stay engaged?*
 *
 * Measurement notes:
 *   - Capstone *visibility/impressions* leave no row (the preview is rendered inline in the lesson
 *     and capstone pages). Rather than add an event stream, visibility is proxied by the eligible
 *     population and by reach of lesson 1; the true impression signal is intentionally omitted here
 *     — see docs/decisions/ADR-009-phase-7-make-payoff-visible.md for the rationale and the follow-up option.
 *   - "capstone submission start" = a draft exists; "completion" = submitted; "review completion" =
 *     reviewed. All three are statuses already stored on `capstone_submissions`.
 */

import {
  getCapstoneThresholdConfig,
  getCapstoneThresholdVariant,
  getRequiredLessonsForVariant,
  type CapstoneThresholdConfig,
  type CapstoneThresholdVariant,
} from '@/lib/capstone-threshold-experiment'

/** One row per learner in the cohort window, assembled from existing tables. */
export interface CapstoneThresholdExperimentUserRow {
  userId: string
  createdAt: string | null
  /** Completed lessons in the primary module (foundations / capstone-1). Drives eligibility. */
  module1LessonsCompleted: number
  /** A draft or submission exists for capstone-1 (submission START). */
  capstone1Started: boolean
  /** Capstone-1 is submitted or reviewed (submission COMPLETION) — the PRIMARY metric input. */
  capstone1Submitted: boolean
  /** Capstone-1 has been reviewed by an admin (review COMPLETION). */
  capstone1Reviewed: boolean
  /** The learner has submitted at least one capstone in any module. */
  anyCapstoneSubmitted: boolean
  /** Lessons completed within 30 days of signup — the retention / subsequent-activity input. */
  lessonsCompletedD30: number
}

export interface CapstoneThresholdCohortMetrics {
  /** Number of learners in this cohort. */
  n: number
  /** The eligibility gate applied to this cohort (8 control / lower treatment). */
  requiredLessons: number
  /** Share eligible for capstone-1 under this cohort's gate (visibility→eligibility conversion). */
  eligibilityRate: number
  /** Share who started capstone-1 (draft or submission). */
  capstone1StartRate: number
  /** PRIMARY: share who submitted capstone-1. */
  capstone1SubmissionRate: number
  /** Share whose capstone-1 has been reviewed. */
  capstone1ReviewRate: number
  /** Share who submitted any capstone. */
  anyCapstoneSubmissionRate: number
  /** RETENTION proxy: mean lessons completed per learner at D30. */
  meanLessonsCompletedD30: number
}

export interface CapstoneThresholdExperimentSummary {
  control: CapstoneThresholdCohortMetrics
  treatment: CapstoneThresholdCohortMetrics
}

interface CohortAcc {
  n: number
  eligible: number
  started: number
  submitted: number
  reviewed: number
  anySubmitted: number
  lessonsD30: number
}

function emptyCohort(): CohortAcc {
  return { n: 0, eligible: 0, started: 0, submitted: 0, reviewed: 0, anySubmitted: 0, lessonsD30: 0 }
}

function finalize(acc: CohortAcc, requiredLessons: number): CapstoneThresholdCohortMetrics {
  const rate = (num: number, den: number) => (den > 0 ? num / den : 0)
  return {
    n: acc.n,
    requiredLessons,
    eligibilityRate: rate(acc.eligible, acc.n),
    capstone1StartRate: rate(acc.started, acc.n),
    capstone1SubmissionRate: rate(acc.submitted, acc.n),
    capstone1ReviewRate: rate(acc.reviewed, acc.n),
    anyCapstoneSubmissionRate: rate(acc.anySubmitted, acc.n),
    meanLessonsCompletedD30: rate(acc.lessonsD30, acc.n),
  }
}

/**
 * Assigns each learner to their deterministic variant and computes the Phase 7 capstone metrics
 * per cohort. Pure — the same config the app runs with (or an explicit one for back-testing a
 * different cohort/split) reproduces the exact assignment.
 */
export function computeCapstoneThresholdExperimentSummary(
  rows: CapstoneThresholdExperimentUserRow[],
  config: CapstoneThresholdConfig = getCapstoneThresholdConfig()
): CapstoneThresholdExperimentSummary {
  const buckets: Record<CapstoneThresholdVariant, CohortAcc> = {
    control: emptyCohort(),
    treatment: emptyCohort(),
  }

  for (const row of rows) {
    // Segment the WHOLE cohort window by the treatment the learner *would* receive, so an off flag
    // does not collapse everyone into control and hide the comparison. When the experiment is live,
    // the same call reproduces the exact runtime assignment.
    const variant = getCapstoneThresholdVariant(
      { id: row.userId, createdAt: row.createdAt },
      { ...config, enabled: true }
    )
    const requiredLessons = getRequiredLessonsForVariant(variant, config)
    const acc = buckets[variant]
    acc.n += 1
    if (row.module1LessonsCompleted >= requiredLessons) acc.eligible += 1
    if (row.capstone1Started) acc.started += 1
    if (row.capstone1Submitted) acc.submitted += 1
    if (row.capstone1Reviewed) acc.reviewed += 1
    if (row.anyCapstoneSubmitted) acc.anySubmitted += 1
    acc.lessonsD30 += row.lessonsCompletedD30
  }

  return {
    control: finalize(buckets.control, getRequiredLessonsForVariant('control', config)),
    treatment: finalize(buckets.treatment, getRequiredLessonsForVariant('treatment', config)),
  }
}
