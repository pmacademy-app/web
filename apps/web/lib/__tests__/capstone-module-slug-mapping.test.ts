import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToString } from 'react-dom/server'

const mockUseApiQuery = vi.fn()
vi.mock('@/lib/api/hooks', () => ({
  useApiQuery: (...args: unknown[]) => mockUseApiQuery(...args),
}))

import {
  getCapstoneDefinition,
  getCapstoneForModule,
  getCapstoneHref,
  getCapstoneSlugForModule,
  getCurriculumModuleForCapstone,
  getAllCapstoneDefinitions,
} from '@/config/capstones'
import { getLessonIdsForModule } from '@/lib/curriculum-registry'
import { LessonCapstonePreview } from '@/components/capstones/LessonCapstonePreview'
import { ModuleCompletedEmail } from '@/emails/templates/learning/ModuleCompleted'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

describe('curriculum module slug → capstone slug mapping', () => {
  beforeEach(() => {
    mockUseApiQuery.mockReset()
  })

  it('maps the Growth module to the metrics capstone', () => {
    expect(getCapstoneDefinition('growth')).toBeNull()
    expect(getCapstoneSlugForModule('growth')).toBe('metrics')
    expect(getCapstoneForModule('growth')?.moduleTitle).toBe('Metrics, Growth & Experiments')
    expect(getCapstoneHref('growth')).toBe('/capstones/metrics')
  })

  it('leaves modules whose slugs already match untouched', () => {
    expect(getCapstoneHref('foundations')).toBe('/capstones/foundations')
    expect(getCapstoneForModule('foundations')?.moduleSlug).toBe('foundations')
  })

  it('every capstone resolves back to a curriculum module with lessons', () => {
    expect(getCurriculumModuleForCapstone('metrics')).toBe('growth')
    for (const def of getAllCapstoneDefinitions()) {
      expect(getLessonIdsForModule(getCurriculumModuleForCapstone(def.moduleSlug))).toHaveLength(10)
    }
  })

  it('the Growth lesson capstone card links through the mapping', () => {
    const src = read('app/(app)/academy/[moduleSlug]/[lessonId]/lesson-content.tsx')
    expect(src).toContain('href={getCapstoneHref(lesson.module)}')
    expect(src).not.toContain('`/capstones/${lesson.module}`')
  })

  it('the lesson capstone preview for Growth fetches and links the metrics capstone', () => {
    mockUseApiQuery.mockReturnValue({
      data: { success: true, status: 'locked', lessonsCompleted: 2, totalLessons: 10, requiredLessons: 8 },
    })
    const html = renderToString(React.createElement(LessonCapstonePreview, { moduleSlug: 'growth' }))
    expect(html).not.toBe('')
    expect(mockUseApiQuery).toHaveBeenCalledWith('/api/capstones/metrics')
    expect(read('components/capstones/LessonCapstonePreview.tsx')).toContain('`/capstones/${definition.moduleSlug}`')
  })

  it('the module-completed email links Growth to the metrics capstone', () => {
    const html = renderToString(
      React.createElement(ModuleCompletedEmail, { moduleSlug: 'growth', appUrl: 'https://prodily.app' }),
    )
    expect(html).toContain('https://prodily.app/capstones/metrics')
    expect(html).not.toContain('/capstones?module=growth')
  })
})
