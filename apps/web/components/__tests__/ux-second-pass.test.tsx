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

import { NextLessonPanel, type NextLessonPanelData } from '@/components/dashboard/home/NextLessonPanel'
import { TodaysPlan } from '@/components/dashboard/home/TodaysPlan'
import { calculateLevel } from '@/lib/xp/xp'

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
    const dummyNextLesson: NextLessonPanelData = {
      id: 'lesson-1',
      positionLabel: 'Module 1 · Lesson 1',
      title: 'First Lesson',
      module: 'foundations',
      moduleTitle: 'Foundations of Product Management',
      estimatedTime: '10 min',
      moduleDone: 0,
      moduleTotal: 10,
      started: true,
    }

    it('renders the next-lesson panel with one primary Resume action', () => {
      const html = renderToString(
        React.createElement(NextLessonPanel, { lesson: dummyNextLesson, level: calculateLevel(120), totalXp: 120 })
      )
      expect(html).toContain('Resume lesson')
      expect(html).toContain('/academy/foundations/lesson-1')
      expect(html.match(/bg-primary text-primary-foreground/g)?.length).toBe(1)
    })

    it("gives only the first item in Today's plan a primary button", () => {
      const html = renderToString(
        React.createElement(TodaysPlan, {
          items: [
            { key: 'lesson', icon: 'lesson', title: 'Finish First Lesson', detail: 'x', reward: 'y', action: 'Resume', href: '/academy/foundations/lesson-1', primary: true },
            { key: 'review', icon: 'review', title: 'Review 5 flashcards', detail: 'x', reward: '+10 XP', action: 'Start review', href: '/review' },
            { key: 'capstone', icon: 'capstone', title: 'Start the Module 1 capstone', detail: 'x', reward: '+150 XP', action: 'Open brief', href: '/capstones/foundations' },
          ],
        })
      )
      expect(html).toContain('/review')
      expect(html).toContain('/capstones/foundations')
      expect(html.match(/bg-primary text-primary-foreground/g)?.length).toBe(1)
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
