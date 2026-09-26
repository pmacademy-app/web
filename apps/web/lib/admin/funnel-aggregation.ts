/**
 * Phase 2 — Activation funnel aggregation.
 *
 * IMPLEMENTATION_PLAN.md §"Phase 2 — Make the funnel visible" and §5.2 define an
 * authoritative funnel derived **server-side** from tables that already exist, because
 * correction C2 established that GA4/GTM are consent-gated and therefore measure only an
 * unrepresentative subset. This module turns raw row arrays into the funnel the admin
 * console renders.
 *
 * ## What it reuses vs. what is new
 *
 * The funnel arithmetic itself is NOT re-derived here — the Phase 0.B pure functions in
 * `baseline-aggregation.ts` already compute the activation funnel, return cohorts, review
 * usage and capstone reality with the orphan-row and mature-cohort discipline they were
 * unit-tested for. This module composes those results into the view shape and adds the
 * one thing Phase 0.B explicitly deferred to Phase 2 (`BASELINE_UNMEASURABLE`): the
 * per-onboarding-step drop-off, measurable now that the wizard writes
 * `users.onboarding_step_reached`.
 *
 * Like `baseline-aggregation.ts`, there is NO database access here. The arithmetic is the
 * part that has to be trustworthy, and it is only trustworthy if it can be unit-tested
 * against fixtures rather than against production. The service layer
 * (`funnel-service.ts`) fetches the rows.
 */

import { buildFunnel } from './dashboard-aggregation'
import type { AdminFunnelStage } from './types'
import type {
  BaselineActivationFunnel,
  BaselineReturnCohorts,
  BaselineReviewUsage,
  BaselineCapstoneReality,
} from './baseline-aggregation'

/** Rounds to one decimal so a percentage never renders as `19.230769230769234`. */
function pct(part: number, whole: number): number {
  if (whole <= 0) return 0
  return Math.round((part / whole) * 1000) / 10
}

// ─── Onboarding step drop-off (the one new Phase 2 instrumentation) ───────────

/**
 * Structural row shape rather than a generated `users` Row, so fixtures satisfy it
 * without constructing every column and an upstream schema change cannot silently alter
 * what this reads.
 */
export interface OnboardingStepUserRow {
  /** Furthest wizard step reached (1..4). NULL = account predates instrumentation. */
  onboarding_step_reached: number | null
  onboarding_completed: boolean
}

/** The four wizard steps, in order. Labels mirror `OnboardingWizard.tsx`. */
export const ONBOARDING_STEP_LABELS = [
  'Step 1 · Profile',
  'Step 2 · About You',
  'Step 3 · Interests',
  'Step 4 · Your Path',
] as const

export interface OnboardingStepFunnelStage {
  step: number
  label: string
  reached: number
  /** Share of the instrumented cohort that reached this step. */
  pctOfCohort: number
  /** Share of the previous step that reached this step (null for step 1). */
  pctOfPrevious: number | null
}

export interface OnboardingStepFunnel {
  /**
   * Accounts with a recorded step marker — the only population step-level percentages are
   * computed against. Pre-instrumentation accounts are NOT in this denominator.
   */
  instrumentedCohort: number
  /**
   * Accounts with a NULL marker (created before 2026-09-27). Reported so the drop-off is
   * read against a real denominator, never miscounted as a step-0 drop-off (risk R15).
   */
  excludedPreInstrumentation: number
  steps: OnboardingStepFunnelStage[]
  /** Instrumented accounts that finished the wizard (`onboarding_completed`). */
  completed: number
  /** Share of the instrumented cohort that finished. */
  pctCompleted: number
}

/**
 * Per-step onboarding drop-off, over the instrumented cohort only.
 *
 * "Instrumented" = a non-null `onboarding_step_reached`. The wizard writes the marker on
 * mount and on each advance, so any account that reached onboarding after 2026-09-27 has
 * one. A NULL marker therefore means the account predates instrumentation; per
 * IMPLEMENTATION_PLAN.md R15 those accounts are excluded and surfaced separately rather
 * than counted as having dropped out at step 0.
 *
 * `reached` for step k is the count of instrumented accounts whose furthest step is ≥ k,
 * which is monotonically non-increasing in k — a genuine funnel. `completed` is a stricter
 * signal than reaching step 4: both final-screen CTAs submit, so a learner who saw step 4
 * but never launched is a real, and interesting, last-mile drop.
 */
export function computeOnboardingStepFunnel(
  users: OnboardingStepUserRow[]
): OnboardingStepFunnel {
  const instrumented = users.filter((u) => u.onboarding_step_reached !== null)
  const cohort = instrumented.length
  const excluded = users.length - cohort

  const reachedAtLeast = (k: number) =>
    instrumented.filter((u) => (u.onboarding_step_reached ?? 0) >= k).length

  const steps: OnboardingStepFunnelStage[] = ONBOARDING_STEP_LABELS.map((label, idx) => {
    const step = idx + 1
    const reached = reachedAtLeast(step)
    // idx (= step - 1) is the previous step's number for k ≥ 2.
    const previousReached = idx === 0 ? null : reachedAtLeast(idx)
    return {
      step,
      label,
      reached,
      pctOfCohort: pct(reached, cohort),
      pctOfPrevious: previousReached === null ? null : pct(reached, previousReached),
    }
  })

  const completed = instrumented.filter((u) => u.onboarding_completed).length

  return {
    instrumentedCohort: cohort,
    excludedPreInstrumentation: excluded,
    steps,
    completed,
    pctCompleted: pct(completed, cohort),
  }
}

