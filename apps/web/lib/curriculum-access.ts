/**
 * Curriculum Access — Pure Prerequisite Utility (Pre-Phase 7 Fix)
 *
 * Provides authoritative, deterministic functions for computing prerequisite
 * completeness and accessible lesson targets from the canonical 90-lesson
 * curriculum sequence + the user's actual completed lesson IDs.
 *
 * INVARIANTS:
 * - All calculations use the canonical global lesson order, never a count alone.
 * - Access decisions are derived from actual completed lesson IDs, not totals.
 * - These functions are side-effect-free and require no database access.
 *
 * PHASE 6 AMENDMENT: the original invariant "no lesson is unlocked, reordered, or skipped"
 * still holds for the legacy helpers below and for the CONTROL arm of `resolveLessonAccess`.
 * The module-entry unlock TREATMENT (see `resolveLessonAccess`) intentionally makes each
 * module's ENTRY lesson accessible ahead of earlier modules — never reordering WITHIN a module,
 * never changing completion/XP/quiz semantics. See docs/decisions/
 * ADR-008-phase-6-module-entry-unlock.md.
 *
 * References: Architecture.md §5, PRD.md §4.3
 */

import type { CurriculumEntry } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PrerequisiteRange {
  /**
   * 0-based index of the first incomplete prerequisite lesson in the curriculum.
   * null if all prerequisites for the target lesson are complete.
   */
  firstIncompleteIndex: number | null

  /**
   * 0-based index of the last required prerequisite (always targetIndex - 1).
   * -1 if targetIndex is 0 (Lesson 1 has no prerequisites).
   */
  lastPrerequisiteIndex: number
}

export interface ModuleCtaTarget {
  /**
   * The lesson that should be the CTA target within this module.
   * null if the module has no lessons.
   */
  lesson: CurriculumEntry | null

  /**
   * True if the target lesson is accessible to the user right now.
   * False if the user must complete prerequisite lessons first.
   */
  isAccessible: boolean

  /**
   * When isAccessible is false, this is the first actionable lesson the
   * user should complete (i.e., the first incomplete lesson in the global
   * curriculum, which may be in a prior module).
   */
  firstActionableLesson: CurriculumEntry | null
}

// ─── Core Prerequisite Calculator ────────────────────────────────────────────

/**
 * Computes the range of incomplete prerequisite lessons for a given target.
 *
 * REQUIRED_PREREQUISITES(lesson N) = ALL canonical lessons before lesson N.
 * INCOMPLETE_PREREQUISITES = REQUIRED_PREREQUISITES − USER_COMPLETED_LESSONS.
 *
 * Access is decided from actual completed lesson IDs, never from a count.
 *
 * @param completedIds  Set of stable les_XXXXXX IDs completed by the user
 * @param curriculumIds Array of all lesson IDs in canonical global order (90 total)
 * @param targetIndex   0-based index of the lesson the user is trying to access
 */
export function getCanonicalPrerequisiteRange(
  completedIds: Set<string>,
  curriculumIds: string[],
  targetIndex: number
): PrerequisiteRange {
  // Lesson at index 0 has no prerequisites
  if (targetIndex <= 0) {
    return { firstIncompleteIndex: null, lastPrerequisiteIndex: -1 }
  }

  const lastPrerequisiteIndex = targetIndex - 1

  // Scan from the beginning of the curriculum to find the first incomplete prerequisite
  let firstIncompleteIndex: number | null = null
  for (let i = 0; i < targetIndex; i++) {
    if (!completedIds.has(curriculumIds[i])) {
      firstIncompleteIndex = i
      break
    }
  }

  return { firstIncompleteIndex, lastPrerequisiteIndex }
}

// ─── First Accessible Lesson Index ────────────────────────────────────────────

/**
 * Returns the 0-based index of the first lesson in the global curriculum
 * that the user has not yet completed. This is the "next actionable" lesson.
 *
 * Returns -1 if all lessons are completed.
 */
export function getFirstActionableLessonIndex(
  completedIds: Set<string>,
  curriculumIds: string[]
): number {
  for (let i = 0; i < curriculumIds.length; i++) {
    if (!completedIds.has(curriculumIds[i])) {
      return i
    }
  }
  return -1 // All completed
}

// ─── Module CTA Target Resolver ────────────────────────────────────────────────

/**
 * Resolves the correct CTA target lesson for a module card on the academy page.
 *
 * A lesson within the module is considered accessible if and only if ALL lessons
 * preceding it in the GLOBAL curriculum order are completed. This preserves
 * sequential integrity — no lesson in a later module can be accessed before
 * all prior-module lessons are complete.
 *
 * When the personalized recommended module is not yet reachable (e.g. Module 2
 * for a brand-new user), isAccessible=false and firstActionableLesson points to
 * the canonical next step (e.g. Lesson 1), giving the user a valid CTA.
 *
 * @param moduleLessons  Lessons belonging to this module (in module order)
 * @param globalLessons  All 90 lessons in canonical global order
 * @param completedIds   Set of completed lesson IDs for the current user
 */
