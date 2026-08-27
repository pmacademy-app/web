/**
 * Pre-Phase 7 Curriculum Prerequisite Access Tests
 *
 * Tests all 21 required scenarios:
 * - Access prerequisite tests (1–6)
 * - Personalization tests (7–12)
 * - Regression tests (13–17)
 * - Data remediation confirmation (18–21)
 *
 * All tests operate on actual lesson IDs + completed Sets — never on counts alone.
 */

import { describe, it, expect } from 'vitest'
import {
  getCanonicalPrerequisiteRange,
  getFirstActionableLessonIndex,
  resolveModuleCtaTarget,
} from '../curriculum-access'
import {
  resolvePersonalizedPath,
  resolveNextRecommendedMilestone,
} from '../personalization/path-resolver'
import type { CurriculumEntry } from '@/types'

// ─── Shared Fixtures ─────────────────────────────────────────────────────────

// 90-lesson canonical curriculum across 9 modules (10 lessons each)
// using the same slug order as the real curriculum
const MODULE_SLUGS = [
  'foundations', // Module 1 (lessons 1-10)
  'discovery',   // Module 2 (lessons 11-20)
  'design',      // Module 3 (lessons 21-30)
  'execution',   // Module 4 (lessons 31-40)
  'growth',      // Module 5 (lessons 41-50)
  'leadership',  // Module 6 (lessons 51-60)
  'technical',   // Module 7 (lessons 61-70)
  'strategy',    // Module 8 (lessons 71-80)
  'capstone',    // Module 9 (lessons 81-90)
]

const mock90Lessons: CurriculumEntry[] = Array.from({ length: 90 }, (_, i) => {
  const modIdx = Math.floor(i / 10)
  const moduleSlug = MODULE_SLUGS[modIdx]
  return {
    id: `les_test_${String(i + 1).padStart(3, '0')}`,
    order: i + 1,
    title: `Lesson ${i + 1}`,
    module: moduleSlug,
    estimatedReadingTime: 5,
  } as CurriculumEntry
})

const curriculumIds = mock90Lessons.map((l) => l.id)

function lessonIdsFor(startOrder: number, endOrder: number): string[] {
  return mock90Lessons
    .filter((l) => l.order >= startOrder && l.order <= endOrder)
    .map((l) => l.id)
}


// ─── 1. Access Prerequisite Tests ────────────────────────────────────────────

