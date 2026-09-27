import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

import {
  computeOnboardingStepFunnel,
  computeCompletedLessonDistribution,
  assembleActivationFunnelStages,
  computeReviewPctOfOpeners,
  ONBOARDING_STEP_LABELS,
  type OnboardingStepUserRow,
  type VerificationStage,
} from '@/lib/admin/funnel-aggregation'
import {
  computeActivationFunnel,
  type BaselineUserRow,
  type BaselineProgressRow,
  type BaselineReviewUsage,
} from '@/lib/admin/baseline-aggregation'
import { ADMIN_NAV, ADMIN_NAV_BUILT, isAdminNavItemActive } from '@/lib/admin/navigation'

/**
 * Phase 2 — activation funnel aggregation tests.
 *
 * Phase 2 is measurement, so the arithmetic is what must be trustworthy. These cases
 * target the ways a funnel goes quietly wrong: a pre-instrumentation account counted as a
 * step-0 drop-off (risk R15), a deleted user inflating a bucket past its denominator, a
 * missing verification source rendered as "nobody verified", and the onboarding
 * reach→completion reduction after Phase 4A (ADR-007) collapsed onboarding to a single
 * screen. The return-cohort and review arithmetic themselves are covered by the Phase 0.B
 * baseline suite, which this phase reuses rather than re-deriving.
 */

// ─── Onboarding step drop-off (the one new Phase 2 instrumentation) ───────────

function stepUser(
  reached: number | null,
  completed = false
): OnboardingStepUserRow {
  return { onboarding_step_reached: reached, onboarding_completed: completed }
}

describe('computeOnboardingStepFunnel', () => {
  it('excludes pre-instrumentation (NULL) accounts from the cohort, never counts them as drop-offs', () => {
    const users: OnboardingStepUserRow[] = [
      stepUser(null, true), // completed BEFORE instrumentation — must be excluded
      stepUser(null, false), // predates instrumentation — must be excluded
      stepUser(1),
      stepUser(2),
      stepUser(4, true),
    ]
    const result = computeOnboardingStepFunnel(users)

    expect(result.instrumentedCohort).toBe(3)
    expect(result.excludedPreInstrumentation).toBe(2)
    // Step 1 reached by all 3 instrumented, not by the 5 total.
    expect(result.steps[0].reached).toBe(3)
    expect(result.steps[0].pctOfCohort).toBe(100)
  })

  it('reduces to a single "reached onboarding" stage after the Phase 4A single-screen collapse', () => {
    // Post-4A accounts only ever reach step 1; a pre-4A account may carry a higher marker.
    // Both fold into the one "reached onboarding" stage — the only signal comparable across
    // the collapse, since the step numbers no longer mean the same thing (ADR-007).
    const users: OnboardingStepUserRow[] = [
      stepUser(1),
      stepUser(1),
      stepUser(3), // pre-4A account that reached a now-removed step
      stepUser(1, true),
    ]
    const { steps } = computeOnboardingStepFunnel(users)

    expect(steps).toHaveLength(1)
    expect(steps.map((s) => s.label)).toEqual([...ONBOARDING_STEP_LABELS])
    expect(steps[0].reached).toBe(4) // every instrumented account reached onboarding
    expect(steps[0].pctOfCohort).toBe(100)
    expect(steps[0].pctOfPrevious).toBeNull()
  })

  it('distinguishes reaching onboarding from actually completing it', () => {
    // Two learners reached the onboarding screen; only one submitted.
    const users: OnboardingStepUserRow[] = [stepUser(1, true), stepUser(1, false)]
    const result = computeOnboardingStepFunnel(users)

    expect(result.steps[0].reached).toBe(2) // both reached onboarding
    expect(result.completed).toBe(1) // one dropped before submitting
    expect(result.pctCompleted).toBe(50)
  })

  it('reports zeros (not NaN) for an empty cohort', () => {
    const result = computeOnboardingStepFunnel([stepUser(null), stepUser(null)])
    expect(result.instrumentedCohort).toBe(0)
    expect(result.excludedPreInstrumentation).toBe(2)
    expect(result.steps.every((s) => s.pctOfCohort === 0)).toBe(true)
    expect(result.pctCompleted).toBe(0)
  })
})

// ─── Continued-learning distribution ─────────────────────────────────────────

describe('computeCompletedLessonDistribution', () => {
  const known = new Set(['u1', 'u2', 'u3'])

  it('buckets learners by completed-lesson count and ignores non-completed rows', () => {
    const progress = [
      { user_id: 'u1', status: 'completed' },
      { user_id: 'u1', status: 'completed' },
      { user_id: 'u1', status: 'completed' }, // u1 = 3 completed → 2–4 bucket
      { user_id: 'u2', status: 'completed' }, // u2 = 1 → 1-lesson bucket
      { user_id: 'u2', status: 'in_progress' }, // ignored
      { user_id: 'u3', status: 'in_progress' }, // u3 never completed → not activated
    ]
    const dist = computeCompletedLessonDistribution(progress, known)

    expect(dist.activatedLearners).toBe(2)
    expect(dist.buckets.find((b) => b.label === '1 lesson')?.learners).toBe(1)
    expect(dist.buckets.find((b) => b.label === '2–4 lessons')?.learners).toBe(1)
  })

  it('does not let a deleted user (absent from knownUserIds) inflate a bucket', () => {
    const progress = [
      { user_id: 'ghost', status: 'completed' },
      { user_id: 'u1', status: 'completed' },
    ]
    const dist = computeCompletedLessonDistribution(progress, known)
    expect(dist.activatedLearners).toBe(1) // ghost excluded
  })
})

