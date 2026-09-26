import React from 'react'
import {
  Users,
  GraduationCap,
  DoorOpen,
  Hourglass,
  CalendarClock,
  ListOrdered,
  RefreshCw,
  FileCheck2,
} from 'lucide-react'
import { AdminSection } from './AdminSection'
import { AdminKpiCard } from './AdminKpiCard'
import { AdminFunnelChart } from './AdminFunnelChart'
import { AdminEmptyState } from './AdminEmptyState'
import { AdminLoadWarning } from './AdminLoadWarning'
import type { ActivationFunnelView as ActivationFunnelViewData } from '@/lib/admin/funnel-aggregation'

interface ActivationFunnelViewProps {
  data: ActivationFunnelViewData
}

const num = (v: number) => v.toLocaleString('en-US')

/**
 * Phase 2 — the authoritative, server-side activation funnel surface.
 *
 * Renders the funnel derived in `FunnelService.getActivationFunnel` from tables the
 * server already writes. Metrics with different denominators (the return cohort, review
 * habit, capstone) are deliberately shown as their own panels rather than folded into the
 * nested funnel bar, so no ratio is read against the wrong population.
 */
export function ActivationFunnelView({ data }: ActivationFunnelViewProps) {
  const completed = data.stages.find((s) => s.key === 'completed')
  const activationPct = completed?.pctOverall ?? 0

  return (
    <div className="space-y-6">
      {data.failed && (
        <AdminLoadWarning message="The activation funnel could not be aggregated from the database. Showing an empty structure — retry shortly." />
      )}

      {/* Headline KPIs — the activation outcome and the decision split (§0.B.3). */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminKpiCard
          title="Registered"
          value={num(data.registered)}
          subtitle="All accounts (funnel baseline)"
          icon={Users}
        />
        <AdminKpiCard
          title="Completed ≥1 lesson"
          value={completed ? num(completed.count) : '0'}
          subtitle={`${activationPct}% of registered — the north-star input`}
          icon={GraduationCap}
        />
        <AdminKpiCard
          title="Never opened a lesson"
          value={num(data.neverOpenedLesson)}
          subtitle="Entrance problem (Phase 5 signal)"
          icon={DoorOpen}
        />
        <AdminKpiCard
          title="Opened, never completed"
          value={num(data.openedButNeverCompleted)}
          subtitle="Lesson-length problem (Phase 4 signal)"
          icon={Hourglass}
        />
      </div>

      {/* Primary nested funnel. */}
      <AdminFunnelChart stages={data.stages} />
      <p className="text-[11px] text-admin-fg-muted -mt-3">
        Server-side, all-time, cookie-consent-independent (IMPLEMENTATION_PLAN §5.2).
        {!data.verification.measured &&
          ' Email-verified stage omitted: the auth admin API was unavailable at aggregation time.'}
      </p>

      {/* Return cohort — mature cohort only, explicit denominator. */}
      <AdminSection
        title="Return behaviour"
        icon={CalendarClock}
        meta={`Cohort: accounts ≥ ${data.returnCohortWindowDays} days old`}
      >
        {data.returns.cohortSize === 0 ? (
          <AdminEmptyState
            icon={CalendarClock}
            title="No mature cohort yet"
            description={`No accounts are at least ${data.returnCohortWindowDays} days old, so D1/D7 return cannot be measured without a misleading denominator.`}
            className="py-8"
          />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <AdminKpiCard
                title="Mature cohort"
                value={num(data.returns.cohortSize)}
                subtitle={`Signed up ≥ ${data.returnCohortWindowDays}d ago`}
              />
              <AdminKpiCard
                title="Returned by D1"
                value={`${data.returns.pctReturnedDay1}%`}
                subtitle={`${num(data.returns.returnedDay1)} learners`}
              />
              <AdminKpiCard
                title="Returned by D7"
                value={`${data.returns.pctReturnedDay7}%`}
                subtitle={`${num(data.returns.returnedDay7)} learners`}
              />
            </div>
            <p className="text-[11px] text-admin-fg-muted">
              A <strong>floor</strong>, not an exact rate: XP events are the only durable
              activity record, so a learner who returned and read without earning XP is
              invisible here. Denominator is the mature cohort, never all signups.
            </p>
          </div>
        )}
      </AdminSection>

      {/* Onboarding step drop-off — the one new Phase 2 instrumentation. */}
      <AdminSection
        title="Onboarding step drop-off"
        icon={ListOrdered}
        meta={`${num(data.onboardingSteps.instrumentedCohort)} instrumented`}
      >
        {data.onboardingSteps.instrumentedCohort === 0 ? (
          <AdminEmptyState
            icon={ListOrdered}
            title="No instrumented onboarding sessions yet"
            description="Per-step drop-off appears once learners move through the wizard after this phase ships. Accounts created before instrumentation are excluded, not counted as drop-offs."
            className="py-8"
          />
        ) : (
          <div className="space-y-3">
            {data.onboardingSteps.steps.map((stage, idx) => {
              const width = Math.max(stage.pctOfCohort, stage.reached > 0 ? 4 : 0)
              return (
                <div key={stage.step} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-admin-fg">{stage.label}</span>
                    <span className="flex items-center gap-2">
                      {stage.pctOfPrevious !== null && (
                        <span className="text-[10px] font-mono text-admin-fg-muted">
                          {stage.pctOfPrevious}% of prev
                        </span>
                      )}
                      <span className="font-mono font-bold text-admin-fg">{num(stage.reached)}</span>
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-admin-bg border border-admin-border overflow-hidden">
                    <div
                      className={idx === 0 ? 'h-full rounded-full bg-admin-accent' : 'h-full rounded-full bg-admin-accent/60'}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <div className="text-[10px] font-mono text-admin-fg-muted">
                    {stage.pctOfCohort}% of instrumented cohort
                  </div>
                </div>
              )
            })}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-admin-border text-xs">
              <span className="font-semibold text-admin-fg">
                Completed onboarding: {num(data.onboardingSteps.completed)} ({data.onboardingSteps.pctCompleted}%)
              </span>
              <span className="text-admin-fg-muted">
                Excluded (pre-instrumentation): {num(data.onboardingSteps.excludedPreInstrumentation)}
              </span>
            </div>
          </div>
        )}
      </AdminSection>

      {/* Downstream engagement — separate denominators, honestly labelled. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AdminSection title="Review habit" icon={RefreshCw} meta="Of lesson-openers">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <AdminKpiCard
                title="Ever reviewed"
                value={num(data.review.usersEverReviewed)}
                subtitle={`${data.reviewPctOfOpeners}% of learners who opened a lesson`}
              />
              <AdminKpiCard
                title="Reviewed last 7d"
                value={num(data.review.usersReviewedLast7Days)}
                subtitle={`${num(data.review.totalReviewEvents)} review events all-time`}
              />
            </div>
            <p className="text-[11px] text-admin-fg-muted">
              The ~3-minute daily loop exists in code (`srs.ts`). This measures whether it is
              used — the premise behind Phase 3.5.
            </p>
          </div>
        </AdminSection>

        <AdminSection title="Capstone submission" icon={FileCheck2} meta="Requires 8 of 10 module lessons">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <AdminKpiCard
                title="Distinct submitters"
                value={num(data.capstone.distinctLearners)}
                subtitle={`${num(data.capstone.submittedOrReviewed)} submitted or reviewed`}
              />
              <AdminKpiCard
                title="Awaiting review"
                value={num(data.capstone.awaitingReview)}
                subtitle="Manual admin review backlog (Phase 7.2 SLA)"
              />
            </div>
            <p className="text-[11px] text-admin-fg-muted">
              Expected near-zero until Phase 4 shortens the distance to eligibility.
            </p>
          </div>
        </AdminSection>
      </div>

      {/* Continued learning — how far activated learners get. */}
      <AdminSection title="Continued learning" icon={GraduationCap} meta="Among activated learners">
        {data.continued.activatedLearners === 0 ? (
          <AdminEmptyState
            icon={GraduationCap}
            title="No completions yet"
            description="The completed-lesson distribution appears once learners complete their first lesson."
            className="py-8"
          />
        ) : (
          <div className="space-y-3">
            {data.continued.buckets.map((bucket) => {
              const width =
                data.continued.activatedLearners > 0
                  ? Math.max((bucket.learners / data.continued.activatedLearners) * 100, bucket.learners > 0 ? 4 : 0)
                  : 0
              return (
                <div key={bucket.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-admin-fg">{bucket.label}</span>
                    <span className="font-mono font-bold text-admin-fg">{num(bucket.learners)}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-admin-bg border border-admin-border overflow-hidden">
                    <div className="h-full rounded-full bg-admin-accent/60" style={{ width: `${width}%` }} />
                  </div>
                </div>
              )
            })}
            <p className="text-[11px] text-admin-fg-muted">
              Denominator is learners with ≥1 completed lesson ({num(data.continued.activatedLearners)}), not all signups.
            </p>
          </div>
        )}
      </AdminSection>
    </div>
  )
}