describe('1. Access Prerequisite Tests', () => {
  // TEST 1: New user attempting Lesson 11 — Lessons 1–10 must be identified
  it('1.1 New user (0 completed) attempting Lesson 11: prerequisites = Lessons 1–10, Lesson 1 NOT omitted', () => {
    const globalIndex = 10 // Lesson 11 = index 10
    const result = getCanonicalPrerequisiteRange(new Set(), curriculumIds, globalIndex)

    expect(result.firstIncompleteIndex).toBe(0) // Lesson 1 (index 0)
    expect(result.lastPrerequisiteIndex).toBe(9) // Lesson 10 (index 9)
    // Verify Lesson 1 is explicitly the first incomplete prerequisite
    expect(curriculumIds[result.firstIncompleteIndex!]).toBe('les_test_001')
    expect(curriculumIds[result.lastPrerequisiteIndex]).toBe('les_test_010')
  })

  // TEST 2: User completed Lessons 1–5 attempting Lesson 11 — prerequisites = Lessons 6–10
  it('1.2 User with Lessons 1–5 completed attempting Lesson 11: incomplete prerequisites = 6–10', () => {
    const completed = new Set(lessonIdsFor(1, 5))
    const result = getCanonicalPrerequisiteRange(completed, curriculumIds, 10)

    expect(result.firstIncompleteIndex).toBe(5) // Lesson 6 (index 5)
    expect(result.lastPrerequisiteIndex).toBe(9) // Lesson 10 (index 9)
    expect(curriculumIds[result.firstIncompleteIndex!]).toBe('les_test_006')
  })

  // TEST 3: User completed Lessons 1–10 attempting Lesson 11 — accessible
  it('1.3 User with Lessons 1–10 completed attempting Lesson 11: no incomplete prerequisites', () => {
    const completed = new Set(lessonIdsFor(1, 10))
    const result = getCanonicalPrerequisiteRange(completed, curriculumIds, 10)

    expect(result.firstIncompleteIndex).toBeNull()
    expect(result.lastPrerequisiteIndex).toBe(9)
  })

  // TEST 4: Non-contiguous completion — Lesson 7 missing
  it('1.4 Non-contiguous: completed 1–6,8–10 (missing Lesson 7) attempting Lesson 11: blocked at Lesson 7', () => {
    // Complete 1-6 and 8-10 (Lesson 7 is missing)
    const ids = [
      ...lessonIdsFor(1, 6),
      ...lessonIdsFor(8, 10),
    ]
    const completed = new Set(ids)

    // Count-based shortcut would say "10 lessons complete = OK"
    expect(completed.size).toBe(9) // 9 IDs, not 10

    const result = getCanonicalPrerequisiteRange(completed, curriculumIds, 10)
    expect(result.firstIncompleteIndex).toBe(6) // Lesson 7 (index 6)
    expect(curriculumIds[result.firstIncompleteIndex!]).toBe('les_test_007')
    // Lesson 11 is still blocked — Lesson 7 is identified as the missing prerequisite
  })

  // TEST 4b: Count-based shortcut cannot unlock — explicit verification
  it('1.4b A set of 10 completed lessons that excludes Lesson 7 does NOT unlock Lesson 11', () => {
    // User has 10 lessons but they include Lesson 11 itself (which they shouldn't be credited for)
    // Simulating a scenario with count=10 but Lesson 7 missing
    const ids = [
      ...lessonIdsFor(1, 6),
      ...lessonIdsFor(8, 11), // skips 7, includes 11
    ]
    const completed = new Set(ids)
    expect(completed.size).toBe(10) // count is 10

    // The canonical prerequisite range scan still finds Lesson 7 as first incomplete
    const result = getCanonicalPrerequisiteRange(completed, curriculumIds, 10) // Lesson 11 = index 10
    expect(result.firstIncompleteIndex).toBe(6) // Lesson 7 — count alone didn't fool it
    expect(curriculumIds[result.firstIncompleteIndex!]).toBe('les_test_007')
  })

  // TEST 5: Attempting Lesson 1 — no prerequisite required
  it('1.5 Attempting Lesson 1 (index 0): no prerequisites ever required', () => {
    const result = getCanonicalPrerequisiteRange(new Set(), curriculumIds, 0)
    expect(result.firstIncompleteIndex).toBeNull()
    expect(result.lastPrerequisiteIndex).toBe(-1)
  })

  it('1.5b Lesson 1 is always accessible (first actionable index = 0 for new user)', () => {
    const idx = getFirstActionableLessonIndex(new Set(), curriculumIds)
    expect(idx).toBe(0)
    expect(curriculumIds[idx]).toBe('les_test_001')
  })

  // TEST 6: Attempting Lesson 90 — all 89 earlier lessons correctly evaluated
  it('1.6 Attempting Lesson 90 (index 89): all 89 prerequisites evaluated correctly', () => {
    // User completed 1–88
    const completed = new Set(lessonIdsFor(1, 88))
    const result = getCanonicalPrerequisiteRange(completed, curriculumIds, 89)

    expect(result.firstIncompleteIndex).toBe(88) // Lesson 89 (index 88)
    expect(result.lastPrerequisiteIndex).toBe(88)
    expect(curriculumIds[result.firstIncompleteIndex!]).toBe('les_test_089')
  })

  it('1.6b Attempting Lesson 90 with all 89 previous lessons complete: accessible', () => {
    const completed = new Set(lessonIdsFor(1, 89))
    const result = getCanonicalPrerequisiteRange(completed, curriculumIds, 89)
    expect(result.firstIncompleteIndex).toBeNull()
  })
})

