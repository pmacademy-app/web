import { unstable_cache } from 'next/cache'

import { createServiceRoleClient } from '../supabase'
import { fetchAllRows } from './fetch-all'
import {
  computeActivationFunnel,
  computeReturnCohorts,
  computeReviewUsage,
  computeCapstoneReality,
  type BaselineUserRow,
  type BaselineProgressRow,
  type BaselineXpEventRow,
  type BaselineCapstoneRow,
} from './baseline-aggregation'
import {
  assembleActivationFunnelStages,
  computeOnboardingStepFunnel,
  computeCompletedLessonDistribution,
  computeDeepDiveEngagement,
  computeReviewPctOfOpeners,
  type ActivationFunnelView,
  type OnboardingStepUserRow,
  type VerificationStage,
} from './funnel-aggregation'

/**
 * Phase 2 — server-side activation funnel service.
 *
 * The live counterpart to the Phase 0.B `scripts/baseline-report.ts` point-in-time
 * report: it reads the same authoritative, server-side rows
 * (`users`, `user_lesson_progress`, `xp_events`, `capstone_submissions`) plus email
 * verification from the auth admin API, and composes them through the pure functions in
 * `baseline-aggregation.ts` and `funnel-aggregation.ts`.
 *
 * No GA4. IMPLEMENTATION_PLAN.md correction C2: GA4/GTM are consent-gated and describe an
 * unrepresentative subset, so the business-critical funnel is derived here from data the
 * server already writes regardless of cookie consent.
 */

/** Default maturity window for the return cohort: a D7 metric needs ≥7-day-old accounts. */
const DEFAULT_RETURN_COHORT_WINDOW_DAYS = 7

interface UserFunnelRow extends BaselineUserRow, OnboardingStepUserRow {}

/**
 * Verification state, read from the Supabase auth schema.
 *
 * `email_confirmed_at` is not a column on `public.users`, so it is read through the auth
 * admin API instead (mirroring `scripts/baseline-report.ts:fetchVerificationState`).
 * Returns `measured: false` on any failure so a transient auth-API problem degrades one
 * stage of the funnel rather than failing the whole view.
 */
async function fetchVerificationState(
  supabase: ReturnType<typeof createServiceRoleClient>
): Promise<VerificationStage> {
  try {
    let page = 1
    let total = 0
    let confirmed = 0
    for (;;) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
      if (error || !data) return { measured: false, confirmed: 0, total: 0, pct: 0 }
      if (data.users.length === 0) break
      for (const u of data.users) {
        total++
        if (u.email_confirmed_at) confirmed++
      }
      if (data.users.length < 1000) break
      page++
    }
    return {
      measured: true,
      confirmed,
      total,
      pct: total > 0 ? Math.round((confirmed / total) * 1000) / 10 : 0,
    }
  } catch {
    return { measured: false, confirmed: 0, total: 0, pct: 0 }
  }
}

async function aggregateActivationFunnel(
  cohortWindowDays: number
): Promise<ActivationFunnelView> {
  const generatedAt = new Date().toISOString()
  try {
    const supabase = createServiceRoleClient()

    const [users, progress, xpEvents, capstones, verification] = await Promise.all([
      fetchAllRows<UserFunnelRow>((from, to) =>
        supabase
          .from('users')
          .select(
            'id, created_at, onboarding_completed, onboarding_step_reached, terms_accepted_at'
          )
          .range(from, to)
      ),
      fetchAllRows<BaselineProgressRow & { deep_dive_opened_at: string | null }>((from, to) =>
        supabase
          .from('user_lesson_progress')
          .select(
            'user_id, lesson_id, status, theory_read_at, completed_at, quiz_attempts, deep_dive_opened_at'
          )
          .range(from, to)
      ),
      fetchAllRows<BaselineXpEventRow>((from, to) =>
        supabase.from('xp_events').select('user_id, source_type, created_at').range(from, to)
      ),
      fetchAllRows<BaselineCapstoneRow>((from, to) =>
        supabase.from('capstone_submissions').select('user_id, module_slug, status').range(from, to)
      ),
      fetchVerificationState(supabase),
    ])

    const now = new Date(generatedAt)
    const funnel = computeActivationFunnel(users, progress)
    const returns = computeReturnCohorts(users, xpEvents, now)
    const review = computeReviewUsage(xpEvents, now)
    const capstone = computeCapstoneReality(capstones)
    const onboardingSteps = computeOnboardingStepFunnel(users)
    const knownUserIds = new Set(users.map((u) => u.id))
    const continued = computeCompletedLessonDistribution(progress, knownUserIds)
    const deepDive = computeDeepDiveEngagement(progress, knownUserIds)

    return {
      generatedAt,
      registered: funnel.registered,
      stages: assembleActivationFunnelStages(funnel, verification),
      verification,
      neverOpenedLesson: funnel.neverOpenedLesson,
      openedButNeverCompleted: funnel.openedButNeverCompleted,
      onboardingSteps,
      returns,
      returnCohortWindowDays: cohortWindowDays,
      review,
      reviewPctOfOpeners: computeReviewPctOfOpeners(funnel, review),
      capstone,
      continued,
      deepDive,
    }
  } catch (err) {
    console.error('[FunnelService] Failed to aggregate activation funnel:', err)
    return {
      generatedAt,
      registered: 0,
      stages: [],
      verification: { measured: false, confirmed: 0, total: 0, pct: 0 },
      neverOpenedLesson: 0,
      openedButNeverCompleted: 0,
      onboardingSteps: {
        instrumentedCohort: 0,
        excludedPreInstrumentation: 0,
        steps: [],
        completed: 0,
        pctCompleted: 0,
      },
      returns: {
        cohortSize: 0,
        returnedDay1: 0,
        returnedDay7: 0,
        pctReturnedDay1: 0,
        pctReturnedDay7: 0,
        medianActiveDays: null,
      },
      returnCohortWindowDays: cohortWindowDays,
      review: {
        usersEverReviewed: 0,
        usersReviewedLast30Days: 0,
        usersReviewedLast7Days: 0,
        totalReviewEvents: 0,
        pctOfActiveLearners: 0,
      },
      reviewPctOfOpeners: 0,
      capstone: {
        totalRows: 0,
        distinctLearners: 0,
        byStatus: {},
        submittedOrReviewed: 0,
        awaitingReview: 0,
      },
      continued: { activatedLearners: 0, buckets: [] },
      deepDive: {
        learnersWhoOpenedLesson: 0,
        learnersWhoOpenedDeepDive: 0,
        pctOfOpeners: 0,
        lessonsWithDeepDiveOpened: 0,
      },
      failed: true,
    }
  }
}

export class FunnelService {
  /**
   * The authoritative signup → capstone activation funnel, cached briefly.
   *
   * Aggregate queries over `xp_events` can be sizeable, so the fetch+compute is wrapped in
   * `unstable_cache` (5-minute revalidate) — this is an admin dashboard, not a live meter,
   * and the numbers move slowly. `returns` uses a mature cohort (accounts ≥ the window old)
   * so a user who signed up yesterday is never counted as a D7 non-returner.
   */
  static async getActivationFunnel(params?: {
    returnCohortWindowDays?: number
  }): Promise<ActivationFunnelView> {
    const windowDays = params?.returnCohortWindowDays ?? DEFAULT_RETURN_COHORT_WINDOW_DAYS
    const cached = unstable_cache(
      () => aggregateActivationFunnel(windowDays),
      ['admin-activation-funnel', String(windowDays)],
      { revalidate: 300, tags: ['admin-activation-funnel'] }
    )
    return cached()
  }
}
