/**
 * Phase 6 — pure module-entry access resolver.
 *
 * Covers Steps 3, 4, 9 of the plan:
 *   - every module entry unlocked in treatment; mid-module lessons remain sequential
 *   - control keeps the exact global-sequential behaviour
 *   - grandfathering (opened lessons stay accessible, variant-independent)
 *   - override, completed, and invalid ids
 */

import { describe, it, expect } from 'vitest'
import {
  buildCurriculumModuleIndex,
  resolveLessonAccess,
} from '../curriculum-access'
import type { CurriculumEntry } from '@/types'

const MODULE_SLUGS = [
  'foundations', 'discovery', 'design', 'execution', 'growth',
  'leadership', 'technical', 'strategy', 'capstone',
]

const curriculum: CurriculumEntry[] = Array.from({ length: 90 }, (_, i) => ({
  id: `les_${String(i + 1).padStart(3, '0')}`,
  order: i + 1,
  title: `Lesson ${i + 1}`,
  module: MODULE_SLUGS[Math.floor(i / 10)],
  estimatedReadingTime: 5,
})) as CurriculumEntry[]

const id = (n: number) => `les_${String(n).padStart(3, '0')}`
const completedThrough = (n: number) => new Set(Array.from({ length: n }, (_, i) => id(i + 1)))
const MODULE_ENTRIES = [1, 11, 21, 31, 41, 51, 61, 71, 81]

describe('buildCurriculumModuleIndex', () => {
  it('identifies every module entry lesson', () => {
    const idx = buildCurriculumModuleIndex(curriculum)
    for (const n of MODULE_ENTRIES) expect(idx.entryIds.has(id(n))).toBe(true)
    // non-entry lessons are not entries
    expect(idx.entryIds.has(id(2))).toBe(false)
    expect(idx.entryIds.has(id(12))).toBe(false)
  })

  it('maps module-scoped previous lessons (null for entries)', () => {
    const idx = buildCurriculumModuleIndex(curriculum)
    expect(idx.prevInModule.get(id(11))).toBeNull() // module 2 entry
    expect(idx.prevInModule.get(id(12))).toBe(id(11)) // within module 2
    expect(idx.prevInModule.get(id(20))).toBe(id(19))
  })
})

describe('resolveLessonAccess — treatment (module-entry unlock)', () => {
  const base = { curriculum, completedIds: new Set<string>(), treatment: true }

  it('unlocks every module entry lesson for a brand-new learner', () => {
    for (const n of MODULE_ENTRIES) {
      const info = resolveLessonAccess(id(n), base)
      expect(info.isAccessible).toBe(true)
      expect(info.state).toBe('unlocked')
      expect(info.reason).toBe('module_entry')
    }
  })

  it('locks the second lesson of a module until the first is complete', () => {
    const locked = resolveLessonAccess(id(12), base)
    expect(locked.isAccessible).toBe(false)
    expect(locked.state).toBe('locked')
    expect(locked.prerequisiteLessonId).toBe(id(11)) // module-scoped previous

    const unlocked = resolveLessonAccess(id(12), { ...base, completedIds: new Set([id(11)]) })
    expect(unlocked.isAccessible).toBe(true)
    expect(unlocked.reason).toBe('prev_in_module_completed')
  })

  it('keeps intra-module sequencing: L3 locked until L2 done even if L1 done', () => {
    const info = resolveLessonAccess(id(13), { ...base, completedIds: new Set([id(11)]) })
    expect(info.isAccessible).toBe(false)
    expect(info.prerequisiteLessonId).toBe(id(12))
  })

  it('does NOT require earlier modules for a later module entry', () => {
    // Module 3 entry (lesson 21) accessible with zero completions
    expect(resolveLessonAccess(id(21), base).isAccessible).toBe(true)
  })
})

describe('resolveLessonAccess — control (global sequential, unchanged)', () => {
  const base = { curriculum, completedIds: new Set<string>(), treatment: false }

  it('unlocks only Lesson 1 for a brand-new learner', () => {
    expect(resolveLessonAccess(id(1), base).isAccessible).toBe(true)
    expect(resolveLessonAccess(id(2), base).isAccessible).toBe(false)
    expect(resolveLessonAccess(id(11), base).isAccessible).toBe(false) // module 2 entry LOCKED under control
  })

  it('module 2 entry unlocks only after all of module 1 is complete', () => {
    expect(resolveLessonAccess(id(11), { ...base, completedIds: completedThrough(10) }).isAccessible).toBe(true)
    expect(resolveLessonAccess(id(11), { ...base, completedIds: completedThrough(9) }).isAccessible).toBe(false)
  })

  it('reports the first incomplete GLOBAL lesson as the prerequisite', () => {
    const info = resolveLessonAccess(id(11), { ...base, completedIds: completedThrough(5) })
    expect(info.prerequisiteLessonId).toBe(id(6))
  })
})

describe('resolveLessonAccess — grandfathering (rollback safety)', () => {
  it('keeps an opened lesson accessible under control after a flag flip', () => {
    // Treatment learner opened module 2 lesson 1 (les_011) → in_progress row exists.
    const openedIds = new Set([id(11)])
    // Flag flips to control. Under pure control, les_011 would be locked (needs 1..10).
    const info = resolveLessonAccess(id(11), {
      curriculum,
      completedIds: new Set<string>(),
      openedIds,
      treatment: false,
    })
    expect(info.isAccessible).toBe(true)
    expect(info.state).toBe('in_progress')
    expect(info.reason).toBe('grandfathered')
  })

  it('does NOT grandfather the NEXT lesson in the module (still locked)', () => {
    // Opened les_011 but not completed → les_012 stays locked in treatment.
    const info = resolveLessonAccess(id(12), {
      curriculum,
      completedIds: new Set<string>(),
      openedIds: new Set([id(11)]),
      treatment: true,
    })
    expect(info.isAccessible).toBe(false)
    expect(info.prerequisiteLessonId).toBe(id(11))
  })
})

describe('resolveLessonAccess — override, completed, edge cases', () => {
  it('override unlocks everything', () => {
    const info = resolveLessonAccess(id(90), { curriculum, completedIds: new Set(), treatment: false, override: true })
    expect(info.isAccessible).toBe(true)
    expect(info.reason).toBe('override')
  })

  it('completed lessons are always accessible and reported completed', () => {
    const info = resolveLessonAccess(id(5), { curriculum, completedIds: new Set([id(5)]), treatment: true })
    expect(info.state).toBe('completed')
    expect(info.isAccessible).toBe(true)
  })

  it('never mutates the input sets', () => {
    const completedIds = completedThrough(10)
    const openedIds = new Set([id(11)])
    const size = completedIds.size
    resolveLessonAccess(id(11), { curriculum, completedIds, openedIds, treatment: true })
    expect(completedIds.size).toBe(size)
    expect(openedIds.size).toBe(1)
  })

  it('access is a strict superset of control (no lesson accessible in control is locked in treatment)', () => {
    // For a range of completion states, anything control unlocks, treatment also unlocks.
    for (const done of [0, 5, 10, 15, 35, 89]) {
      const completedIds = completedThrough(done)
      for (const n of [1, 2, 11, 12, 21, 36, 90]) {
        const ctrl = resolveLessonAccess(id(n), { curriculum, completedIds, treatment: false })
        const treat = resolveLessonAccess(id(n), { curriculum, completedIds, treatment: true })
        if (ctrl.isAccessible) expect(treat.isAccessible).toBe(true)
      }
    }
  })
})