// ─── 2. Module CTA Target (First Actionable Lesson) ─────────────────────────

describe('2. Module CTA Target Resolution', () => {
  const module1Lessons = mock90Lessons.filter((l) => l.module === 'foundations') // 1-10
  const module2Lessons = mock90Lessons.filter((l) => l.module === 'discovery')   // 11-20

  it('2.1 New user: Module 1 CTA points to Lesson 1, isAccessible=true', () => {
    const result = resolveModuleCtaTarget(module1Lessons, mock90Lessons, new Set())
    expect(result.lesson?.id).toBe('les_test_001')
    expect(result.isAccessible).toBe(true)
    expect(result.firstActionableLesson).toBeNull()
  })

  it('2.2 New user: Module 2 CTA isAccessible=false, firstActionableLesson=Lesson 1', () => {
    const result = resolveModuleCtaTarget(module2Lessons, mock90Lessons, new Set())
    // Module 2 first lesson (Lesson 11) is NOT accessible for a new user
    expect(result.isAccessible).toBe(false)
    // The first actionable lesson globally is Lesson 1
    expect(result.firstActionableLesson?.id).toBe('les_test_001')
    expect(result.firstActionableLesson?.order).toBe(1)
    // The target lesson is still the first uncompleted in module 2
    expect(result.lesson?.id).toBe('les_test_011')
  })

  it('2.3 User with Lessons 1–10 done: Module 2 CTA isAccessible=true, points to Lesson 11', () => {
    const completed = new Set(lessonIdsFor(1, 10))
    const result = resolveModuleCtaTarget(module2Lessons, mock90Lessons, completed)
    expect(result.isAccessible).toBe(true)
    expect(result.lesson?.id).toBe('les_test_011')
    expect(result.firstActionableLesson).toBeNull()
  })

  it('2.4 User completed Lessons 1–15: Module 2 CTA points to Lesson 16 (next uncompleted in module)', () => {
    const completed = new Set(lessonIdsFor(1, 15))
    const result = resolveModuleCtaTarget(module2Lessons, mock90Lessons, completed)
    expect(result.isAccessible).toBe(true)
    expect(result.lesson?.id).toBe('les_test_016')
  })

  it('2.5 All lessons completed: all modules return isAccessible=true', () => {
    const completed = new Set(lessonIdsFor(1, 90))
    const result = resolveModuleCtaTarget(module2Lessons, mock90Lessons, completed)
    expect(result.isAccessible).toBe(true)
  })
})

// ─── 3. Personalization Tests ────────────────────────────────────────────────

