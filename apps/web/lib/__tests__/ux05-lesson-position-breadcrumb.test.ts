/**
 * UX-05 / SEO-03 / D3: one lesson-number scheme and one module title source.
 *
 * Every learner-facing lesson position reads "Module N · Lesson M" (module-local), breadcrumbs
 * take the module title from MODULE_META, and the global 1..90 index is kept for URLs only.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { MODULE_META, isModuleSlug } from '@/lib/curriculum/module-meta'
import {
  formatLessonPosition,
  formatPositionLabel,
  getLessonBreadcrumbLabels,
  getLessonPosition,
  lessonBreadcrumbLabels,
} from '@/lib/curriculum/lesson-position'
import { CURRICULUM_MODULE_META } from '@/lib/admin/curriculum-meta'

interface Entry {
  id: string
  title: string
  module: string
  order: number
}

const curriculum = JSON.parse(
  readFileSync(path.join(process.cwd(), '..', '..', 'content', 'dist', 'curriculum.json'), 'utf8'),
) as { lessons: Entry[] }

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf8')

describe('lesson breadcrumbs use MODULE_META titles', () => {
  it('has lessons to check', () => {
    expect(curriculum.lessons.length).toBeGreaterThan(0)
  })

  it.each(curriculum.lessons.map((l) => [l.id, l] as const))(
    '%s breadcrumb module title equals MODULE_META title',
    (_id, lesson) => {
      expect(isModuleSlug(lesson.module)).toBe(true)
      if (!isModuleSlug(lesson.module)) return
      const meta = MODULE_META[lesson.module]
      const position = getLessonPosition(lesson, curriculum)
      const crumbs = getLessonBreadcrumbLabels(lesson, curriculum)

      expect(position.moduleTitle).toBe(meta.title)
      expect(position.moduleNumber).toBe(meta.number)
      expect(crumbs.module).toBe(`Module ${meta.number}: ${meta.title}`)
      expect(crumbs.lesson).toBe(`Lesson ${position.lessonNumber}: ${lesson.title}`)
    },
  )
})

describe('formatLessonPosition', () => {
  it('numbers lessons inside their module, 1..lessonCount', () => {
    const seen = new Map<string, number>()
    for (const lesson of curriculum.lessons) {
      const expected = (seen.get(lesson.module) ?? 0) + 1
      seen.set(lesson.module, expected)
      const position = getLessonPosition(lesson, curriculum)
      expect(position.lessonNumber).toBe(expected)
      expect(formatLessonPosition(lesson, curriculum)).toBe(
        `Module ${position.moduleNumber} · Lesson ${expected}`,
      )
    }
  })

  it('keeps the global index separately for URLs and metadata', () => {
    curriculum.lessons.forEach((lesson, idx) => {
      expect(getLessonPosition(lesson, curriculum).globalNumber).toBe(idx + 1)
    })
  })

  it('formats the third module, second lesson as "Module 3 · Lesson 2"', () => {
    expect(formatPositionLabel(3, 2)).toBe('Module 3 · Lesson 2')
    const design = curriculum.lessons.filter((l) => l.module === 'design')
    expect(formatLessonPosition(design[1], curriculum)).toBe('Module 3 · Lesson 2')
  })

  it('falls back to MODULE_META number and authored order without a curriculum', () => {
    expect(formatLessonPosition({ id: 'les_unknown', module: 'growth', order: 4 }, null)).toBe(
      'Module 5 · Lesson 4',
    )
  })

  it('builds breadcrumbs without zero padding', () => {
    expect(
      lessonBreadcrumbLabels({ moduleNumber: 1, moduleTitle: 'X', lessonNumber: 7 }, 'T'),
    ).toEqual({ module: 'Module 1: X', lesson: 'Lesson 7: T' })
  })
})

describe('CURRICULUM_MODULE_META derives from MODULE_META', () => {
  it('names and describes every module from MODULE_META, in curriculum order', () => {
    const slugs = Object.keys(CURRICULUM_MODULE_META)
    expect(slugs).toEqual(Object.keys(MODULE_META))
    for (const slug of slugs) {
      if (!isModuleSlug(slug)) throw new Error(`unexpected slug ${slug}`)
      expect(CURRICULUM_MODULE_META[slug].name).toBe(MODULE_META[slug].title)
      expect(CURRICULUM_MODULE_META[slug].description).toBe(MODULE_META[slug].description)
    }
  })
})

describe('no local module-name maps or global numbers in lesson UI', () => {
  const lessonPage = read('app/(app)/academy/[moduleSlug]/[lessonId]/page.tsx')
  const lessonContent = read('app/(app)/academy/[moduleSlug]/[lessonId]/lesson-content.tsx')
  const academy = read('app/(app)/academy/page.tsx')
  const search = read('components/search/SearchOverlay.tsx')

  it('has no MODULE_NAMES or MODULE_LABEL copies', () => {
    for (const src of [lessonPage, lessonContent, academy, search]) {
      expect(src).not.toMatch(/MODULE_(NAMES|LABEL)\b/)
    }
  })

  it('does not zero-pad module numbers or show the global lesson number in the header', () => {
    expect(lessonContent).not.toContain("padStart(2, '0')")
    expect(lessonContent).not.toContain('Lesson {globalOrder}')
    expect(academy).not.toContain("padStart(2, '0')")
  })

  it('sends signed-out visitors to login with a next path back to the lesson', () => {
    expect(lessonPage).toContain('/login?next=${encodeURIComponent(')
    expect(lessonPage).not.toMatch(/redirect\('\/login'\)/)
  })

  it('drops the hard-coded XP figure and "mastered" copy (UX-10)', () => {
    expect(lessonContent).not.toContain('+100 XP')
    expect(lessonContent).not.toContain('You have mastered')
    expect(lessonContent).toContain('You completed')
  })
})
