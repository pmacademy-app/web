/**
 * Phase 6 — experiment measurement aggregation (Step 11).
 *
 * Confirms the deterministic-cohort readout distinguishes treatment/control and computes the
 * primary (D30 lessons completed), guardrail (first-lesson completion) and secondary metrics
 * purely from progress-derived rows — no new events, no persisted assignment.
 */

import { describe, it, expect } from 'vitest'
import {
  computeModuleEntryExperimentSummary,
  type ModuleEntryExperimentUserRow,
} from '../admin/module-entry-experiment'

const CONFIG = { enabled: true, treatmentPercent: 50, cohortStartMs: null }

function makeRows(n: number): ModuleEntryExperimentUserRow[] {
  return Array.from({ length: n }, (_, i) => ({
    userId: `user-${i}`,
    createdAt: '2026-03-01T00:00:00Z',
    lessonsCompletedD30: i % 10,
    firstLessonCompleted: i % 2 === 0,
    module1Completed: i % 5 === 0,
    recommendedModuleCompleted: i % 3 === 0,
    modulesTouched: (i % 4) + 1,
  }))
}

describe('computeModuleEntryExperimentSummary', () => {
  it('splits learners into both cohorts deterministically', () => {
    const summary = computeModuleEntryExperimentSummary(makeRows(1000), CONFIG)
    expect(summary.control.n + summary.treatment.n).toBe(1000)
    expect(summary.control.n).toBeGreaterThan(0)
    expect(summary.treatment.n).toBeGreaterThan(0)
  })

  it('computes the primary + guardrail + secondary metrics per cohort', () => {
    const rows: ModuleEntryExperimentUserRow[] = [
      { userId: 'a', createdAt: '2026-03-01T00:00:00Z', lessonsCompletedD30: 4, firstLessonCompleted: true, module1Completed: true, recommendedModuleCompleted: true, modulesTouched: 2 },
      { userId: 'b', createdAt: '2026-03-01T00:00:00Z', lessonsCompletedD30: 2, firstLessonCompleted: true, module1Completed: false, recommendedModuleCompleted: false, modulesTouched: 1 },
    ]
    const summary = computeModuleEntryExperimentSummary(rows, { enabled: true, treatmentPercent: 100, cohortStartMs: null })
    // 100% treatment → both in treatment
    expect(summary.treatment.n).toBe(2)
    expect(summary.control.n).toBe(0)
    expect(summary.treatment.meanLessonsCompletedD30).toBe(3) // (4+2)/2
    expect(summary.treatment.firstLessonCompletionRate).toBe(1) // both completed first lesson
    expect(summary.treatment.module1CompletionRate).toBe(0.5)
    expect(summary.treatment.recommendedModuleCompletionRate).toBe(0.5)
    expect(summary.treatment.moduleSwitchRate).toBe(0.5)
  })

  it('handles empty cohorts without dividing by zero', () => {
    const summary = computeModuleEntryExperimentSummary([], CONFIG)
    expect(summary.control.meanLessonsCompletedD30).toBe(0)
    expect(summary.control.recommendedModuleCompletionRate).toBeNull()
  })

  it('leaves recommendedModuleCompletionRate null when no learner has a known value', () => {
    const rows: ModuleEntryExperimentUserRow[] = [
      { userId: 'a', createdAt: '2026-03-01T00:00:00Z', lessonsCompletedD30: 1, firstLessonCompleted: true, module1Completed: false, recommendedModuleCompleted: null, modulesTouched: 1 },
    ]
    const summary = computeModuleEntryExperimentSummary(rows, { enabled: true, treatmentPercent: 100, cohortStartMs: null })
    expect(summary.treatment.recommendedModuleCompletionRate).toBeNull()
  })
})