describe('3. Personalization Tests', () => {
  // TEST 7: Personalized target produces a valid actionable path
  it('3.7 Personalized recommendation (Module 2/discovery) for new user: resolveNextRecommendedMilestone returns Lesson 1 (not Lesson 11)', () => {
    const path = resolvePersonalizedPath({ goal: 'grow_career', career_role: 'experienced' })
    // Experienced user → recommended module: strategy (not foundations)
    expect(path.isPersonalized).toBe(true)

    const nextMilestone = resolveNextRecommendedMilestone(path, new Set(), mock90Lessons)
    // INVARIANT: Even for an experienced user, Lesson 1 must be the first action
    expect(nextMilestone?.lesson.id).toBe('les_test_001')
    expect(nextMilestone?.order).toBe(1)
  })

  // TEST 8: Recommendation never points to locked lesson as immediate CTA
  it('3.8 resolveModuleCtaTarget never returns a locked lesson as the isAccessible CTA for a new user', () => {
    // Simulate all 9 modules
    for (const moduleSlug of MODULE_SLUGS) {
      const moduleLessons = mock90Lessons.filter((l) => l.module === moduleSlug)
      const result = resolveModuleCtaTarget(moduleLessons, mock90Lessons, new Set())
      if (!result.isAccessible) {
        // When inaccessible, firstActionableLesson must be Lesson 1 (always accessible)
        expect(result.firstActionableLesson?.order).toBe(1)
        expect(result.firstActionableLesson?.id).toBe('les_test_001')
      } else {
        // Only Module 1 is accessible to a brand-new user
        expect(moduleSlug).toBe('foundations')
      }
    }
  })

  // TEST 9: Beginner/default learner follows canonical sequence
  it('3.9 Beginner learner always starts at Lesson 1 regardless of recommended module', () => {
    const path = resolvePersonalizedPath({ goal: 'become_pm', career_role: 'beginner' })
    expect(path.recommendedModuleSlug).toBe('foundations')

    const nextMilestone = resolveNextRecommendedMilestone(path, new Set(), mock90Lessons)
    expect(nextMilestone?.lesson.id).toBe('les_test_001')
    expect(nextMilestone?.order).toBe(1)
  })

  // TEST 10: Experienced learner with personalized target receives valid behavior
  it('3.10 Experienced learner (strategy module) with partial completion stays sequential', () => {
    const path = resolvePersonalizedPath({ goal: 'grow_career', career_role: 'experienced' })
    expect(path.recommendedModuleSlug).toBe('strategy')

    // User has completed Lessons 1–25
    const completed = new Set(lessonIdsFor(1, 25))
    const nextMilestone = resolveNextRecommendedMilestone(path, completed, mock90Lessons)

    expect(nextMilestone?.lesson.id).toBe('les_test_026')
    expect(nextMilestone?.order).toBe(26)
    // Strategy module starts at Lesson 71, so this is NOT in the target module yet
    expect(nextMilestone?.isTargetModuleLesson).toBe(false)
  })

  // TEST 11: Legacy user with null personalization data still works
  it('3.11 Legacy user with null personalization still gets a valid milestone (Lesson 1 if new)', () => {
    const path = resolvePersonalizedPath(null)
    expect(path.isPersonalized).toBe(false)

    const nextMilestone = resolveNextRecommendedMilestone(path, new Set(), mock90Lessons)
    expect(nextMilestone).not.toBeNull()
    expect(nextMilestone?.lesson.id).toBe('les_test_001')
  })

  // TEST 12: Invalid/custom goal data does not break progression
  it('3.12 Custom/unknown goal data does not break sequential progression', () => {
    const path = resolvePersonalizedPath({
      goal: 'Build a rocket ship product',
      career_role: 'some-unknown-role',
      onboarding_topics: ['nonexistent_topic'],
    })
    expect(path.isPersonalized).toBe(true)
    // Should fall back to foundations (unknown goal → no recommendedModule match)
    expect(path.recommendedModuleSlug).toBe('foundations')

    const nextMilestone = resolveNextRecommendedMilestone(path, new Set(), mock90Lessons)
    expect(nextMilestone?.lesson.id).toBe('les_test_001')
  })
})

// ─── 4. Regression Tests ─────────────────────────────────────────────────────