// ─── Continued-learning distribution ─────────────────────────────────────────

export interface CompletedLessonDistributionBucket {
  label: string
  learners: number
}

export interface CompletedLessonDistribution {
  /** Learners with at least one completed lesson (the "activated" population). */
  activatedLearners: number
  buckets: CompletedLessonDistributionBucket[]
}

/**
 * How far activated learners get, as a distribution of completed-lesson counts.
 *
 * IMPLEMENTATION_PLAN.md §5.2 lists "Continued — completed-lesson count distribution" as a
 * funnel row. It answers a different question from the single completion count: of the
 * learners who completed anything, how many kept going. Only `status='completed'` rows for
 * users still present in `knownUserIds` are counted, so a deleted account cannot inflate a
 * bucket.
 */
export function computeCompletedLessonDistribution(
  progress: Array<{ user_id: string | null; status: string }>,
  knownUserIds: Set<string>
): CompletedLessonDistribution {
  const completedByUser = new Map<string, number>()
  for (const row of progress) {
    if (!row.user_id || row.status !== 'completed' || !knownUserIds.has(row.user_id)) continue
    completedByUser.set(row.user_id, (completedByUser.get(row.user_id) ?? 0) + 1)
  }

  const counts = [...completedByUser.values()]
  const inRange = (min: number, max: number) =>
    counts.filter((c) => c >= min && c <= max).length

  return {
    activatedLearners: completedByUser.size,
    buckets: [
      { label: '1 lesson', learners: inRange(1, 1) },
      { label: '2–4 lessons', learners: inRange(2, 4) },
      { label: '5–9 lessons', learners: inRange(5, 9) },
      { label: '10+ lessons', learners: inRange(10, Number.MAX_SAFE_INTEGER) },
    ],
  }
}

// ─── The assembled activation funnel view ────────────────────────────────────

export interface VerificationStage {
  /** False when the auth admin API could not be read; the stage is then omitted. */
  measured: boolean
  confirmed: number
  total: number
  pct: number
}

export interface ActivationFunnelView {
  generatedAt: string
  registered: number
  /**
   * The primary nested funnel, most-inclusive stage first. Only genuinely nested stages
   * appear here (registered ⊇ verified ⊇ onboarded ⊇ opened ⊇ theory ⊇ completed); review
   * and capstone are reported separately because they are not strictly downstream of
   * completion and presenting them as funnel stages would produce misleading ratios.
   */
  stages: AdminFunnelStage[]
  verification: VerificationStage
  /** The decision split from IMPLEMENTATION_PLAN.md §0.B.3. */
  neverOpenedLesson: number
  openedButNeverCompleted: number
  onboardingSteps: OnboardingStepFunnel
  returns: BaselineReturnCohorts
  /** Maturity window used for the return cohort, in days (accounts younger are excluded). */
  returnCohortWindowDays: number
  review: BaselineReviewUsage
  /** Share of learners who opened a lesson that have ever reviewed a card. */
  reviewPctOfOpeners: number
  capstone: BaselineCapstoneReality
  continued: CompletedLessonDistribution
  failed?: boolean
}

/**
 * Composes the Phase 0.B baseline results into the primary nested funnel stages.
 *
 * Email verification is included only when it was measurable (the auth admin API is a
 * separate source that can fail); when it is not, the stage is dropped from the nested
 * chain rather than shown as a zero, which would read as "nobody verified".
 */
export function assembleActivationFunnelStages(
  funnel: BaselineActivationFunnel,
  verification: VerificationStage
): AdminFunnelStage[] {
  const raw: Array<{ key: string; label: string; count: number }> = [
    { key: 'registered', label: 'Registered', count: funnel.registered },
  ]
  if (verification.measured) {
    raw.push({ key: 'verified', label: 'Email verified', count: verification.confirmed })
  }
  raw.push(
    { key: 'onboarded', label: 'Onboarding completed', count: funnel.onboardingCompleted },
    { key: 'opened', label: 'Opened ≥1 lesson', count: funnel.everOpenedLesson },
    { key: 'theory', label: 'Recorded theory read', count: funnel.everReadTheory },
    { key: 'completed', label: 'Completed ≥1 lesson', count: funnel.everCompletedLesson }
  )
  return buildFunnel(raw)
}

/** Share of lesson-openers who have ever reviewed a card (an honest, nested ratio). */
export function computeReviewPctOfOpeners(
  funnel: BaselineActivationFunnel,
  review: BaselineReviewUsage
): number {
  return pct(review.usersEverReviewed, funnel.everOpenedLesson)
}
