/**
 * Phase 8.1 — experiment readout service.
 *
 * Covers the row-assembly layer that wires the three orphaned aggregators into the admin surface:
 *   - one learner row is assembled correctly from users + progress + capstone rows;
 *   - the mappers feed each aggregator its own row shape, reproducing the aggregators' outputs;
 *   - empty cohorts are honest (zeros, not estimates);
 *   - a DB failure degrades to `failed: true` with zeroed summaries rather than throwing;
 *   - there is NO learner-facing route that exposes the readout (admin-only by construction).
 */

import { describe, it, expect, vi } from 'vitest'
import fs from 'fs'
import path from 'path'

import {
  assembleLearnerFacts,
  toRecutRows,
  toModuleEntryRows,
  toCapstoneThresholdRows,
} from '../admin/experiment-readout-service'
import { computeCapstoneThresholdExperimentSummary } from '../admin/capstone-threshold-experiment'
import { computeModuleEntryExperimentSummary } from '../admin/module-entry-experiment'
import { computeRecutExperimentSummary } from '../admin/recut-experiment'
import { getLessonIdsForModule } from '../curriculum-registry'

const FOUNDATIONS = getLessonIdsForModule('foundations')
const DISCOVERY = getLessonIdsForModule('discovery')

describe('assembleLearnerFacts (row assembly)', () => {
  it('derives per-learner facts from users + progress + capstone rows', () => {
    const users = [{ id: 'u1', created_at: '2026-01-01T00:00:00Z' }]
    const progress = [
      // 3 foundations lessons completed, two within D30, one deep dive opened
      { user_id: 'u1', lesson_id: FOUNDATIONS[0], status: 'completed', completed_at: '2026-01-02T00:00:00Z', deep_dive_opened_at: '2026-01-02T00:00:00Z' },
      { user_id: 'u1', lesson_id: FOUNDATIONS[1], status: 'completed', completed_at: '2026-01-10T00:00:00Z', deep_dive_opened_at: null },
      { user_id: 'u1', lesson_id: FOUNDATIONS[2], status: 'completed', completed_at: '2026-05-01T00:00:00Z', deep_dive_opened_at: null }, // outside D30
      // touched a second module (discovery) without completing
      { user_id: 'u1', lesson_id: DISCOVERY[0], status: 'in_progress', completed_at: null, deep_dive_opened_at: null },
      // progress for an unknown user is ignored
      { user_id: 'ghost', lesson_id: FOUNDATIONS[0], status: 'completed', completed_at: '2026-01-02T00:00:00Z', deep_dive_opened_at: null },
    ]
    const capstones = [
      { user_id: 'u1', module_slug: 'foundations', status: 'submitted' },
    ]

    const [f] = assembleLearnerFacts(users, progress, capstones)
    expect(f.userId).toBe('u1')
    expect(f.lessonsCompleted).toBe(3)
    expect(f.lessonsCompletedD30).toBe(2)
    expect(f.firstLessonCompleted).toBe(true)
    expect(f.deepDiveOpened).toBe(true)
    expect(f.primaryModuleCompletedCount).toBe(3)
    expect(f.modulesTouched).toBe(2) // foundations + discovery
    expect(f.capstone1Started).toBe(true)
    expect(f.capstone1Submitted).toBe(true)
    expect(f.capstone1Reviewed).toBe(false)
    expect(f.anyCapstoneSubmitted).toBe(true)
  })

  it('marks capstone1Reviewed only when the foundations submission is reviewed', () => {
    const users = [{ id: 'u1', created_at: '2026-01-01T00:00:00Z' }]
    const capstones = [{ user_id: 'u1', module_slug: 'foundations', status: 'reviewed' }]
    const [f] = assembleLearnerFacts(users, [], capstones)
    expect(f.capstone1Reviewed).toBe(true)
    expect(f.capstone1Submitted).toBe(true)
  })

  it('counts a capstone in another module as anyCapstoneSubmitted but not capstone-1', () => {
    const users = [{ id: 'u1', created_at: '2026-01-01T00:00:00Z' }]
    const capstones = [{ user_id: 'u1', module_slug: 'discovery', status: 'submitted' }]
    const [f] = assembleLearnerFacts(users, [], capstones)
    expect(f.anyCapstoneSubmitted).toBe(true)
    expect(f.capstone1Started).toBe(false)
    expect(f.capstone1Submitted).toBe(false)
  })
})

