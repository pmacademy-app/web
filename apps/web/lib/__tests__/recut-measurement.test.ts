/**
 * Phase 8.1 — recut ("unit of work") experiment measurement.
 *
 * Confirms the new recut aggregator mirrors the Phase 6/7 aggregators: it segments the deterministic
 * arms, computes throughput/activation/depth metrics purely from progress-derived rows, and never
 * divides by zero on an empty cohort.
 */

import { describe, it, expect } from 'vitest'
import {
  computeRecutExperimentSummary,
  type RecutExperimentUserRow,
} from '../admin/recut-experiment'
import { getRecutVariant, type RecutExperimentConfig } from '../academy/experiment'

const CONFIG: RecutExperimentConfig = { enabled: true, treatmentPercent: 50 }

function row(over: Partial<RecutExperimentUserRow> & { userId: string }): RecutExperimentUserRow {
  return {
    createdAt: '2026-10-01T00:00:00Z',
    lessonsCompleted: 0,
    lessonsCompletedD30: 0,
    firstLessonCompleted: false,
    deepDiveOpened: false,
    ...over,
  }
}

describe('computeRecutExperimentSummary', () => {
  it('splits learners into both arms exactly as the assignment function does', () => {
    const rows = Array.from({ length: 200 }, (_, i) => row({ userId: `user-${i}` }))
    const summary = computeRecutExperimentSummary(rows, CONFIG)

    const expectedTreatment = rows.filter(
      (r) => getRecutVariant(r.userId, { ...CONFIG, enabled: true }) === 'treatment'
    ).length
    expect(summary.treatment.n).toBe(expectedTreatment)
    expect(summary.control.n).toBe(rows.length - expectedTreatment)
    expect(summary.control.n + summary.treatment.n).toBe(rows.length)
    expect(summary.control.n).toBeGreaterThan(0)
    expect(summary.treatment.n).toBeGreaterThan(0)
  })

  it('computes throughput, activation-guardrail and depth-guardrail rates per arm', () => {
    // Force everyone into treatment (100%) so the metrics are read on a known cohort.
    const treatmentAll: RecutExperimentConfig = { enabled: true, treatmentPercent: 100 }
    const rows = [
      row({ userId: 'a', lessonsCompleted: 10, lessonsCompletedD30: 6, firstLessonCompleted: true, deepDiveOpened: true }),
      row({ userId: 'b', lessonsCompleted: 2, lessonsCompletedD30: 2, firstLessonCompleted: true, deepDiveOpened: false }),
    ]
    const s = computeRecutExperimentSummary(rows, treatmentAll).treatment
    expect(s.n).toBe(2)
    expect(s.meanLessonsCompletedD30).toBe(4) // (6+2)/2
    expect(s.meanLessonsCompleted).toBe(6) // (10+2)/2
    expect(s.firstLessonCompletionRate).toBe(1)
    expect(s.deepDiveOpenRate).toBe(0.5)
  })

  it('handles an empty cohort without dividing by zero', () => {
    const summary = computeRecutExperimentSummary([], CONFIG)
    expect(summary.control.n).toBe(0)
    expect(summary.control.meanLessonsCompletedD30).toBe(0)
    expect(summary.treatment.deepDiveOpenRate).toBe(0)
  })

  it('respects an off flag by segmenting the would-be arms (not collapsing to control)', () => {
    // The aggregator always forces enabled:true internally, so an off-config still produces a split.
    const offConfig: RecutExperimentConfig = { enabled: false, treatmentPercent: 50 }
    const rows = Array.from({ length: 100 }, (_, i) => row({ userId: `u-${i}` }))
    const summary = computeRecutExperimentSummary(rows, offConfig)
    expect(summary.treatment.n).toBeGreaterThan(0)
    expect(summary.control.n).toBeGreaterThan(0)
  })
})
