import { unstable_cache } from 'next/cache'

import { createServiceRoleClient } from '../supabase'
import { fetchAllRows } from './fetch-all'
import { getLessonIdsForModule, getModuleSlugForLessonId } from '@/lib/curriculum-registry'
import {
  computeRecutExperimentSummary,
  type RecutExperimentSummary,
  type RecutExperimentUserRow,
} from './recut-experiment'
import {
  computeModuleEntryExperimentSummary,
  type ModuleEntryExperimentSummary,
  type ModuleEntryExperimentUserRow,
} from './module-entry-experiment'
import {
  computeCapstoneThresholdExperimentSummary,
  type CapstoneThresholdExperimentSummary,
  type CapstoneThresholdExperimentUserRow,
} from './capstone-threshold-experiment'

/**
 * Phase 8.1 — experiment readout service (server-side, Phase 2 funnel layer).
 *
 * The Phase 4 recut, Phase 6 module-entry unlock and Phase 7 capstone-threshold experiments each
 * shipped a *pure* aggregator (recut's was added in Phase 8.1) but were wired to nothing, so none of
 * them could be concluded. This service is the row-assembly counterpart to `FunnelService`: it reads
 * the authoritative, server-side rows the app already writes (`users`, `user_lesson_progress`,
 * `capstone_submissions`), assembles ONE row per learner in a small number of grouped fetches, and
 * calls the three existing aggregators. It invents no metric and duplicates no experiment arithmetic
 * — every number comes back out of the aggregators.
 *
 * No GA4, no new event stream, no schema change: assignment for all three experiments is a
 * deterministic function of `users.id` (+ `created_at` for cohort-gated ones), so the arms are
 * reconstructed here without any persisted assignment. The aggregators segment the WHOLE population
 * by the variant each learner *would* receive, so the comparison is readable even while every flag
 * defaults to off.
 *
 * Cost: aggregate reads over `user_lesson_progress` can be sizeable, so the fetch+compute is wrapped
 * in `unstable_cache` (5-minute revalidate) — this is an admin dashboard, not a live meter. Access is
 * admin-only by construction: the only caller is an RSC inside the `(console)` route group, which
 * `AdminConsoleLayout` gates before it runs. There is deliberately no API route, so no learner-facing
 * surface can reach this data.
 */

/** The primary ("module 1") module whose lessons gate capstone-1 eligibility. */
const PRIMARY_MODULE_SLUG = 'foundations'

/** A capstone submission counts as "submitted" once it has left draft. */
const SUBMITTED_STATUSES = new Set(['submitted', 'reviewed'])

const D30_MS = 30 * 24 * 60 * 60 * 1000

interface UserRow {
  id: string
  created_at: string | null
}

interface ProgressRow {
  user_id: string
  lesson_id: string
  status: string
  completed_at: string | null
  deep_dive_opened_at: string | null
}

interface CapstoneRow {
  user_id: string | null
  module_slug: string
  status: string
}

/** Per-learner facts assembled once and mapped into each aggregator's row shape. */
interface LearnerFacts {
  userId: string
  createdAt: string | null
  lessonsCompleted: number
  lessonsCompletedD30: number
  firstLessonCompleted: boolean
  deepDiveOpened: boolean
  modulesTouched: number
  primaryModuleCompletedCount: number
  capstone1Started: boolean
  capstone1Submitted: boolean
  capstone1Reviewed: boolean
  anyCapstoneSubmitted: boolean
}

export interface ExperimentReadout {
  generatedAt: string
  /** Total learners the readout was assembled from (all arms, both experiments). */
  populationSize: number
  recut: RecutExperimentSummary
  moduleEntry: ModuleEntryExperimentSummary
  capstoneThreshold: CapstoneThresholdExperimentSummary
  /** True when the aggregation could not read the database; the summaries are zeroed. */
  failed?: boolean
}

function emptySummaries(generatedAt: string, failed: boolean): ExperimentReadout {
  const recut = computeRecutExperimentSummary([])
  const moduleEntry = computeModuleEntryExperimentSummary([])
  const capstoneThreshold = computeCapstoneThresholdExperimentSummary([])
  return { generatedAt, populationSize: 0, recut, moduleEntry, capstoneThreshold, failed }
}