describe('mappers feed the aggregators and reproduce their outputs', () => {
  const users = Array.from({ length: 60 }, (_, i) => ({ id: `user-${i}`, created_at: '2026-01-01T00:00:00Z' }))
  const progress = users.flatMap((u) =>
    FOUNDATIONS.slice(0, 5).map((lessonId) => ({
      user_id: u.id,
      lesson_id: lessonId,
      status: 'completed',
      completed_at: '2026-01-05T00:00:00Z',
      deep_dive_opened_at: null,
    }))
  )
  const facts = assembleLearnerFacts(users, progress, [])

  it('produces control and treatment arms for every experiment', () => {
    const recut = computeRecutExperimentSummary(toRecutRows(facts), { enabled: true, treatmentPercent: 50 })
    const moduleEntry = computeModuleEntryExperimentSummary(toModuleEntryRows(facts), { enabled: true, treatmentPercent: 50, cohortStartMs: null })
    const capstone = computeCapstoneThresholdExperimentSummary(toCapstoneThresholdRows(facts), {
      enabled: true,
      treatmentPercent: 50,
      treatmentRequiredLessons: 4,
      cohortStartMs: null,
    })

    for (const s of [recut, moduleEntry, capstone]) {
      expect(s.control.n + s.treatment.n).toBe(facts.length)
      expect(s.control.n).toBeGreaterThan(0)
      expect(s.treatment.n).toBeGreaterThan(0)
    }

    // Each learner has 5 foundations lessons completed → eligible under the 4-lesson treatment gate
    // but NOT under the 8-lesson control gate. This proves the mapping carries the real counts.
    expect(capstone.treatment.eligibilityRate).toBe(1)
    expect(capstone.control.eligibilityRate).toBe(0)
  })
})

describe('empty cohort', () => {
  it('assembles to nothing and the aggregators zero out', () => {
    const facts = assembleLearnerFacts([], [], [])
    expect(facts).toHaveLength(0)
    const recut = computeRecutExperimentSummary(toRecutRows(facts))
    expect(recut.control.n).toBe(0)
    expect(recut.treatment.meanLessonsCompletedD30).toBe(0)
  })
})

describe('ExperimentReadoutService.getReadout — failure handling', () => {
  it('degrades to failed:true with zeroed summaries when the DB read throws', async () => {
    vi.resetModules()
    vi.doMock('next/cache', () => ({ unstable_cache: (fn: () => unknown) => fn }))
    vi.doMock('../supabase', () => ({
      createServiceRoleClient: () => {
        throw new Error('db down')
      },
    }))
    const { ExperimentReadoutService } = await import('../admin/experiment-readout-service')
    const readout = await ExperimentReadoutService.getReadout()
    expect(readout.failed).toBe(true)
    expect(readout.populationSize).toBe(0)
    expect(readout.recut.control.n).toBe(0)
    expect(readout.capstoneThreshold.treatment.n).toBe(0)
    vi.doUnmock('next/cache')
    vi.doUnmock('../supabase')
    vi.resetModules()
  })
})

describe('no learner-facing surface exposes the readout', () => {
  const appDir = path.join(__dirname, '..', '..', 'app')

  it('has no API route referencing the ExperimentReadoutService', () => {
    const apiDir = path.join(appDir, 'api')
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
          if (fs.readFileSync(full, 'utf8').includes('ExperimentReadoutService')) offenders.push(full)
        }
      }
    }
    if (fs.existsSync(apiDir)) walk(apiDir)
    expect(offenders).toEqual([])
  })

  it('serves the readout only from an admin (console) page', () => {
    const consolePage = path.join(appDir, 'admin', '(console)', 'analytics', 'experiments', 'page.tsx')
    expect(fs.existsSync(consolePage)).toBe(true)
    expect(fs.readFileSync(consolePage, 'utf8')).toContain('ExperimentReadoutService')
  })
})
