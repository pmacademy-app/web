/**
 * SEO-03 / AEO-05 / PROD-11: one module taxonomy.
 *
 * MODULE_META must match content/dist/curriculum.json (order, numbers, compiled titles,
 * lesson counts and minutes), and every public surface that names a module must agree
 * with it: the Course JSON-LD, the /curriculum sections, lesson breadcrumbs and the
 * capstone config.
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToString } from 'react-dom/server'

// The global setup renders Link as bare children; render a real anchor so hrefs show up.
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href }, children),
}))

import {
  COURSE_TOTALS,
  COURSE_WORKLOAD_HOURS,
  MODULE_META,
  MODULE_META_LIST,
  MODULE_SLUGS,
  formatModuleHours,
  getModuleMeta,
  getModuleTitle,
} from '@/lib/curriculum/module-meta'
import { getCourseSchema, getLessonSchema } from '@/lib/schema'
import { getAllCapstoneDefinitions, getCurriculumModuleForCapstone } from '@/config/capstones'
import { HOME_CAPSTONES } from '@/config/marketing'
import { FAQ_ITEMS } from '@/config/content'
import CurriculumPage from '@/app/(marketing)/curriculum/page'
import type { CompiledLesson } from '@/types'

interface CompiledCurriculum {
  lessons: Array<{
    id: string
    slug: string
    title: string
    module: string
    estimatedReadingTime: number
    estimatedCompletionTime: number
  }>
  modules: Array<{ id: string; title: string; lessons: string[] }>
}

const curriculum = JSON.parse(
  readFileSync(path.join(process.cwd(), '..', '..', 'content', 'dist', 'curriculum.json'), 'utf8'),
) as CompiledCurriculum

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf8')

/** Module ids in the order their lessons first appear in curriculum.json. */
function lessonModuleOrder(): string[] {
  const seen: string[] = []
  for (const lesson of curriculum.lessons) {
    if (!seen.includes(lesson.module)) seen.push(lesson.module)
  }
  return seen
}

describe('MODULE_META matches curriculum.json', () => {
  it('keys and numbers follow curriculum.json module order', () => {
    expect([...MODULE_SLUGS]).toEqual(curriculum.modules.map((m) => m.id))
    expect([...MODULE_SLUGS]).toEqual(lessonModuleOrder())
    expect(Object.keys(MODULE_META)).toEqual([...MODULE_SLUGS])
    MODULE_SLUGS.forEach((slug, idx) => {
      expect(MODULE_META[slug].slug).toBe(slug)
      expect(MODULE_META[slug].number).toBe(idx + 1)
      expect(MODULE_META_LIST[idx]).toBe(MODULE_META[slug])
    })
  })

  it('shortTitle is the compiled module title', () => {
    for (const compiled of curriculum.modules) {
      expect(getModuleMeta(compiled.id)?.shortTitle).toBe(compiled.title)
    }
  })

  it('lesson counts and minutes are the sums of the compiled lessons', () => {
    for (const meta of MODULE_META_LIST) {
      const lessons = curriculum.lessons.filter((l) => l.module === meta.slug)
      expect(lessons.length, meta.slug).toBe(meta.lessonCount)
      expect(lessons.reduce((s, l) => s + l.estimatedReadingTime, 0), meta.slug).toBe(meta.readingMinutes)
      expect(lessons.reduce((s, l) => s + l.estimatedCompletionTime, 0), meta.slug).toBe(meta.estimatedMinutes)
    }
    expect(COURSE_TOTALS.lessons).toBe(curriculum.lessons.length)
    expect(COURSE_TOTALS.modules).toBe(curriculum.modules.length)
  })

  it('every compiled lesson belongs to a known module', () => {
    for (const lesson of curriculum.lessons) {
      expect(getModuleMeta(lesson.module), lesson.slug).toBeDefined()
    }
  })

  it('titles are unique and free of em-dashes', () => {
    const titles = MODULE_META_LIST.map((m) => m.title)
    expect(new Set(titles).size).toBe(titles.length)
    for (const meta of MODULE_META_LIST) {
      for (const text of [meta.title, meta.shortTitle, meta.description, meta.outcome]) {
        expect(text).not.toContain('—')
      }
    }
  })

  it('resolves capstone and registry aliases', () => {
    expect(getModuleMeta('metrics')?.slug).toBe('growth')
    expect(getModuleMeta('tech_ai')?.slug).toBe('technical')
    expect(getModuleMeta('platform')?.slug).toBe('strategy')
    expect(getModuleMeta('advanced_strategy')?.slug).toBe('capstone')
    expect(getModuleMeta('nope')).toBeUndefined()
    expect(getModuleTitle('some-new_module')).toBe('Some New Module')
  })

  it('formats hours as whole numbers', () => {
    expect(formatModuleHours(375)).toBe('6 hrs')
    expect(formatModuleHours(585)).toBe('10 hrs')
    expect(formatModuleHours(20)).toBe('1 hr')
  })
})