// ─── Primary funnel assembly + verification handling ─────────────────────────

const baseUser = (id: string, overrides: Partial<BaselineUserRow> = {}): BaselineUserRow => ({
  id,
  created_at: new Date('2026-09-01T00:00:00Z').toISOString(),
  onboarding_completed: true,
  terms_accepted_at: null,
  ...overrides,
})

describe('assembleActivationFunnelStages', () => {
  const users = [baseUser('u1'), baseUser('u2'), baseUser('u3', { onboarding_completed: false })]
  const progress: BaselineProgressRow[] = [
    { user_id: 'u1', lesson_id: 'l1', status: 'completed', theory_read_at: 't', completed_at: 'c', quiz_attempts: 1 },
    { user_id: 'u2', lesson_id: 'l1', status: 'in_progress', theory_read_at: 't', completed_at: null, quiz_attempts: 0 },
  ]
  const funnel = computeActivationFunnel(users, progress)

  it('includes the Email-verified stage when verification was measured', () => {
    const verification: VerificationStage = { measured: true, confirmed: 2, total: 3, pct: 66.7 }
    const stages = assembleActivationFunnelStages(funnel, verification)
    const keys = stages.map((s) => s.key)
    expect(keys).toContain('verified')
    expect(stages.find((s) => s.key === 'verified')?.count).toBe(2)
    expect(stages[0].key).toBe('registered')
    expect(stages[0].pctOverall).toBe(100)
  })

  it('omits the Email-verified stage when the auth source was unavailable', () => {
    const verification: VerificationStage = { measured: false, confirmed: 0, total: 0, pct: 0 }
    const stages = assembleActivationFunnelStages(funnel, verification)
    expect(stages.map((s) => s.key)).not.toContain('verified')
    // The nested chain still resolves the opened/theory/completed stages.
    expect(stages.find((s) => s.key === 'opened')?.count).toBe(2)
    expect(stages.find((s) => s.key === 'completed')?.count).toBe(1)
  })
})

describe('computeReviewPctOfOpeners', () => {
  it('measures review habit against lesson-openers, not all signups', () => {
    const users = [baseUser('u1'), baseUser('u2')]
    const progress: BaselineProgressRow[] = [
      { user_id: 'u1', lesson_id: 'l1', status: 'in_progress', theory_read_at: null, completed_at: null, quiz_attempts: 0 },
    ]
    const funnel = computeActivationFunnel(users, progress) // everOpenedLesson = 1
    const review: BaselineReviewUsage = {
      usersEverReviewed: 1,
      usersReviewedLast30Days: 1,
      usersReviewedLast7Days: 0,
      totalReviewEvents: 5,
      pctOfActiveLearners: 100,
    }
    expect(computeReviewPctOfOpeners(funnel, review)).toBe(100) // 1 of 1 opener
  })
})

// ─── Admin surface: RBAC-by-construction and nav wiring ───────────────────────

describe('activation funnel admin surface', () => {
  it('lives inside the RBAC-guarded (console) route group', () => {
    // Every page under app/admin/(console) renders behind AdminConsoleLayout, which
    // redirects non-admins. Placing the funnel there is how it is made admin-only.
    const pagePath = path.resolve(
      __dirname,
      '../../app/admin/(console)/analytics/funnel/page.tsx'
    )
    expect(fs.existsSync(pagePath)).toBe(true)

    const guardPath = path.resolve(__dirname, '../../app/admin/(console)/layout.tsx')
    const guard = fs.readFileSync(guardPath, 'utf-8')
    expect(guard).toContain('isAdminUser')
    expect(guard).toContain("redirect('/admin/access-denied')")
  })

  it('registers a built Insights nav entry for the funnel', () => {
    const insights = ADMIN_NAV.find((g) => g.label === 'Insights')
    const funnelItem = insights?.items.find((i) => i.href === '/admin/analytics/funnel')
    expect(funnelItem?.built).toBe(true)
    // Only built items are surfaced in the sidebar.
    const builtInsights = ADMIN_NAV_BUILT.find((g) => g.label === 'Insights')
    expect(builtInsights?.items.some((i) => i.href === '/admin/analytics/funnel')).toBe(true)
  })

  it('highlights only the funnel entry on the funnel route (most-specific wins)', () => {
    const analytics = { name: 'Analytics', href: '/admin/analytics', icon: () => null, built: true } as never
    const funnel = { name: 'Activation Funnel', href: '/admin/analytics/funnel', icon: () => null, built: true } as never

    expect(isAdminNavItemActive(funnel, '/admin/analytics/funnel')).toBe(true)
    expect(isAdminNavItemActive(analytics, '/admin/analytics/funnel')).toBe(false)
    // The parent still owns its own exact route.
    expect(isAdminNavItemActive(analytics, '/admin/analytics')).toBe(true)
  })
})
