import { describe, it, expect } from 'vitest'
import { MODULE_LESSON_MAP, getLessonIdsForModule, getModuleSlugForLessonId } from '../curriculum-registry'
import { getAllCapstoneDefinitions } from '../../config/capstones'

describe('Curriculum Registry & Capstone Integrity Suite', () => {
  const canonicalModules = [
    'foundations',
    'discovery',
    'design',
    'execution',
    'growth',
    'leadership',
    'technical',
    'strategy',
    'capstone',
  ]

  it('contains all 9 canonical curriculum modules with 10 lessons each', () => {
    for (const mod of canonicalModules) {
      const lessonIds = getLessonIdsForModule(mod)
      expect(lessonIds.length).toBe(10)
      for (const id of lessonIds) {
        expect(id).toMatch(/^les_[a-z0-9]{6}$/)
      }
    }
  })

  it('has zero duplicate lesson IDs across modules (90 unique lessons)', () => {
    const allIds: string[] = []
    for (const mod of canonicalModules) {
      allIds.push(...getLessonIdsForModule(mod))
    }
    expect(allIds.length).toBe(90)
    const uniqueIds = new Set(allIds)
    expect(uniqueIds.size).toBe(90)
  })

  it('supports slug aliases safely (e.g. tech_ai -> technical, platform -> strategy, advanced_strategy -> capstone)', () => {
    expect(getLessonIdsForModule('tech_ai')).toEqual(getLessonIdsForModule('technical'))
    expect(getLessonIdsForModule('platform')).toEqual(getLessonIdsForModule('strategy'))
    expect(getLessonIdsForModule('advanced_strategy')).toEqual(getLessonIdsForModule('capstone'))
  })

  it('correctly maps stable lesson ID back to module slug', () => {
    expect(getModuleSlugForLessonId('les_zoyq8a')).toBe('foundations')
    expect(getModuleSlugForLessonId('les_4kpbq6')).toBe('discovery')
    expect(getModuleSlugForLessonId('les_bhb1lc')).toBe('design')
    expect(getModuleSlugForLessonId('les_091713')).toBe('execution')
    expect(getModuleSlugForLessonId('les_0iss34')).toBe('growth')
    expect(getModuleSlugForLessonId('les_vs8e8k')).toBe('leadership')
    expect(getModuleSlugForLessonId('les_nyhd19')).toBe('technical')
    expect(getModuleSlugForLessonId('les_e18dsm')).toBe('strategy')
    expect(getModuleSlugForLessonId('les_cc0i59')).toBe('capstone')
    expect(getModuleSlugForLessonId('unknown_id')).toBeNull()
  })

  it('validates all 9 capstone definitions align with module numbers', () => {
    const capstones = getAllCapstoneDefinitions()
    expect(capstones.length).toBe(9)
    for (let i = 0; i < capstones.length; i++) {
      expect(capstones[i].moduleNumber).toBe(i + 1)
      expect(capstones[i].requirements.length).toBeGreaterThan(0)
    }
  })
})