describe('Course JSON-LD follows MODULE_META', () => {
  const course = getCourseSchema()

  it('hasPart order, positions and names match curriculum.json order', () => {
    expect(course.hasPart.map((p) => p.position)).toEqual(curriculum.modules.map((_, i) => i + 1))
    expect(course.hasPart.map((p) => p.name)).toEqual(
      curriculum.modules.map((m, i) => `Module ${i + 1}: ${MODULE_META[m.id as keyof typeof MODULE_META].title}`),
    )
  })

  it('courseWorkload is the summed completion time, not a hand-typed figure', () => {
    const totalMinutes = curriculum.lessons.reduce((s, l) => s + l.estimatedCompletionTime, 0)
    expect(course.hasCourseInstance.courseWorkload).toBe(`PT${Math.round(totalMinutes / 60)}H`)
    expect(COURSE_WORKLOAD_HOURS).toBe(Math.round(totalMinutes / 60))
  })

  it('the FAQ "How long" answer carries the same hours', () => {
    const faq = FAQ_ITEMS.find((f) => f.question === 'How long does it take?')
    expect(faq?.answer).toContain(`about ${COURSE_WORKLOAD_HOURS} hours`)
  })

  it('lesson LearningResource names the lesson\'s own module', () => {
    for (const entry of curriculum.lessons) {
      const schema = getLessonSchema(
        { ...entry, difficulty: 1, estimatedReadingTime: entry.estimatedReadingTime } as unknown as CompiledLesson,
        1,
        entry.slug,
      )
      expect(schema.description).toContain(`(Module: ${getModuleTitle(entry.module)})`)
    }
  })
})

describe('/curriculum groups lessons by lesson.module', () => {
  it('every lesson is listed under the section its breadcrumb links to', async () => {
    const html = renderToString(await CurriculumPage())

    // Split the page into module sections by their anchor ids.
    const sections = new Map<string, string>()
    const parts = html.split(/<section[^>]*id="module-/)
    for (const part of parts.slice(1)) {
      const slug = part.slice(0, part.indexOf('"'))
      sections.set(slug, part)
    }
    expect([...sections.keys()]).toEqual([...MODULE_SLUGS])

    for (const lesson of curriculum.lessons) {
      // Lesson pages link their module crumb to /curriculum#module-<lesson.module>
      // with getModuleTitle(lesson.module) as its label.
      const section = sections.get(lesson.module)
      expect(section, lesson.slug).toBeDefined()
      expect(section).toContain(`href="/lessons/${lesson.slug}"`)
      expect(section).toContain(`>${getModuleTitle(lesson.module).replace(/&/g, '&amp;')}</h2>`)
      for (const [otherSlug, otherSection] of sections) {
        if (otherSlug !== lesson.module) {
          expect(otherSection, `${lesson.slug} in ${otherSlug}`).not.toContain(`href="/lessons/${lesson.slug}"`)
        }
      }
    }
  })

  it('the page and the lesson breadcrumb read from MODULE_META, not local maps', () => {
    const page = read('app/(marketing)/curriculum/page.tsx')
    expect(page).not.toMatch(/getModuleSlugByNumber|\.slice\(startIdx/)
    const lessonPage = read('app/(marketing)/lessons/[slug]/page.tsx')
    expect(lessonPage).not.toContain('formatModuleName')
    expect(lessonPage).toContain('getModuleTitle(lesson.module)')
    expect(lessonPage).toContain('/curriculum#module-${lesson.module}')
  })
})

describe('capstones carry their gating module\'s number and title', () => {
  it('capstone moduleNumber/moduleTitle equal MODULE_META of the module that gates it', () => {
    for (const def of getAllCapstoneDefinitions()) {
      const meta = getModuleMeta(getCurriculumModuleForCapstone(def.moduleSlug))
      expect(meta, def.moduleSlug).toBeDefined()
      expect(def.moduleNumber, def.moduleSlug).toBe(meta!.number)
      expect(def.moduleTitle, def.moduleSlug).toBe(meta!.title)
    }
  })

  it('homepage capstones use the same numbers and titles, in curriculum order', () => {
    expect(HOME_CAPSTONES.map((c) => c.number)).toEqual(MODULE_META_LIST.map((m) => m.number))
    expect(HOME_CAPSTONES.map((c) => c.moduleTitle)).toEqual(MODULE_META_LIST.map((m) => m.title))
  })
})
