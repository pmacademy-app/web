/**
 * Phase 6 — module-entry unlock experiment measurement (server-side, Phase 2 funnel layer).
 *
 * The plan mandates the existing server-side Phase 2 funnel (not GA4) as the authoritative
 * measurement layer, and to "prefer deriving metrics from existing progress tables". Because
 * the experiment assignment is a DETERMINISTIC function of `users.id` + `users.created_at`
 * (see `lib/academy/module-entry-unlock.ts`), the treatment/control cohorts can be
 * reconstructed with NO persisted assignment and NO new event stream: every metric below is
 * derived from `user_lesson_progress` (+ `users.created_at`) that the platform already writes.
 *
 * This module is a pure aggregator. The caller assembles one row per learner from a query like:
 *
 *   SELECT u.id, u.created_at,
 *     COUNT(*) FILTER (WHERE p.status='completed'
 *       AND p.completed_at <= u.created_at + interval '30 days')      AS lessons_completed_d30,
 *     BOOL_OR(p.status='completed' AND <first-lesson id>)             AS first_lesson_completed,
 *     ...                                                             AS module1_completed, etc.
 *   FROM users u LEFT JOIN user_lesson_progress p ON p.user_id = u.id
 *   WHERE u.created_at >= <cohort start>
 *   GROUP BY u.id;
 *
 * and this module segments those rows by the deterministic variant and computes the metrics.
 *
 * The ONE signal that is NOT derivable from progress rows is a lock-screen impression (a lock
 * view leaves no row). It is intentionally left out here rather than adding a new event stream;
 * see docs/decisions/ for the rationale and the follow-up option.
 */

import {
  getModuleEntryUnlockConfig,
  getModuleEntryUnlockVariant,
  type ModuleEntryUnlockConfig,
  type ModuleEntryUnlockVariant,
} from '@/lib/academy/module-entry-unlock'

/** One row per learner in the cohort window, assembled from existing progress tables. */
export interface ModuleEntryExperimentUserRow {
  userId: string
  createdAt: string | null
  /** Completed lessons within 30 days of signup — the PRIMARY metric input. */
  lessonsCompletedD30: number
  /** Whether the learner completed their first lesson at all — the GUARDRAIL input. */
  firstLessonCompleted: boolean
  /** Whether the learner completed all of Module 1 (guardrail against concentration loss). */
  module1Completed: boolean
  /** Whether the learner completed their recommended module (secondary). Null if unknown. */
  recommendedModuleCompleted?: boolean | null
  /** How many distinct modules the learner touched (opened ≥1 lesson in) — module-switching. */
  modulesTouched: number
}

export interface ModuleEntryCohortMetrics {
  /** Number of learners in this cohort. */
  n: number
  /** PRIMARY: mean lessons completed per learner at D30. */
  meanLessonsCompletedD30: number
  /** GUARDRAIL: share who completed their first lesson (must not fall vs control). */
  firstLessonCompletionRate: number
  /** Share who completed all of Module 1 (concentration guardrail). */
  module1CompletionRate: number
  /** SECONDARY: share who completed their recommended module (of those with a known value). */
  recommendedModuleCompletionRate: number | null
  /** Share who touched more than one module (module-switching / scattering signal). */
  moduleSwitchRate: number
}

export interface ModuleEntryExperimentSummary {
  control: ModuleEntryCohortMetrics
  treatment: ModuleEntryCohortMetrics
}

function emptyCohort(): {
  n: number
  lessons: number
  firstLesson: number
  module1: number
  recCompleted: number
  recKnown: number
  switched: number
} {
  return { n: 0, lessons: 0, firstLesson: 0, module1: 0, recCompleted: 0, recKnown: 0, switched: 0 }
}

function finalize(acc: ReturnType<typeof emptyCohort>): ModuleEntryCohortMetrics {
  const rate = (num: number, den: number) => (den > 0 ? num / den : 0)
  return {
    n: acc.n,
    meanLessonsCompletedD30: rate(acc.lessons, acc.n),
    firstLessonCompletionRate: rate(acc.firstLesson, acc.n),
    module1CompletionRate: rate(acc.module1, acc.n),
    recommendedModuleCompletionRate: acc.recKnown > 0 ? acc.recCompleted / acc.recKnown : null,
    moduleSwitchRate: rate(acc.switched, acc.n),
  }
}

/**
 * Assigns each learner to their deterministic variant and computes the Phase 6 primary,
 * guardrail and secondary metrics per cohort. Pure — the same config the app runs with (or an
 * explicit one for back-testing a different cohort/split) reproduces the exact assignment.
 */
export function computeModuleEntryExperimentSummary(
  rows: ModuleEntryExperimentUserRow[],
  config: ModuleEntryUnlockConfig = getModuleEntryUnlockConfig()
): ModuleEntryExperimentSummary {
  const buckets: Record<ModuleEntryUnlockVariant, ReturnType<typeof emptyCohort>> = {
    control: emptyCohort(),
    treatment: emptyCohort(),
  }

  for (const row of rows) {
    // For measurement we want to segment the WHOLE cohort window by the treatment the learner
    // *would* receive, so we evaluate the split ignoring the enabled flag when it is off (an
    // off flag would otherwise collapse everyone into control and hide the comparison). When the
    // experiment is live, the same call reproduces the exact runtime assignment.
    const variant = getModuleEntryUnlockVariant(
      { id: row.userId, createdAt: row.createdAt },
      { ...config, enabled: true }
    )
    const acc = buckets[variant]
    acc.n += 1
    acc.lessons += row.lessonsCompletedD30
    if (row.firstLessonCompleted) acc.firstLesson += 1
    if (row.module1Completed) acc.module1 += 1
    if (row.recommendedModuleCompleted != null) {
      acc.recKnown += 1
      if (row.recommendedModuleCompleted) acc.recCompleted += 1
    }
    if (row.modulesTouched > 1) acc.switched += 1
  }

  return { control: finalize(buckets.control), treatment: finalize(buckets.treatment) }
}