export function resolveModuleCtaTarget(
  moduleLessons: CurriculumEntry[],
  globalLessons: CurriculumEntry[],
  completedIds: Set<string>
): ModuleCtaTarget {
  if (moduleLessons.length === 0) {
    return { lesson: null, isAccessible: false, firstActionableLesson: null }
  }

  // Build a lookup: lessonId → global 0-based index
  const globalIndexMap = new Map<string, number>()
  for (let i = 0; i < globalLessons.length; i++) {
    globalIndexMap.set(globalLessons[i].id, i)
  }

  const globalIds = globalLessons.map((l) => l.id)

  // The first actionable lesson for this user across the entire curriculum
  const firstActionableGlobalIdx = getFirstActionableLessonIndex(completedIds, globalIds)

  // Find the first lesson in this module that is not yet completed
  const firstUncompletedInModule = moduleLessons.find((l) => !completedIds.has(l.id))
  const targetLesson = firstUncompletedInModule ?? moduleLessons[0]

  // Determine whether the target lesson is accessible:
  // A lesson is accessible if its 0-based global index is ≤ the first actionable index
  // (meaning all lessons before it in the curriculum are already completed).
  const targetGlobalIdx = globalIndexMap.get(targetLesson.id) ?? -1

  const isAccessible =
    firstActionableGlobalIdx === -1 || // All lessons complete
    targetGlobalIdx <= firstActionableGlobalIdx

  // If not accessible, resolve the first actionable lesson globally
  let firstActionableLesson: CurriculumEntry | null = null
  if (!isAccessible && firstActionableGlobalIdx !== -1) {
    firstActionableLesson = globalLessons[firstActionableGlobalIdx] ?? null
  }

  return { lesson: targetLesson, isAccessible, firstActionableLesson }
}

// ─── Phase 6: Module-Entry Unlock Model ─────────────────────────────────────────
//
// Phase 6 replaces the global sequential lock with a module-entry unlock model:
//   - Every module's FIRST lesson (by global order) is unlocked.
//   - Within a module, lesson N requires the previous lesson in that SAME module.
// Cross-module sequencing is dropped ONLY for the treatment arm; the control arm keeps the
// exact global-sequential behaviour above so no existing learner loses access and rollback is
// a pure revert. Grandfathering is baked in here (not in the flag) so it is variant-independent:
// any lesson the learner has already OPENED (has a progress row for) stays accessible even if
// the flag is later switched back to control.
//
// See docs/decisions/ for the amended invariant: personalization/access may now unlock a
// later module's entry lesson ahead of earlier modules — but never reorders WITHIN a module,
// never changes completion/XP/quiz semantics, and never weakens capstone gating.

/** The five states a lesson can be in for a given learner. */
export type LessonAccessState = 'completed' | 'in_progress' | 'unlocked' | 'locked'

export type LessonAccessReason =
  | 'override' // curriculum_access_override grants everything
  | 'completed' // already completed
  | 'grandfathered' // already opened (in-progress/any row) — survives a flag flip
  | 'module_entry' // treatment: first lesson of its module
  | 'prev_in_module_completed' // treatment: previous lesson in the same module is complete
  | 'global_sequential' // control: all globally-earlier lessons are complete
  | 'locked' // prerequisite unmet

export interface LessonAccessInfo {
  state: LessonAccessState
  /** True when the learner may open this lesson right now. */
  isAccessible: boolean
  /**
   * When locked, the lesson the learner must complete to unlock this one. Under treatment this
   * is the previous lesson in the SAME module; under control it is the first incomplete lesson
   * in the global sequence. Null when accessible or when there is no prerequisite.
   */
  prerequisiteLessonId: string | null
  reason: LessonAccessReason
}

export interface CurriculumModuleIndex {
  /** All lesson ids in canonical global order. */
  globalIds: string[]
  /** globalIds → 0-based index. */
  globalIndex: Map<string, number>
  /** Set of module-entry lesson ids (the first lesson of each module by global order). */
  entryIds: Set<string>
  /** lessonId → the previous lesson id within the SAME module (null for a module entry). */
  prevInModule: Map<string, string | null>
}

/**
 * Precomputes module boundaries from the canonical curriculum. Grouping by module (rather than
 * assuming contiguous blocks) keeps this correct even if a module's lessons were ever
 * interleaved in the global order. Pure and side-effect-free.
 */
