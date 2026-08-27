/**
 * Curriculum Access — Pure Prerequisite Utility (Pre-Phase 7 Fix)
 *
 * Provides authoritative, deterministic functions for computing prerequisite
 * completeness and accessible lesson targets from the canonical 90-lesson
 * curriculum sequence + the user's actual completed lesson IDs.
 *
 * INVARIANTS:
 * - All calculations use the canonical global lesson order, never a count alone.
 * - No lesson is unlocked, reordered, or skipped by any function here.
 * - Access decisions are derived from actual completed lesson IDs, not totals.
 * - These functions are side-effect-free and require no database access.
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