describe('4. Regression Tests — Prior Phase Invariants', () => {
  // TEST 13: Phase 2 first-session activation — first actionable lesson is always Lesson 1
  it('13. Phase 2: brand-new user first actionable lesson is always the global Lesson 1', () => {
    const idx = getFirstActionableLessonIndex(new Set(), curriculumIds)
    expect(idx).toBe(0)
    // Lesson at index 0 is always the first canonical lesson
    expect(curriculumIds[0]).toBe('les_test_001')
  })

  // TEST 14: Phase 3 path resolver still works
  it('14. Phase 3 path resolver: resolvePersonalizedPath still produces correct output for all standard goals', () => {
    const goals = ['become_pm', 'grow_career', 'build_skills', 'switch_career']
    for (const goal of goals) {
      const path = resolvePersonalizedPath({ goal, career_role: 'working' })
      expect(path.isPersonalized).toBe(true)
      expect(path.goalId).toBe(goal)
      expect(path.recommendedModuleSlug).toBeTruthy()
      expect(path.contextMessage).toBeTruthy()
    }
  })

  // TEST 15: Phase 4 capstone — full completion before capstone
  it('15. Phase 4: Lesson 90 (capstone) requires all 89 prior lessons to be complete', () => {
    // User completed all 89 — Lesson 90 accessible
    const completed = new Set(lessonIdsFor(1, 89))
    const result = getCanonicalPrerequisiteRange(completed, curriculumIds, 89)
    expect(result.firstIncompleteIndex).toBeNull()

    // User only completed 88 — Lesson 90 still blocked
    const partial = new Set(lessonIdsFor(1, 88))
    const partialResult = getCanonicalPrerequisiteRange(partial, curriculumIds, 89)
    expect(partialResult.firstIncompleteIndex).toBe(88)
  })

  // TEST 16: Phase 5 portfolio — completion tracking not affected
  it('16. Phase 5: getFirstActionableLessonIndex is non-destructive to completed set', () => {
    const completed = new Set(lessonIdsFor(1, 50))
    const originalSize = completed.size
    getFirstActionableLessonIndex(completed, curriculumIds)
    expect(completed.size).toBe(originalSize) // unchanged
  })

  // TEST 17: Phase 6 feedback — lesson access computation not disturbed
  it('17. Phase 6: sequential order preserved; lesson 51 requires lesson 50 complete', () => {
    // User completed 1–49 (Lesson 50 missing)
    const completed = new Set(lessonIdsFor(1, 49))
    const result = getCanonicalPrerequisiteRange(completed, curriculumIds, 50) // Lesson 51 = index 50
    expect(result.firstIncompleteIndex).toBe(49) // Lesson 50 (index 49) is the missing one
    expect(curriculumIds[result.firstIncompleteIndex!]).toBe('les_test_050')
  })
})

// ─── 5. Data Remediation Confirmation Tests ──────────────────────────────────

describe('5. Data Remediation — Runtime-only (No DB Migration Required)', () => {
  // TEST 18: Existing affected users get corrected behavior at runtime
  it('18. Existing user with incorrect recommendation still gets valid accessible path at runtime', () => {
    // Simulate an existing user who was previously told "Start with Module 2"
    // but has never completed any lesson
    const existingUserCompleted = new Set<string>() // 0 lessons

    // The module CTA now correctly resolves to inaccessible for an inexperienced user
    // whose personalized path recommended Module 2 before they completed any lessons
    const module2Lessons = mock90Lessons.filter((l) => l.module === 'discovery')
    const ctaTarget = resolveModuleCtaTarget(module2Lessons, mock90Lessons, existingUserCompleted)

    expect(ctaTarget.isAccessible).toBe(false)
    // The actionable path points to Lesson 1, not the locked Module 2 lesson
    expect(ctaTarget.firstActionableLesson?.order).toBe(1)
  })

  // TEST 19: Unaffected users (normal sequential progress) remain unchanged
  it('19. Unaffected user with normal progress (1–25 completed): Module 3 target is Lesson 26', () => {
    const completed = new Set(lessonIdsFor(1, 25))
    const module3Lessons = mock90Lessons.filter((l) => l.module === 'design') // Lessons 21-30
    const ctaTarget = resolveModuleCtaTarget(module3Lessons, mock90Lessons, completed)

    expect(ctaTarget.isAccessible).toBe(true)
    expect(ctaTarget.lesson?.id).toBe('les_test_026')
  })

  // TEST 20: Running the access computation twice produces the same result (idempotent)
  it('20. getCanonicalPrerequisiteRange is idempotent — same result when called multiple times', () => {
    const completed = new Set(lessonIdsFor(1, 5))
    const run1 = getCanonicalPrerequisiteRange(completed, curriculumIds, 10)
    const run2 = getCanonicalPrerequisiteRange(completed, curriculumIds, 10)
    const run3 = getCanonicalPrerequisiteRange(completed, curriculumIds, 10)

    expect(run1.firstIncompleteIndex).toBe(run2.firstIncompleteIndex)
    expect(run2.firstIncompleteIndex).toBe(run3.firstIncompleteIndex)
    expect(run1.lastPrerequisiteIndex).toBe(run2.lastPrerequisiteIndex)
  })

  // TEST 21: Completed lesson records and XP are never modified by access logic
  it('21. Prerequisite range computation never mutates the completedIds set', () => {
    const completed = new Set(lessonIdsFor(1, 10))
    const originalIds = [...completed]

    getCanonicalPrerequisiteRange(completed, curriculumIds, 10)
    getFirstActionableLessonIndex(completed, curriculumIds)

    expect([...completed]).toEqual(originalIds) // Set is not mutated
    expect(completed.size).toBe(10)           // XP/completion records intact
  })
})