export function buildCurriculumModuleIndex(
  curriculum: Pick<CurriculumEntry, 'id' | 'module'>[]
): CurriculumModuleIndex {
  const globalIds = curriculum.map((l) => l.id)
  const globalIndex = new Map<string, number>()
  globalIds.forEach((id, i) => globalIndex.set(id, i))

  const byModule = new Map<string, string[]>()
  for (const l of curriculum) {
    const arr = byModule.get(l.module) ?? []
    arr.push(l.id)
    byModule.set(l.module, arr)
  }

  const entryIds = new Set<string>()
  const prevInModule = new Map<string, string | null>()
  for (const ids of byModule.values()) {
    ids.forEach((id, i) => {
      if (i === 0) {
        entryIds.add(id)
        prevInModule.set(id, null)
      } else {
        prevInModule.set(id, ids[i - 1])
      }
    })
  }

  return { globalIds, globalIndex, entryIds, prevInModule }
}

export interface LessonAccessContext {
  /** Canonical curriculum in global order. Ignored when `index` is supplied. */
  curriculum?: Pick<CurriculumEntry, 'id' | 'module'>[]
  /** Prebuilt module index (preferred in loops so it is built once). */
  index?: CurriculumModuleIndex
  /** Lesson ids the learner has completed (status = 'completed'). */
  completedIds: Set<string>
  /**
   * Lesson ids the learner has OPENED — any progress row (in_progress OR completed). Used for
   * variant-independent grandfathering. Optional; when omitted, only completion grandfathers.
   */
  openedIds?: Set<string>
  /** True when the learner is in the module-entry unlock treatment. */
  treatment: boolean
  /** curriculum_access_override — unlocks everything, unchanged from prior phases. */
  override?: boolean
}

/**
 * Authoritative, pure per-lesson access decision shared by the Academy list, the Search
 * overlay and the lesson-page gate, for BOTH experiment arms.
 *
 * Precedence (each step only ever ADDS access relative to control, so no learner can lose
 * access that today's global-sequential model grants):
 *   1. completed            → 'completed'
 *   2. override             → 'unlocked'
 *   3. opened (grandfather) → 'in_progress'   (variant-independent; survives a flag flip)
 *   4. treatment: module-entry OR previous-in-module completed → 'unlocked'
 *   5. control baseline: all globally-earlier lessons completed → 'unlocked'
 *   6. otherwise            → 'locked' (with the correct module-scoped / global prerequisite)
 *
 * Never mutates its inputs.
 */
export function resolveLessonAccess(
  lessonId: string,
  ctx: LessonAccessContext
): LessonAccessInfo {
  const index = ctx.index ?? buildCurriculumModuleIndex(ctx.curriculum ?? [])
  const { completedIds, openedIds, treatment, override } = ctx

  // 1. Completed lessons are always accessible (review mode) and reported as completed.
  if (completedIds.has(lessonId)) {
    return { state: 'completed', isAccessible: true, prerequisiteLessonId: null, reason: 'completed' }
  }

  // 2. Override unlocks everything (unchanged from prior phases).
  if (override) {
    return { state: 'unlocked', isAccessible: true, prerequisiteLessonId: null, reason: 'override' }
  }

  // 3. Grandfathering: any lesson already opened stays accessible regardless of the variant.
  //    This is what makes the experiment rollback-safe — a treatment learner who opened a
  //    module-entry lesson does not lose it when the flag flips back to control.
  if (openedIds?.has(lessonId)) {
    return { state: 'in_progress', isAccessible: true, prerequisiteLessonId: null, reason: 'grandfathered' }
  }

  const globalIdx = index.globalIndex.get(lessonId) ?? -1

  if (treatment) {
    // 4a. Module-entry lessons are unlocked.
    if (index.entryIds.has(lessonId)) {
      return { state: 'unlocked', isAccessible: true, prerequisiteLessonId: null, reason: 'module_entry' }
    }
    // 4b. Otherwise the previous lesson in the SAME module must be complete.
    const prevId = index.prevInModule.get(lessonId) ?? null
    if (prevId && completedIds.has(prevId)) {
      return {
        state: 'unlocked',
        isAccessible: true,
        prerequisiteLessonId: null,
        reason: 'prev_in_module_completed',
      }
    }
    return { state: 'locked', isAccessible: false, prerequisiteLessonId: prevId, reason: 'locked' }
  }

  // 5. Control baseline — the pre-Phase-6 global-sequential rule, byte-for-byte:
  //    accessible iff every globally-earlier lesson is complete.
  if (globalIdx <= 0) {
    return { state: 'unlocked', isAccessible: true, prerequisiteLessonId: null, reason: 'global_sequential' }
  }
  const range = getCanonicalPrerequisiteRange(completedIds, index.globalIds, globalIdx)
  if (range.firstIncompleteIndex === null) {
    return { state: 'unlocked', isAccessible: true, prerequisiteLessonId: null, reason: 'global_sequential' }
  }
  return {
    state: 'locked',
    isAccessible: false,
    prerequisiteLessonId: index.globalIds[range.firstIncompleteIndex] ?? null,
    reason: 'locked',
  }
}
