import { describe, it, expect } from 'vitest'
import {
  computeCapstoneThresholdExperimentSummary,
  type CapstoneThresholdExperimentUserRow,
} from '../admin/capstone-threshold-experiment'
import type { CapstoneThresholdConfig } from '../capstone-threshold-experiment'
import { getCapstoneThresholdVariant } from '../capstone-threshold-experiment'

const config: CapstoneThresholdConfig = {
  enabled: true,
  treatmentPercent: 50,
  treatmentRequiredLessons: 4,
  cohortStartMs: null,
}

function row(over: Partial<CapstoneThresholdExperimentUserRow> & { userId: string }): CapstoneThresholdExperimentUserRow {
  return {
    createdAt: '2026-10-01T00:00:00Z',
    module1LessonsCompleted: 0,
    capstone1Started: false,
    capstone1Submitted: false,
    capstone1Reviewed: false,
    anyCapstoneSubmitted: false,
    lessonsCompletedD30: 0,
    ...over,
  }
}

describe('Phase 7 — capstone threshold experiment measurement', () => {
  it('segments learners into the deterministic variant they would receive', () => {
    // Build enough users to populate both arms, then verify the aggregator's split matches the
    // assignment function exactly.
    const rows = Array.from({ length: 40 }, (_, i) => row({ userId: `user-${i}` }))
    const summary = computeCapstoneThresholdExperimentSummary(rows, config)

    const expectedTreatment = rows.filter(
      (r) => getCapstoneThresholdVariant({ id: r.userId, createdAt: r.createdAt }, { ...config, enabled: true }) === 'treatment'
    ).length
    expect(summary.treatment.n).toBe(expectedTreatment)
    expect(summary.control.n).toBe(rows.length - expectedTreatment)
    expect(summary.control.n + summary.treatment.n).toBe(rows.length)
  })

  it('reports the correct required-lessons gate per arm', () => {
    const summary = computeCapstoneThresholdExperimentSummary([row({ userId: 'u1' })], config)
    expect(summary.control.requiredLessons).toBe(8)
    expect(summary.treatment.requiredLessons).toBe(4)
  })

  it('computes eligibility against each arm’s own threshold', () => {
    // Force everyone into treatment (100%) so eligibility uses the 4-lesson gate.
    const treatmentAll: CapstoneThresholdConfig = { ...config, treatmentPercent: 100 }
    const rows = [
      row({ userId: 'a', module1LessonsCompleted: 4 }), // eligible under treatment (>=4)
      row({ userId: 'b', module1LessonsCompleted: 3 }), // not eligible
    ]
    const summary = computeCapstoneThresholdExperimentSummary(rows, treatmentAll)
    expect(summary.treatment.n).toBe(2)
    expect(summary.treatment.eligibilityRate).toBe(0.5)
  })

  it('computes start / submission / review / retention rates', () => {
    const treatmentAll: CapstoneThresholdConfig = { ...config, treatmentPercent: 100 }
    const rows = [
      row({ userId: 'a', module1LessonsCompleted: 4, capstone1Started: true, capstone1Submitted: true, capstone1Reviewed: true, anyCapstoneSubmitted: true, lessonsCompletedD30: 10 }),
      row({ userId: 'b', module1LessonsCompleted: 4, capstone1Started: true, capstone1Submitted: false, lessonsCompletedD30: 4 }),
    ]
    const s = computeCapstoneThresholdExperimentSummary(rows, treatmentAll).treatment
    expect(s.capstone1StartRate).toBe(1) // both started
    expect(s.capstone1SubmissionRate).toBe(0.5) // one submitted
    expect(s.capstone1ReviewRate).toBe(0.5)
    expect(s.anyCapstoneSubmissionRate).toBe(0.5)
    expect(s.meanLessonsCompletedD30).toBe(7) // (10 + 4) / 2
  })

  it('returns zeroed metrics for an empty cohort without dividing by zero', () => {
    const summary = computeCapstoneThresholdExperimentSummary([], config)
    expect(summary.control.n).toBe(0)
    expect(summary.control.capstone1SubmissionRate).toBe(0)
    expect(summary.treatment.meanLessonsCompletedD30).toBe(0)
  })
})
