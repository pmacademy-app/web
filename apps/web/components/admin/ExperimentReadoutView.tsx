import React from 'react'
import { FlaskConical, Scissors, DoorOpen, Trophy } from 'lucide-react'
import { AdminSection } from './AdminSection'
import { AdminLoadWarning } from './AdminLoadWarning'
import type { ExperimentReadout } from '@/lib/admin/experiment-readout-service'

interface ExperimentReadoutViewProps {
  data: ExperimentReadout
}

/** A single metric to show for both arms. `format` turns the raw number into display text. */
interface MetricSpec<M> {
  label: string
  /** Pull the raw value from an arm's metrics; null ⇒ "not measurable". */
  get: (m: M) => number | null
  format: (v: number) => string
  /** True for the arm's designated primary metric (emphasised). */
  primary?: boolean
  hint?: string
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`
const dec = (v: number) => v.toFixed(2)

/**
 * Below this many learners in an arm, a rate is too noisy to read as a result. We still show the
 * raw numbers (honest), but flag the arm so nobody over-reads a 100% built on 2 learners.
 */
const MIN_ARM_SAMPLE = 20

interface ArmMeta {
  n: number
}

/**
 * Renders one experiment as a control-vs-treatment table. Deliberately descriptive only: it shows
 * each arm's n and metrics exactly as the aggregator produced them, with no significance test,
 * confidence interval or causal claim — the underlying aggregators compute none, so the UI asserts
 * none.
 */
function ExperimentPanel<M extends ArmMeta>({
  title,
  icon,
  description,
  control,
  treatment,
  metrics,
  extraNote,
}: {
  title: string
  icon: React.ElementType
  description: string
  control: M
  treatment: M
  metrics: MetricSpec<M>[]
  extraNote?: string
}) {
  const totalN = control.n + treatment.n
  const lowSample = (arm: M) => arm.n > 0 && arm.n < MIN_ARM_SAMPLE

  return (
    <AdminSection title={title} icon={icon} meta={`n = ${totalN.toLocaleString('en-US')}`}>
      <p className="text-xs text-admin-fg-muted -mt-1">{description}</p>

      {totalN === 0 ? (
        <div className="rounded-xl bg-admin-surface-raised border border-admin-border px-4 py-6 text-center">
          <p className="text-sm font-semibold text-admin-fg">No learners in this experiment yet</p>
          <p className="text-xs text-admin-fg-muted mt-1">
            Metrics will appear here once learners exist in the cohort. Nothing is estimated.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-admin-fg-muted">
                  <th className="text-left font-semibold py-2 pr-4">Metric</th>
                  <th className="text-right font-semibold py-2 px-3">Control</th>
                  <th className="text-right font-semibold py-2 pl-3">Treatment</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-admin-border">
                  <td className="py-2 pr-4 font-semibold text-admin-fg">Sample size (n)</td>
                  <td className="py-2 px-3 text-right font-mono text-admin-fg">
                    {control.n.toLocaleString('en-US')}
                    {lowSample(control) && <LowSampleTag />}
                  </td>
                  <td className="py-2 pl-3 text-right font-mono text-admin-fg">
                    {treatment.n.toLocaleString('en-US')}
                    {lowSample(treatment) && <LowSampleTag />}
                  </td>
                </tr>
                {metrics.map((metric) => (
                  <MetricRow key={metric.label} metric={metric} control={control} treatment={treatment} />
                ))}
              </tbody>
            </table>
          </div>
          {(lowSample(control) || lowSample(treatment)) && (
            <p className="text-[11px] text-admin-warning">
              One or more arms has fewer than {MIN_ARM_SAMPLE} learners — rates shown are directional
              only and not a conclusion.
            </p>
          )}
          {extraNote && <p className="text-[11px] text-admin-fg-muted">{extraNote}</p>}
        </>
      )}
    </AdminSection>
  )
}

function LowSampleTag() {
  return (
    <span className="ml-1.5 align-middle px-1.5 py-0.5 rounded bg-admin-warning-soft text-admin-warning text-[9px] font-bold uppercase border border-admin-warning/25">
      low n
    </span>
  )
}

function MetricRow<M extends ArmMeta>({
  metric,
  control,
  treatment,
}: {
  metric: MetricSpec<M>
  control: M
  treatment: M
}) {
  const render = (arm: M) => {
    const raw = metric.get(arm)
    if (arm.n === 0) return <span className="text-admin-fg-muted">—</span>
    if (raw === null) return <span className="text-admin-fg-muted italic">n/a</span>
    return <span className="font-mono">{metric.format(raw)}</span>
  }
  return (
    <tr className="border-t border-admin-border">
      <td className="py-2 pr-4 text-admin-fg">
        <span className={metric.primary ? 'font-bold text-admin-fg' : 'text-admin-fg-muted'}>
          {metric.label}
        </span>
        {metric.primary && (
          <span className="ml-1.5 text-[9px] font-bold uppercase text-admin-accent">primary</span>
        )}
        {metric.hint && <span className="block text-[10px] text-admin-fg-muted">{metric.hint}</span>}
      </td>
      <td className="py-2 px-3 text-right text-admin-fg">{render(control)}</td>
      <td className="py-2 pl-3 text-right text-admin-fg">{render(treatment)}</td>
    </tr>
  )
}

/**
 * Phase 8.1 — the admin experiment readout surface.
 *
 * Wires the three orphaned experiment aggregators (recut, module-entry unlock, capstone threshold)
 * into one admin-only page. All arithmetic lives in the aggregators; this component only presents it.
 */
export function ExperimentReadoutView({ data }: ExperimentReadoutViewProps) {
  return (
    <div className="space-y-6">
      {data.failed && (
        <AdminLoadWarning message="The experiment readout could not be aggregated from the database. Showing an empty structure — retry shortly." />
      )}

      <div className="rounded-xl bg-admin-surface-raised border border-admin-border px-4 py-3">
        <p className="text-xs text-admin-fg-muted">
          Descriptive control-vs-treatment readouts for the three cohort experiments, assembled
          server-side from tables the app already writes — no GA4, no persisted assignment. Every flag
          currently defaults to <span className="font-semibold text-admin-fg">off</span>; arms are
          reconstructed from each learner&apos;s deterministic variant so the comparison is readable
          before rollout. These are raw rates only — no statistical-significance or causal claim is
          made or implied.
        </p>
      </div>

      <ExperimentPanel
        title="Phase 4 — Recut (unit of work)"
        icon={Scissors}
        description="Does splitting the lesson into a shorter Core path plus an optional Deep dive (and a trimmed quiz) increase throughput without hollowing out depth?"
        control={data.recut.control}
        treatment={data.recut.treatment}
        metrics={[
          { label: 'Mean lessons completed @ D30', get: (m) => m.meanLessonsCompletedD30, format: dec, primary: true, hint: 'Throughput within 30 days of signup' },
          { label: 'Mean lessons completed (all-time)', get: (m) => m.meanLessonsCompleted, format: dec },
          { label: 'Completed ≥1 lesson', get: (m) => m.firstLessonCompletionRate, format: pct, hint: 'Activation guardrail' },
          { label: 'Opened a Deep dive', get: (m) => m.deepDiveOpenRate, format: pct, hint: 'Depth guardrail' },
        ]}
      />

      <ExperimentPanel
        title="Phase 6 — Module-entry unlock"
        icon={DoorOpen}
        description="Does letting learners enter any module (vs sequential gating) increase learning without scattering effort?"
        control={data.moduleEntry.control}
        treatment={data.moduleEntry.treatment}
        metrics={[
          { label: 'Mean lessons completed @ D30', get: (m) => m.meanLessonsCompletedD30, format: dec, primary: true, hint: 'Throughput within 30 days of signup' },
          { label: 'Completed first lesson', get: (m) => m.firstLessonCompletionRate, format: pct, hint: 'Activation guardrail' },
          { label: 'Completed all of Module 1', get: (m) => m.module1CompletionRate, format: pct, hint: 'Concentration guardrail' },
          { label: 'Completed recommended module', get: (m) => m.recommendedModuleCompletionRate, format: pct, hint: 'Not derivable from progress rows — shown as n/a' },
          { label: 'Touched >1 module', get: (m) => m.moduleSwitchRate, format: pct, hint: 'Scattering signal' },
        ]}
      />

      <ExperimentPanel
        title="Phase 7 — Capstone threshold (8 → 4)"
        icon={Trophy}
        description="Does lowering the eligibility gate from 8 to 4 module lessons cause more learners to actually produce a capstone artifact, and stay engaged?"
        control={data.capstoneThreshold.control}
        treatment={data.capstoneThreshold.treatment}
        metrics={[
          { label: 'Eligibility rate', get: (m) => m.eligibilityRate, format: pct, hint: `Under this arm's gate` },
          { label: 'Started capstone-1', get: (m) => m.capstone1StartRate, format: pct },
          { label: 'Submitted capstone-1', get: (m) => m.capstone1SubmissionRate, format: pct, primary: true },
          { label: 'Capstone-1 reviewed', get: (m) => m.capstone1ReviewRate, format: pct },
          { label: 'Submitted any capstone', get: (m) => m.anyCapstoneSubmissionRate, format: pct },
          { label: 'Mean lessons completed @ D30', get: (m) => m.meanLessonsCompletedD30, format: dec, hint: 'Retention proxy' },
        ]}
        extraNote={`Required lessons — control: ${data.capstoneThreshold.control.requiredLessons}, treatment: ${data.capstoneThreshold.treatment.requiredLessons}.`}
      />

      <p className="text-[11px] text-admin-fg-muted flex items-center gap-1.5">
        <FlaskConical className="w-3 h-3 shrink-0" />
        Generated {new Date(data.generatedAt).toLocaleString()} · population {data.populationSize.toLocaleString('en-US')} learners · cached ~5 min.
      </p>
    </div>
  )
}
