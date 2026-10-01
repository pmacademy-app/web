/**
 * Phase 6 — capstone integrity under the module-entry unlock model (Step 10).
 *
 * The unlock model changes only which lessons a learner may OPEN; it never changes lesson
 * completion, XP, or quiz semantics. Capstone eligibility is derived purely from the count of
 * COMPLETED lessons in a module (the "8 of 10" gate), so being able to open a module's lessons
 * early must not unlock its capstone. These tests pin that invariant.
 */

import { describe, it, expect } from 'vitest'
import { deriveCapstoneStatus } from '@/lib/capstones'
import { buildCurriculumModuleIndex, resolveLessonAccess } from '@/lib/curriculum-access'
import type { CurriculumEntry } from '@/types'

describe('capstone 8-of-10 gate is unchanged by Phase 6', () => {
  it('stays locked below 8 completed and unlocks at 8', () => {
    expect(deriveCapstoneStatus(null, 0)).toBe('locked')
    expect(deriveCapstoneStatus(null, 7)).toBe('locked')
    expect(deriveCapstoneStatus(null, 8)).toBe('unlocked')
    expect(deriveCapstoneStatus(null, 10)).toBe('unlocked')
  })

  it('a submitted/draft status is authoritative regardless of lesson count', () => {
    expect(deriveCapstoneStatus('submitted', 0)).toBe('submitted')
    expect(deriveCapstoneStatus('draft', 0)).toBe('draft')
  })
})

describe('module-entry access never counts as completion', () => {
  const MODULE_SLUGS = ['foundations', 'discovery', 'design', 'execution', 'growth', 'leadership', 'technical', 'strategy', 'capstone']
  const curriculum: CurriculumEntry[] = Array.from({ length: 90 }, (_, i) => ({
    id: `les_${String(i + 1).padStart(3, '0')}`,
    order: i + 1,
    title: `Lesson ${i + 1}`,
    module: MODULE_SLUGS[Math.floor(i / 10)],
    estimatedReadingTime: 5,
  })) as CurriculumEntry[]
  const id = (n: number) => `les_${String(n).padStart(3, '0')}`

  it('opening a module entry (grandfathered/unlocked) does not add to the completed set', () => {
    const index = buildCurriculumModuleIndex(curriculum)
    const completedIds = new Set<string>() // nothing completed
    const openedIds = new Set([id(11)]) // opened the discovery entry lesson

    const info = resolveLessonAccess(id(11), { index, completedIds, openedIds, treatment: true })
    expect(info.isAccessible).toBe(true)

    // The completed-lesson count that the capstone gate reads is derived from completedIds,
    // which the access resolver never mutates — so the discovery capstone stays locked.
    const discoveryCompleted = [...completedIds].filter((l) => curriculum.find((c) => c.id === l)?.module === 'discovery').length
    expect(discoveryCompleted).toBe(0)
    expect(deriveCapstoneStatus(null, discoveryCompleted)).toBe('locked')
  })

  it('a learner who can OPEN all 10 module lessons but completed only 7 still cannot submit', () => {
    const index = buildCurriculumModuleIndex(curriculum)
    // Completed 7 of module 2 (lessons 11-17); lessons 18-20 opened but not completed.
    const completedIds = new Set([11, 12, 13, 14, 15, 16, 17].map(id))
    const openedIds = new Set([11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map(id))

    // All are accessible (sequential within module satisfied / opened)...
    expect(resolveLessonAccess(id(20), { index, completedIds, openedIds, treatment: true }).isAccessible).toBe(true)

    // ...but capstone eligibility counts only the 7 completed → locked.
    const module2Completed = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20].filter((n) => completedIds.has(id(n))).length
    expect(module2Completed).toBe(7)
    expect(deriveCapstoneStatus(null, module2Completed)).toBe('locked')
  })
})
