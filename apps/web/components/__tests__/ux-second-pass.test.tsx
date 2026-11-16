/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from 'vitest'
import * as React from 'react'
import { renderToString } from 'react-dom/server'
import * as fs from 'fs'
import * as path from 'path'

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import { ContinueLearningCard, type NextLessonData } from '@/components/dashboard/ContinueLearningCard'
import { FlashcardReviewPromptCard } from '@/components/dashboard/FlashcardReviewPromptCard'
import { NextCapstonePromptCard } from '@/components/dashboard/NextCapstonePromptCard'

describe('AG-30: App UX Second Pass', () => {
  const lessonContentPath = path.resolve(
    __dirname,
    '../../app/(app)/academy/[moduleSlug]/[lessonId]/lesson-content.tsx'
  )
  const lessonContentSource = fs.readFileSync(lessonContentPath, 'utf-8')

  describe('Reading Column & Lock Copy', () => {
    it('sets reading column to max-w-[68ch] on the theory panel', () => {
      expect(lessonContentSource).toContain('id="panel-theory"')
      expect(lessonContentSource).toContain('max-w-[68ch]')
      expect(lessonContentSource).toContain('leading-relaxed')
    })

    it('uses plain language lock copy without internal jargon', () => {
      expect(lessonContentSource).toContain('Read the lesson to unlock the quiz.')
      expect(lessonContentSource).toContain('Pass the quiz to unlock the reflection.')
      expect(lessonContentSource).toContain('Lesson read. Quiz is now unlocked!')
      expect(lessonContentSource).not.toContain('Theory section completed. Quiz is now unlocked!')
    })

    it('contains zero alert( calls across application code', () => {
      const appDir = path.resolve(__dirname, '../../app')
      const componentsDir = path.resolve(__dirname, '../../components')

      const findAlerts = (dir: string): string[] => {
        const found: string[] = []
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            if (entry.name !== '__tests__' && entry.name !== 'node_modules') {
              found.push(...findAlerts(fullPath))
            }
          } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
            const content = fs.readFileSync(fullPath, 'utf-8')
            if (/\balert\s*\(/.test(content)) {
              found.push(fullPath)
            }
          }
        }
        return found
      }

      const appAlerts = findAlerts(appDir)
      const componentsAlerts = findAlerts(componentsDir)
      expect([...appAlerts, ...componentsAlerts]).toEqual([])
    })
  })

  describe('Dashboard CTAs', () => {
    const dummyNextLesson: NextLessonData = {
      id: 'lesson-1',
      positionLabel: 'Module 1 · Lesson 1',
      title: 'First Lesson',
      module: 'foundations',
      moduleTitle: 'Foundations of Product Management',
      estimatedTime: '10 min',
    }

    it('renders ContinueLearningCard with primary Up Next action', () => {
      const html = renderToString(
        React.createElement(ContinueLearningCard, {
          nextLesson: dummyNextLesson,
          totalLessonsCompleted: 3,
        })
      )
      expect(html).toContain('Up Next')
      expect(html).toContain('Continue Lesson')
      expect(html).toContain('bg-primary')
    })

    it('renders secondary prompt cards with understated links rather than competing buttons', () => {
      const flashcardHtml = renderToString(
        React.createElement(FlashcardReviewPromptCard, {
          dueCount: 5,
          totalUnlocked: 10,
        })
      )
      expect(flashcardHtml).toContain('/review')
      expect(flashcardHtml).not.toContain('bg-primary text-primary-foreground')

      const capstoneHtml = renderToString(
        React.createElement(NextCapstonePromptCard, {
          prompt: {
            moduleSlug: 'foundations',
            moduleNumber: 1,
            title: 'Foundations Capstone',
            deliverableType: 'PRD Document',
          },
          submittedCount: 0,
        })
      )
      expect(capstoneHtml).toContain('/capstones/foundations')
      expect(capstoneHtml).not.toContain('bg-primary text-primary-foreground')
    })
  })

  describe('Route-Shaped Loading Skeletons', () => {
    it('provides loading skeletons for dashboard, academy, and progress', () => {
      const dashboardLoading = path.resolve(__dirname, '../../app/(app)/dashboard/loading.tsx')
      const academyLoading = path.resolve(__dirname, '../../app/(app)/academy/loading.tsx')
      const progressLoading = path.resolve(__dirname, '../../app/(app)/progress/loading.tsx')

      expect(fs.existsSync(dashboardLoading)).toBe(true)
      expect(fs.existsSync(academyLoading)).toBe(true)
      expect(fs.existsSync(progressLoading)).toBe(true)
    })
  })
})
