import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { lessonIdFromSegment, lessonPath, lessonSlug, slugifyLessonTitle } from '@/lib/curriculum/lesson-url'
import { LESSON_SLUGS } from '@/lib/curriculum/lesson-slugs.generated'

const curriculum = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../content/dist/curriculum.json'), 'utf8'),
) as { lessons: { id: string; title: string; module: string }[] }

describe('readable lesson URLs', () => {
  it('slugifies titles into lowercase words joined by hyphens', () => {
    expect(slugifyLessonTitle('What is Product Management?')).toBe('what-is-product-management')
    expect(slugifyLessonTitle('MVPs, PRDs & UX Design')).toBe('mvps-prds-and-ux-design')
    expect(slugifyLessonTitle("Jobs-to-be-Done: Users' Real Goals")).toBe('jobs-to-be-done-users-real-goals')
    expect(slugifyLessonTitle('  Café   Pricing  ')).toBe('cafe-pricing')
  })

  it('has one slug per compiled lesson, matching its current title (rerun content:build if this fails)', () => {
    expect(Object.keys(LESSON_SLUGS).sort()).toEqual(curriculum.lessons.map((l) => l.id).sort())
    for (const l of curriculum.lessons) expect(LESSON_SLUGS[l.id]).toBe(slugifyLessonTitle(l.title))
  })

  it('never gives two lessons the same address, and no slug looks like an ID', () => {
    const slugs = Object.values(LESSON_SLUGS)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const s of slugs) {
      expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(s.startsWith('les_')).toBe(false)
    }
  })

  it('builds the in-app path from the title', () => {
    expect(lessonPath('foundations', 'les_zoyq8a')).toBe('/academy/foundations/what-is-product-management')
  })

  it('resolves both the title slug and the old ID to the lesson ID', () => {
    expect(lessonIdFromSegment('what-is-product-management')).toBe('les_zoyq8a')
    expect(lessonIdFromSegment('les_zoyq8a')).toBe('les_zoyq8a')
    expect(lessonIdFromSegment('no-such-lesson')).toBeNull()
  })

  it('falls back to the ID for a lesson the map does not know', () => {
    expect(lessonSlug('les_unknown')).toBe('les_unknown')
  })
})
