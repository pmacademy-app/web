import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'

// The global setup renders Link as bare children; render a real anchor so hrefs show up in HTML assertions.
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) =>
    React.createElement('a', { href, ...props }, children),
}))

import { fetchCurriculumData, fetchCompiledLesson } from '../lesson-loader'
import PublicLessonPage, { generateMetadata as generateLessonMetadata } from '../../app/(marketing)/lessons/[slug]/page'
import { z } from 'zod'

const SeoLessonSchema = z.object({
  seoTitle: z.string().max(60, 'seoTitle must be up to 60 characters').optional(),
  seoDescription: z
    .string()
    .min(120, 'seoDescription must be at least 120 characters')
    .max(160, 'seoDescription must be at most 160 characters')
    .optional(),
  inShort: z
    .string()
    .refine(
      (val: string) => {
        const words = val.trim().split(/\s+/).filter(Boolean).length
        return words >= 40 && words <= 80
      },
      {
        message: 'inShort must be between 40 and 80 words',
      }
    )
    .optional(),
})

describe('SEO-05 & AEO-02: Lesson Titles, Answers and Progression', () => {
  it('Public lesson titles and social metadata have no "Lesson N:" prefix', async () => {
    const curriculum = await fetchCurriculumData()
    expect(curriculum).toBeDefined()
    expect(curriculum!.lessons.length).toBe(90)

    // Check first 20 updated lessons
    for (const lesson of curriculum!.lessons.slice(0, 20)) {
      const meta = await generateLessonMetadata({ params: Promise.resolve({ slug: lesson.slug }) })
      const title = meta.title as string

      expect(title).toBeDefined()
      expect(title).not.toMatch(/^Lesson \d+:/i)
      expect(title).toBe(lesson.seoTitle)

      const desc = meta.description as string
      expect(desc).toBeDefined()
      expect(desc).toBe(lesson.seoDescription)

      const ogTitle = meta.openGraph?.title as string
      expect(ogTitle).not.toMatch(/^Lesson \d+:/i)

      const twTitle = meta.twitter?.title as string
      expect(twTitle).not.toMatch(/^Lesson \d+:/i)
    }

    // Check fallback behavior on a lesson without seoTitle (e.g. lesson-025)
    const fallbackLesson = curriculum!.lessons.find((l) => l.slug === 'lesson-025')
    expect(fallbackLesson).toBeDefined()
    const fallbackMeta = await generateLessonMetadata({ params: Promise.resolve({ slug: fallbackLesson!.slug }) })
    expect(fallbackMeta.title).toBe(fallbackLesson!.title)
    expect(fallbackMeta.title).not.toMatch(/^Lesson \d+:/i)
  })

  it('Length limits are enforced on all 20 authoring frontmatters', async () => {
    const curriculum = await fetchCurriculumData()
    expect(curriculum).toBeDefined()

    const first20 = curriculum!.lessons.slice(0, 20)
    for (const lesson of first20) {
      expect(lesson.seoTitle, `${lesson.slug} missing seoTitle`).toBeDefined()
      expect(
        lesson.seoTitle!.length,
        `${lesson.slug} seoTitle "${lesson.seoTitle}" exceeds 60 characters`
      ).toBeLessThanOrEqual(60)

      expect(lesson.seoDescription, `${lesson.slug} missing seoDescription`).toBeDefined()
      expect(
        lesson.seoDescription!.length,
        `${lesson.slug} seoDescription too short (${lesson.seoDescription!.length} chars)`
      ).toBeGreaterThanOrEqual(120)
      expect(
        lesson.seoDescription!.length,
        `${lesson.slug} seoDescription too long (${lesson.seoDescription!.length} chars)`
      ).toBeLessThanOrEqual(160)

      expect(lesson.inShort, `${lesson.slug} missing inShort`).toBeDefined()
      const words = lesson.inShort!.trim().split(/\s+/).filter(Boolean).length
      expect(
        words,
        `${lesson.slug} inShort word count (${words} words) must be between 40 and 80`
      ).toBeGreaterThanOrEqual(40)
      expect(
        words,
        `${lesson.slug} inShort word count (${words} words) must be between 40 and 80`
      ).toBeLessThanOrEqual(80)

      // Ensure no em-dashes exist in any authored SEO field
      expect(lesson.seoTitle).not.toContain('\u2014')
      expect(lesson.seoDescription).not.toContain('\u2014')
      expect(lesson.inShort).not.toContain('\u2014')
    }
  })

  it('Schema rejects fields outside length constraints and allows missing fields', () => {
    const baseLesson = {
      schemaVersion: 2,
      id: 'les_test99',
      contentHash: 'hash_test',
      title: 'Valid Lesson Title',
      slug: 'lesson-099',
      module: 'foundations',
      order: 1,
      totalInModule: 10,
      difficulty: 1,
      estimatedReadingTime: 20,
      estimatedCompletionTime: 30,
      prerequisites: [],
      sourceFile: 'content/lessons/lesson-099.md',
      blocks: [],
      searchable: { plainText: '', headings: [] },
      createdAt: '2026-10-31T00:00:00.000Z',
      updatedAt: '2026-10-31T00:00:00.000Z',
    }

    // Missing fields should pass
    expect(SeoLessonSchema.safeParse(baseLesson).success).toBe(true)

    // Valid fields should pass
    expect(
      SeoLessonSchema.safeParse({
        ...baseLesson,
        seoTitle: 'Valid SEO Title Under Sixty Chars',
        seoDescription:
          'This is a valid SEO description that easily satisfies the minimum requirement of 120 characters and stays under the maximum of 160 characters in total.',
        inShort:
          'This in short answer provides a direct, comprehensive explanation that easily exceeds the required forty words minimum limit while staying well below the eighty words maximum limit, giving answer engines and searchers immediate clarity on the core topic without unnecessary filler.',
      }).success
    ).toBe(true)

    // Too long seoTitle should fail (> 60 chars)
    const longTitle = 'This title is far too long and definitely exceeds sixty characters in total length'
    expect(SeoLessonSchema.safeParse({ ...baseLesson, seoTitle: longTitle }).success).toBe(false)

    // Too short seoDescription should fail (< 120 chars)
    expect(
      SeoLessonSchema.safeParse({ ...baseLesson, seoDescription: 'Only 30 characters in length.' }).success
    ).toBe(false)

    // Too long seoDescription should fail (> 160 chars)
    const longDesc =
      'This description is intentionally written to be much longer than one hundred and sixty characters in length so that we can verify that the Zod schema validation correctly rejects any description that is excessively verbose.'
    expect(SeoLessonSchema.safeParse({ ...baseLesson, seoDescription: longDesc }).success).toBe(false)

    // Too short inShort (< 40 words) should fail
    const shortInShort = 'This short answer has only seven words.'
    expect(SeoLessonSchema.safeParse({ ...baseLesson, inShort: shortInShort }).success).toBe(false)

    // Too long inShort (> 80 words) should fail
    const longInShort = Array(85).fill('word').join(' ')
    expect(SeoLessonSchema.safeParse({ ...baseLesson, inShort: longInShort }).success).toBe(false)
  })

  it('"In short" renders in server HTML when present and is omitted when absent', async () => {
    // Lesson 1 has inShort
    const lesson1 = await fetchCompiledLesson('les_zoyq8a')
    expect(lesson1?.inShort).toBeDefined()

    const pageElement1 = await PublicLessonPage({ params: Promise.resolve({ slug: 'lesson-001' }) })
    const html1 = renderToString(pageElement1)

    expect(html1).toContain('In short')
    expect(html1).toContain(lesson1!.inShort!)

    // Lesson 25 does not have inShort
    const pageElement25 = await PublicLessonPage({ params: Promise.resolve({ slug: 'lesson-025' }) })
    const html25 = renderToString(pageElement25)

    expect(html25).not.toContain('aria-label="In short"')
  })

  it('"Before this" and "Builds toward" links match curriculum', async () => {
    const curriculum = await fetchCurriculumData()
    expect(curriculum).toBeDefined()

    // Test Lesson 1: Foundational (no prerequisites, multiple builds-toward)
    const lesson1 = curriculum!.lessons.find((l) => l.slug === 'lesson-001')!
    const pageElement1 = await PublicLessonPage({ params: Promise.resolve({ slug: 'lesson-001' }) })
    const html1 = renderToString(pageElement1)

    expect(html1).toContain('Before this')
    expect(html1).toContain('None (foundational lesson)')
    expect(html1).toContain('Builds toward')

    const expectedBuildsToward1 = curriculum!.lessons.filter((l) =>
      l.prerequisites?.includes(lesson1.id)
    )
    expect(expectedBuildsToward1.length).toBeGreaterThan(0)
    for (const target of expectedBuildsToward1) {
      expect(html1).toContain(`href="/lessons/${target.slug}"`)
      // React server render escapes & as &amp;
      const expectedTitle = target.title.replace(/&/g, '&amp;')
      expect(html1).toContain(expectedTitle)
    }

    // Test a lesson that has prerequisites (e.g. Lesson 2)
    const lesson2 = curriculum!.lessons.find((l) => l.slug === 'lesson-002')!
    const compiledLesson2 = await fetchCompiledLesson(lesson2.id)
    if (compiledLesson2 && compiledLesson2.prerequisites.length > 0) {
      const pageElement2 = await PublicLessonPage({ params: Promise.resolve({ slug: 'lesson-002' }) })
      const html2 = renderToString(pageElement2)

      expect(html2).toContain('Before this')
      for (const prereqId of compiledLesson2.prerequisites) {
        const prereq = curriculum!.lessons.find((l) => l.id === prereqId)
        if (prereq) {
          expect(html2).toContain(`href="/lessons/${prereq.slug}"`)
          const expectedTitle = prereq.title.replace(/&/g, '&amp;')
          expect(html2).toContain(expectedTitle)
        }
      }
    }
  })
})