// ─── 6. Edge Cases ────────────────────────────────────────────────────────────

describe('6. Edge Cases & Boundary Conditions', () => {
  it('E1. Empty curriculum — resolveModuleCtaTarget returns null lesson gracefully', () => {
    const result = resolveModuleCtaTarget([], mock90Lessons, new Set())
    expect(result.lesson).toBeNull()
    expect(result.isAccessible).toBe(false)
    expect(result.firstActionableLesson).toBeNull()
  })

  it('E2. All 90 lessons completed — getFirstActionableLessonIndex returns -1', () => {
    const completed = new Set(lessonIdsFor(1, 90))
    const idx = getFirstActionableLessonIndex(completed, curriculumIds)
    expect(idx).toBe(-1)
  })

  it('E3. All 90 lessons completed — Module 9 CTA isAccessible=true (review mode)', () => {
    const completed = new Set(lessonIdsFor(1, 90))
    const module9Lessons = mock90Lessons.filter((l) => l.module === 'capstone')
    const result = resolveModuleCtaTarget(module9Lessons, mock90Lessons, completed)
    expect(result.isAccessible).toBe(true)
  })

  it('E4. Single lesson curriculum — Lesson 1 always accessible', () => {
    const singleLesson = [mock90Lessons[0]]
    const result = resolveModuleCtaTarget(singleLesson, singleLesson, new Set())
    expect(result.lesson?.id).toBe('les_test_001')
    expect(result.isAccessible).toBe(true)
  })

  it('E5. getCanonicalPrerequisiteRange with lesson ID not in curriculum — returns null (no crash)', () => {
    const completedWithUnknown = new Set(['unknown_id_xyz'])
    // Should still process based on canonical IDs — unknown IDs are simply not in the list
    const result = getCanonicalPrerequisiteRange(completedWithUnknown, curriculumIds, 5)
    // Lessons 1–5 (index 0–4) are not in the completed set, so first incomplete = 0
    expect(result.firstIncompleteIndex).toBe(0)
  })
})

// ─── 7. Full Curriculum Representative Lesson Targets (Section 2 Audit) ─────

