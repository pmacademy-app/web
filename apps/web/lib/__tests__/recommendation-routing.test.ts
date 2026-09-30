/**
 * Phase 6 — recommendation routing (Step 2).
 *
 * The onboarding recommendation must determine where "Start Learning" goes:
 *   - treatment: land on the recommended module's (unlocked) entry lesson
 *   - control / not-yet-reachable: fall back to the first actionable lesson (never a lock wall)
 *   - always resolve to a real existing lesson (valid, missing, or unknown recommendation)
 */

import { describe, it, expect } from 'vitest'
import {
  resolvePersonalizedPath,
  resolveRecommendedEntryLesson,
  resolveStartLearningTarget,
  academyLessonPath,
} from '../personalization/path-resolver'
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

describe('resolveRecommendedEntryLesson', () => {
  it('returns the entry lesson of the recommended module', () => {
    expect(resolveRecommendedEntryLesson({ recommendedModuleSlug: 'strategy' }, curriculum)?.id).toBe(id(71))
    expect(resolveRecommendedEntryLesson({ recommendedModuleSlug: 'discovery' }, curriculum)?.id).toBe(id(11))
    expect(resolveRecommendedEntryLesson({ recommendedModuleSlug: 'foundations' }, curriculum)?.id).toBe(id(1))
  })

  it('falls back to foundations entry for an unknown module', () => {
    expect(resolveRecommendedEntryLesson({ recommendedModuleSlug: 'does_not_exist' }, curriculum)?.id).toBe(id(1))
  })

  it('returns null for an empty curriculum', () => {
    expect(resolveRecommendedEntryLesson({ recommendedModuleSlug: 'strategy' }, [])).toBeNull()
  })
})

describe('resolveStartLearningTarget — treatment', () => {
  it('routes a new experienced learner to their recommended module entry', () => {
    const path = resolvePersonalizedPath({ goal: 'grow_career', career_role: 'experienced' })
    expect(path.recommendedModuleSlug).toBe('strategy')
    const target = resolveStartLearningTarget(path, curriculum, {
      completedIds: new Set(),
      treatment: true,
    })
    expect(target?.isRecommended).toBe(true)
    expect(target?.lesson.id).toBe(id(71)) // strategy entry, unlocked under treatment
    expect(academyLessonPath(target!.lesson)).toBe('/academy/strategy/les_071')
  })

  it('routes a beginner to foundations entry (Lesson 1)', () => {
    const path = resolvePersonalizedPath({ goal: 'become_pm', career_role: 'beginner' })
    expect(path.recommendedModuleSlug).toBe('foundations')
    const target = resolveStartLearningTarget(path, curriculum, { completedIds: new Set(), treatment: true })
    expect(target?.lesson.id).toBe(id(1))
    expect(target?.isRecommended).toBe(true)
  })
})

describe('resolveStartLearningTarget — control fallback (no lock wall)', () => {
  it('falls back to Lesson 1 when the recommended entry is locked under control', () => {
    const path = resolvePersonalizedPath({ goal: 'grow_career', career_role: 'experienced' })
    const target = resolveStartLearningTarget(path, curriculum, {
      completedIds: new Set(),
      treatment: false,
    })
    expect(target?.isRecommended).toBe(false)
    expect(target?.lesson.id).toBe(id(1)) // safe fallback, never the locked strategy entry
  })

  it('routes to the first actionable lesson for a partially-progressed control learner', () => {
    const path = resolvePersonalizedPath({ goal: 'grow_career', career_role: 'experienced' })
    const completedIds = new Set(Array.from({ length: 25 }, (_, i) => id(i + 1)))
    const target = resolveStartLearningTarget(path, curriculum, { completedIds, treatment: false })
    expect(target?.lesson.id).toBe(id(26))
  })
})

describe('resolveStartLearningTarget — grandfathering & edge cases', () => {
  it('honours a recommended entry the learner already opened, even under control', () => {
    const path = resolvePersonalizedPath({ goal: 'grow_career', career_role: 'experienced' })
    const target = resolveStartLearningTarget(path, curriculum, {
      completedIds: new Set(),
      openedIds: new Set([id(71)]),
      treatment: false,
    })
    expect(target?.isRecommended).toBe(true)
    expect(target?.lesson.id).toBe(id(71))
  })

  it('handles a missing/legacy recommendation deterministically', () => {
    const path = resolvePersonalizedPath(null)
    const target = resolveStartLearningTarget(path, curriculum, { completedIds: new Set(), treatment: true })
    // foundations is the default recommendation → entry is Lesson 1
    expect(target?.lesson.id).toBe(id(1))
  })

  it('returns null for an empty curriculum (caller uses a static fallback)', () => {
    const path = resolvePersonalizedPath({ goal: 'become_pm', career_role: 'beginner' })
    expect(resolveStartLearningTarget(path, [], { completedIds: new Set(), treatment: true })).toBeNull()
  })
})
