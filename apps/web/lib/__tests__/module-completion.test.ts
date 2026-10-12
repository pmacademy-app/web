import { describe, it, expect } from 'vitest'
import { findNewlyCompletedModule, moduleCompletedEventId } from '@/lib/academy/module-completion'
import { MODULE_LESSON_MAP, getLessonIdsForModule } from '@/lib/curriculum-registry'
import { CURRICULUM_MODULE_META } from '@/lib/admin/curriculum-meta'

// Growth R4 / A1: `module.completed` fires when a real module's last lesson is completed, not on
// every 10th lesson. The registry is the source of truth for which lessons make up a module.

const foundations = getLessonIdsForModule('foundations')
const discovery = getLessonIdsForModule('discovery')

describe('findNewlyCompletedModule', () => {
  it('returns the module when the given lesson closes it', () => {
    const done = new Set(foundations)
    expect(findNewlyCompletedModule(foundations[9], done)).toEqual({
      slug: 'foundations',
      name: CURRICULUM_MODULE_META.foundations.name,
    })
  })

  it('works when lessons were completed out of order', () => {
    const done = new Set([...foundations].reverse())
    expect(findNewlyCompletedModule(foundations[3], done)?.slug).toBe('foundations')
  })

  it('returns null while any lesson in the module is still open', () => {
    const done = new Set(foundations.slice(0, 9))
    expect(findNewlyCompletedModule(foundations[8], done)).toBeNull()
  })

  it('ignores lessons from other modules, even ten of them', () => {
    // The old rule fired on the 10th completed lesson regardless of module.
    const done = new Set([...foundations.slice(0, 5), ...discovery.slice(0, 5)])
    expect(done.size).toBe(10)
    expect(findNewlyCompletedModule(discovery[4], done)).toBeNull()
  })

  it('returns null for a lesson outside the registry', () => {
    expect(findNewlyCompletedModule('les_unknown', new Set(foundations))).toBeNull()
  })

  it('resolves registry aliases to the canonical module', () => {
    const technical = getLessonIdsForModule('technical')
    expect(getLessonIdsForModule('tech_ai')).toEqual(technical)
    expect(findNewlyCompletedModule(technical[0], new Set(technical))?.slug).toBe('technical')
  })

  it('names every canonical module from the curriculum metadata', () => {
    const seen = new Set<string>()
    for (const ids of Object.values(MODULE_LESSON_MAP)) {
      const found = findNewlyCompletedModule(ids[0], new Set(ids))
      expect(found).not.toBeNull()
      seen.add(found!.slug)
      expect(found!.name).toBe(CURRICULUM_MODULE_META[found!.slug].name)
    }
    expect(seen.size).toBe(9)
  })
})

describe('moduleCompletedEventId', () => {
  it('is stable per learner and module, under a prefix distinct from the old counter', () => {
    expect(moduleCompletedEventId('user-1', 'discovery')).toBe('module-completed-user-1-discovery')
    expect(moduleCompletedEventId('user-1', 'discovery')).not.toMatch(/^module-complete-user/)
  })
})

// Growth R5 / F1, F5: lesson and module counts come from the registry, not "90" or lessons / 10.
describe('curriculum registry counts', () => {
  it('counts 90 unique lessons across 9 canonical modules (aliases excluded)', async () => {
    const { CURRICULUM_LESSON_COUNT, CANONICAL_MODULE_SLUGS } = await import('@/lib/curriculum-registry')
    expect(CURRICULUM_LESSON_COUNT).toBe(90)
    expect(CANONICAL_MODULE_SLUGS).toHaveLength(9)
    expect(CANONICAL_MODULE_SLUGS).not.toContain('tech_ai')
    expect(CANONICAL_MODULE_SLUGS).not.toContain('platform')
    expect(CANONICAL_MODULE_SLUGS).not.toContain('advanced_strategy')
  })

  it('counts a module only when every one of its lessons is complete', async () => {
    const { countCompletedModules } = await import('@/lib/curriculum-registry')
    expect(countCompletedModules(foundations)).toBe(1)
    expect(countCompletedModules([...foundations, ...discovery.slice(0, 9)])).toBe(1)
    // Ten lessons spread over two modules is not a module (the old lessons / 10 rule said 1).
    expect(countCompletedModules([...foundations.slice(0, 5), ...discovery.slice(0, 5)])).toBe(0)
  })
})