describe('7. Generic Prerequisite Range Across Full 1–90 Curriculum Targets', () => {
  const TARGET_LESSONS = [1, 2, 3, 6, 10, 11, 12, 20, 21, 25, 26, 50, 75, 89, 90]

  // State A: Brand-New User (0 completed)
  describe('State A: Brand-new user (0 completed)', () => {
    for (const targetLesson of TARGET_LESSONS) {
      it(`Target Lesson ${targetLesson}: correctly identifies prerequisite range`, () => {
        const targetIndex = targetLesson - 1
        const result = getCanonicalPrerequisiteRange(new Set(), curriculumIds, targetIndex)

        if (targetLesson === 1) {
          expect(result.firstIncompleteIndex).toBeNull()
          expect(result.lastPrerequisiteIndex).toBe(-1)
        } else {
          expect(result.firstIncompleteIndex).toBe(0) // Lesson 1 (index 0)
          expect(result.lastPrerequisiteIndex).toBe(targetIndex - 1) // Lesson targetLesson-1
          expect(curriculumIds[result.firstIncompleteIndex!]).toBe('les_test_001')
        }
      })
    }
  })

  // State B: User completed first 3 lessons (1, 2, 3)
  describe('State B: User completed first 3 lessons (1, 2, 3)', () => {
    const completed = new Set(lessonIdsFor(1, 3))

    for (const targetLesson of TARGET_LESSONS) {
      it(`Target Lesson ${targetLesson}: correctly evaluates prerequisites with 1–3 completed`, () => {
        const targetIndex = targetLesson - 1
        const result = getCanonicalPrerequisiteRange(completed, curriculumIds, targetIndex)

        if (targetLesson <= 4) {
          // Lessons 1, 2, 3 have all prerequisites met (and Lesson 4 requires 1..3 which are complete)
          expect(result.firstIncompleteIndex).toBeNull()
        } else {
          // Lessons 5 and above need Lesson 4 (index 3) which is missing
          expect(result.firstIncompleteIndex).toBe(3) // Lesson 4
          expect(result.lastPrerequisiteIndex).toBe(targetIndex - 1)
        }
      })
    }
  })

  // State C: User completed everything immediately before target
  describe('State C: User completed everything immediately before target', () => {
    for (const targetLesson of TARGET_LESSONS) {
      it(`Target Lesson ${targetLesson}: accessible when 1..${targetLesson - 1} are complete`, () => {
        const targetIndex = targetLesson - 1
        const completed = targetLesson > 1 ? new Set(lessonIdsFor(1, targetLesson - 1)) : new Set<string>()
        const result = getCanonicalPrerequisiteRange(completed, curriculumIds, targetIndex)

        expect(result.firstIncompleteIndex).toBeNull()
        expect(result.lastPrerequisiteIndex).toBe(targetIndex - 1)
      })
    }
  })

  // State D: Partially completed progress (e.g. 1, 2, 5, 6 completed; 3, 4 missing)
  describe('State D: Partially completed progress (1, 2, 5, 6 completed; 3, 4 missing)', () => {
    const completed = new Set([...lessonIdsFor(1, 2), ...lessonIdsFor(5, 6)])

    for (const targetLesson of TARGET_LESSONS) {
      it(`Target Lesson ${targetLesson}: correctly identifies Lesson 3 as first missing prerequisite`, () => {
        const targetIndex = targetLesson - 1
        const result = getCanonicalPrerequisiteRange(completed, curriculumIds, targetIndex)

        if (targetLesson <= 3) {
          if (targetLesson <= 2) {
            expect(result.firstIncompleteIndex).toBeNull()
          } else {
            // Target Lesson 3 requires 1..2 which are completed
            expect(result.firstIncompleteIndex).toBeNull()
          }
        } else {
          // Target Lesson 4+ requires Lesson 3 (index 2) which is missing
          expect(result.firstIncompleteIndex).toBe(2) // Lesson 3
        }
      })
    }
  })

  // State E: Non-contiguous historical progress (Lesson 7 missing while 1–6 and 8–15 are marked completed)
  describe('State E: Non-contiguous historical progress (Lesson 7 missing, 1..6 and 8..15 completed)', () => {
    const completed = new Set([...lessonIdsFor(1, 6), ...lessonIdsFor(8, 15)])

    for (const targetLesson of TARGET_LESSONS) {
      it(`Target Lesson ${targetLesson}: correctly detects missing Lesson 7 across all targets >= 8`, () => {
        const targetIndex = targetLesson - 1
        const result = getCanonicalPrerequisiteRange(completed, curriculumIds, targetIndex)

        if (targetLesson <= 7) {
          // Lessons 1..7 have 1..6 complete, so for targets <= 7 no missing prereq before them (Lesson 7 has 1..6 complete)
          expect(result.firstIncompleteIndex).toBeNull()
        } else {
          // Lessons 8+ require Lesson 7 (index 6) which is missing
          expect(result.firstIncompleteIndex).toBe(6) // Lesson 7
          expect(curriculumIds[result.firstIncompleteIndex!]).toBe('les_test_007')
        }
      })
    }
  })
})