/** Groups the flat fetch results into one `LearnerFacts` per known user. */
function assembleLearnerFacts(
  users: UserRow[],
  progress: ProgressRow[],
  capstones: CapstoneRow[]
): LearnerFacts[] {
  const primaryLessonIds = new Set(getLessonIdsForModule(PRIMARY_MODULE_SLUG))

  const facts = new Map<string, LearnerFacts>()
  const createdAtMs = new Map<string, number | null>()
  for (const u of users) {
    if (!u.id) continue
    const ms = u.created_at ? Date.parse(u.created_at) : NaN
    createdAtMs.set(u.id, Number.isFinite(ms) ? ms : null)
    facts.set(u.id, {
      userId: u.id,
      createdAt: u.created_at,
      lessonsCompleted: 0,
      lessonsCompletedD30: 0,
      firstLessonCompleted: false,
      deepDiveOpened: false,
      modulesTouched: 0,
      primaryModuleCompletedCount: 0,
      capstone1Started: false,
      capstone1Submitted: false,
      capstone1Reviewed: false,
      anyCapstoneSubmitted: false,
    })
  }

  // Track distinct modules each learner opened (any progress row), for module-switching.
  const touchedModules = new Map<string, Set<string>>()

  for (const p of progress) {
    const f = p.user_id ? facts.get(p.user_id) : undefined
    if (!f) continue // ignore progress for users outside the known set

    // module-switching: any lesson interaction counts as "touched". Unknown lessons stay distinct
    // (keyed by raw id) so they never collapse into a single bucket.
    const moduleForLesson = getModuleSlugForLessonId(p.lesson_id) ?? `unknown:${p.lesson_id}`
    let touched = touchedModules.get(f.userId)
    if (!touched) {
      touched = new Set<string>()
      touchedModules.set(f.userId, touched)
    }
    touched.add(moduleForLesson)

    if (p.deep_dive_opened_at) f.deepDiveOpened = true

    if (p.status === 'completed') {
      f.lessonsCompleted += 1
      f.firstLessonCompleted = true

      const created = createdAtMs.get(f.userId)
      if (created != null && p.completed_at) {
        const completedMs = Date.parse(p.completed_at)
        if (Number.isFinite(completedMs) && completedMs <= created + D30_MS) {
          f.lessonsCompletedD30 += 1
        }
      }

      if (primaryLessonIds.has(p.lesson_id)) {
        f.primaryModuleCompletedCount += 1
      }
    }
  }

  for (const c of capstones) {
    const f = c.user_id ? facts.get(c.user_id) : undefined
    if (!f) continue
    const isSubmitted = SUBMITTED_STATUSES.has(c.status)
    if (isSubmitted) f.anyCapstoneSubmitted = true
    if (c.module_slug === PRIMARY_MODULE_SLUG) {
      // A row existing at all (draft/submitted/reviewed) means the learner STARTED capstone-1.
      f.capstone1Started = true
      if (isSubmitted) f.capstone1Submitted = true
      if (c.status === 'reviewed') f.capstone1Reviewed = true
    }
  }

  for (const f of facts.values()) {
    f.modulesTouched = touchedModules.get(f.userId)?.size ?? 0
  }

  return [...facts.values()]
}

function toRecutRows(facts: LearnerFacts[]): RecutExperimentUserRow[] {
  return facts.map((f) => ({
    userId: f.userId,
    createdAt: f.createdAt,
    lessonsCompleted: f.lessonsCompleted,
    lessonsCompletedD30: f.lessonsCompletedD30,
    firstLessonCompleted: f.firstLessonCompleted,
    deepDiveOpened: f.deepDiveOpened,
  }))
}

function toModuleEntryRows(facts: LearnerFacts[]): ModuleEntryExperimentUserRow[] {
  return facts.map((f) => ({
    userId: f.userId,
    createdAt: f.createdAt,
    lessonsCompletedD30: f.lessonsCompletedD30,
    firstLessonCompleted: f.firstLessonCompleted,
    module1Completed: f.primaryModuleCompletedCount >= 10,
    // Recommended-module completion needs each learner's onboarding recommendation, which is not
    // derivable from progress rows alone; report it as unknown (null) rather than fabricate it.
    recommendedModuleCompleted: null,
    modulesTouched: f.modulesTouched,
  }))
}

function toCapstoneThresholdRows(facts: LearnerFacts[]): CapstoneThresholdExperimentUserRow[] {
  return facts.map((f) => ({
    userId: f.userId,
    createdAt: f.createdAt,
    module1LessonsCompleted: f.primaryModuleCompletedCount,
    capstone1Started: f.capstone1Started,
    capstone1Submitted: f.capstone1Submitted,
    capstone1Reviewed: f.capstone1Reviewed,
    anyCapstoneSubmitted: f.anyCapstoneSubmitted,
    lessonsCompletedD30: f.lessonsCompletedD30,
  }))
}

async function aggregateExperimentReadout(): Promise<ExperimentReadout> {
  const generatedAt = new Date().toISOString()
  try {
    const supabase = createServiceRoleClient()

    const [users, progress, capstones] = await Promise.all([
      fetchAllRows<UserRow>((from, to) =>
        supabase.from('users').select('id, created_at').range(from, to)
      ),
      fetchAllRows<ProgressRow>((from, to) =>
        supabase
          .from('user_lesson_progress')
          .select('user_id, lesson_id, status, completed_at, deep_dive_opened_at')
          .range(from, to)
      ),
      fetchAllRows<CapstoneRow>((from, to) =>
        supabase.from('capstone_submissions').select('user_id, module_slug, status').range(from, to)
      ),
    ])

    const facts = assembleLearnerFacts(users, progress, capstones)

    return {
      generatedAt,
      populationSize: facts.length,
      recut: computeRecutExperimentSummary(toRecutRows(facts)),
      moduleEntry: computeModuleEntryExperimentSummary(toModuleEntryRows(facts)),
      capstoneThreshold: computeCapstoneThresholdExperimentSummary(toCapstoneThresholdRows(facts)),
    }
  } catch (err) {
    console.error('[ExperimentReadoutService] Failed to aggregate experiment readout:', err)
    return emptySummaries(generatedAt, true)
  }
}

export class ExperimentReadoutService {
  /**
   * The control-vs-treatment readout for all three cohort experiments, cached briefly.
   *
   * Pure aggregation over rows the app already writes; safe to call from an admin RSC. Any DB
   * failure degrades to zeroed summaries with `failed: true` so the surface renders an honest error
   * state rather than throwing.
   */
  static async getReadout(): Promise<ExperimentReadout> {
    const cached = unstable_cache(() => aggregateExperimentReadout(), ['admin-experiment-readout'], {
      revalidate: 300,
      tags: ['admin-experiment-readout'],
    })
    return cached()
  }

  /** Direct (uncached) assembly — exposed for tests and back-testing. */
  static assemble = assembleLearnerFacts
}

export { assembleLearnerFacts, toRecutRows, toModuleEntryRows, toCapstoneThresholdRows }
