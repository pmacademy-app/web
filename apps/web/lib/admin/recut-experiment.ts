/**
 * Phase 4 — recut ("unit of work") experiment measurement (server-side, Phase 2 funnel layer).
 *
 * Phase 8.1 completes the readout trio: the recut (`lib/academy/experiment.ts`) shipped as an
 * assignment-only mechanism with NO aggregator, so — unlike the Phase 6 module-entry unlock and the
 * Phase 7 capstone threshold — it could not be concluded. This module mirrors those two aggregators
 * exactly so all three experiments read the same way in one admin surface.
 *
 * The recut splits the lesson unit itself: treatment learners see a shorter "Core" reading path
 * plus an OPTIONAL "Deep dive", and a trimmed quiz; control sees the full lesson + 15-question quiz.
 * The blueprint's question is whether re-cutting the unit into smaller pieces increases *throughput*
 * (lessons completed) without silently hollowing out depth (learners never opening the deep dive).
 *
 * Because assignment is a DETERMINISTIC function of `users.id` (see `getRecutVariant`), the arms are
 * reconstructed with NO persisted assignment and NO new event stream: every metric below is derived
 * from `user_lesson_progress` (+ `users.created_at`) that the platform already writes. This module is
 * a pure aggregator — the caller assembles one row per learner and this file segments the rows by the
 * deterministic variant and computes the metrics.
 */

import {
  getRecutExperimentConfig,
  getRecutVariant,
  type RecutExperimentConfig,
  type RecutVariant,
} from '@/lib/academy/experiment'

/** One row per learner in the cohort window, assembled from existing progress tables. */
export interface RecutExperimentUserRow {
  userId: string
  createdAt: string | null
  /** Total completed lessons (all-time) — throughput volume. */
  lessonsCompleted: number
  /** Completed lessons within 30 days of signup — the PRIMARY throughput metric input. */
  lessonsCompletedD30: number
  /** Whether the learner completed at least one lesson — the activation GUARDRAIL input. */
  firstLessonCompleted: boolean
  /** Whether the learner ever opened a lesson's optional "Deep dive" — the depth guardrail. */
  deepDiveOpened: boolean
}

export interface RecutCohortMetrics {
  /** Number of learners in this cohort. */
  n: number
  /** PRIMARY: mean lessons completed per learner at D30. */
  meanLessonsCompletedD30: number
  /** Mean lessons completed per learner (all-time volume). */
  meanLessonsCompleted: number
  /** GUARDRAIL: share who completed at least one lesson (must not fall vs control). */
  firstLessonCompletionRate: number
  /** DEPTH guardrail: share who opened a deep dive at least once (treatment-specific behaviour). */
  deepDiveOpenRate: number
}

export interface RecutExperimentSummary {
  control: RecutCohortMetrics
  treatment: RecutCohortMetrics
}

interface CohortAcc {
  n: number
  lessons: number
  lessonsD30: number
  firstLesson: number
  deepDive: number
}

function emptyCohort(): CohortAcc {
  return { n: 0, lessons: 0, lessonsD30: 0, firstLesson: 0, deepDive: 0 }
}

function finalize(acc: CohortAcc): RecutCohortMetrics {
  const rate = (num: number, den: number) => (den > 0 ? num / den : 0)
  return {
    n: acc.n,
    meanLessonsCompletedD30: rate(acc.lessonsD30, acc.n),
    meanLessonsCompleted: rate(acc.lessons, acc.n),
    firstLessonCompletionRate: rate(acc.firstLesson, acc.n),
    deepDiveOpenRate: rate(acc.deepDive, acc.n),
  }
}

/**
 * Assigns each learner to their deterministic recut variant and computes the throughput,
 * activation-guardrail and depth-guardrail metrics per cohort. Pure — the same config the app runs
 * with (or an explicit one for back-testing a different split) reproduces the exact assignment.
 */
export function computeRecutExperimentSummary(
  rows: RecutExperimentUserRow[],
  config: RecutExperimentConfig = getRecutExperimentConfig()
): RecutExperimentSummary {
  const buckets: Record<RecutVariant, CohortAcc> = {
    control: emptyCohort(),
    treatment: emptyCohort(),
  }

  for (const row of rows) {
    // Segment the WHOLE cohort window by the treatment the learner *would* receive, so an off flag
    // does not collapse everyone into control and hide the comparison. When the experiment is live,
    // the same call reproduces the exact runtime assignment.
    const variant = getRecutVariant(row.userId, { ...config, enabled: true })
    const acc = buckets[variant]
    acc.n += 1
    acc.lessons += row.lessonsCompleted
    acc.lessonsD30 += row.lessonsCompletedD30
    if (row.firstLessonCompleted) acc.firstLesson += 1
    if (row.deepDiveOpened) acc.deepDive += 1
  }

  return { control: finalize(buckets.control), treatment: finalize(buckets.treatment) }
}
