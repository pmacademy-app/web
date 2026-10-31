import { describe, it, expect, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { getAllCapstoneDefinitions, CAPSTONE_DEFINITIONS } from '@/config/capstones'
import { deriveProofState, type ProofStateInput } from '@/lib/growth/proof-state'
import { getLessonIdsForModule } from '@/lib/curriculum-registry'
import { MODULE_SLUGS } from '@/lib/curriculum/module-meta'
import { getLessonPosition } from '@/lib/curriculum/lesson-position'
import { CapstonesOverviewCard } from '@/components/progress/CapstonesOverviewCard'
import {
  ContinueLearningCard,
  FirstSessionKickoffCard,
  type NextLessonData,
} from '@/components/dashboard/ContinueLearningCard'
import VerifiedPage from '@/app/(auth)/verified/page'

// Phase 2 learner flows (T8): capstones in curriculum order (W3), module-local lesson
// labels on the dashboard (W1), and the verified page keeping `?next=` (S2).

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) =>
    React.createElement('a', { href, ...rest }, children),
}))
vi.mock('@/lib/analytics', () => ({ trackFirstSessionStarted: vi.fn() }))

// Text separators are dropped so assertions read like the rendered copy.
const html = (node: React.ReactElement) => renderToStaticMarkup(node).replace(/<!-- -->/g, '')

describe('W3 capstones follow curriculum order', () => {
  it('getAllCapstoneDefinitions returns Module 1..9 in order', () => {
    expect(getAllCapstoneDefinitions().map((c) => c.moduleNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('the record key order is not curriculum order (the regression being guarded)', () => {
    expect(Object.values(CAPSTONE_DEFINITIONS).map((c) => c.moduleNumber)).not.toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('CapstonesOverviewCard lists Module 1..9 in order', () => {
    const markup = html(React.createElement(CapstonesOverviewCard, { capstoneStatusByModule: new Map() }))
    const numbers = [...markup.matchAll(/>Module (\d)</g)].map((m) => Number(m[1]))
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('deriveProofState picks the earliest eligible module, not the first record key', () => {
    // Module 3 (design) and Module 8 (strategy) are both finished. The record lists strategy
    // before design, so key order would wrongly suggest the Module 8 capstone first.
    const completedLessonIds = [...getLessonIdsForModule('design'), ...getLessonIdsForModule('strategy')]
    expect(completedLessonIds.length).toBeGreaterThan(0)

    const input: ProofStateInput = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      user: {
        username: null,
        name: null,
        bio: null,
        avatar_url: null,
        linkedin_url: null,
        github_url: null,
        website_url: null,
        is_portfolio_public: false,
        is_fellow: false,
      },
      capstones: [],
      latestFellowRequestStatus: null,
      completedLessonIds,
      hasFullCurriculumCertificate: false,
    }

    expect(deriveProofState(input).nextCapstone?.slug).toBe('design')
  })
})

describe('W1 dashboard uses module-local lesson numbers', () => {
  const curriculum = {
    lessons: MODULE_SLUGS.flatMap((module) =>
      getLessonIdsForModule(module).map((id) => ({ id, module, title: `Title ${id}` })),
    ),
  }

  // The third lesson of Module 2: global position 13, module-local "Module 2 · Lesson 3".
  const lesson = curriculum.lessons.filter((l) => l.module === 'discovery')[2]
  const position = getLessonPosition(lesson, curriculum)
  const nextLesson: NextLessonData = {
    id: lesson.id,
    positionLabel: position.label,
    title: 'Customer Interviews',
    module: lesson.module,
    moduleTitle: position.moduleTitle,
    estimatedTime: '20 min',
  }

  it('resolves the module-local label for a lesson deep in the curriculum', () => {
    expect(position.globalNumber).toBe(13)
    expect(position.label).toBe('Module 2 · Lesson 3')
  })

  it('ContinueLearningCard headlines "{label}: {title}" with the module title, never the slug or global index', () => {
    const markup = html(React.createElement(ContinueLearningCard, { nextLesson, totalLessonsCompleted: 12 }))
    expect(markup).toContain('Module 2 · Lesson 3: Customer Interviews')
    expect(markup).toContain('Module: Users, Problems &amp; Discovery')
    expect(markup).not.toContain('Lesson 13')
    expect(markup).not.toMatch(/Module: discovery/i)
  })

  it('FirstSessionKickoffCard CTA reads "Start {label}" with the module title', () => {
    const markup = html(React.createElement(FirstSessionKickoffCard, { nextLesson }))
    expect(markup).toContain('Start Module 2 · Lesson 3')
    expect(markup).toContain('Module: Users, Problems &amp; Discovery')
    expect(markup).not.toContain('Lesson 13')
  })
})

describe('S2 verified page keeps a sanitized next path', () => {
  async function onboardingHref(params: Record<string, string | string[] | undefined>) {
    const markup = html(await VerifiedPage({ searchParams: Promise.resolve(params) }))
    return markup.match(/href="([^"]*onboarding[^"]*)"/)?.[1]
  }

  it('links to /onboarding with the encoded lesson path', async () => {
    expect(await onboardingHref({ next: '/academy/foundations/lesson-003' })).toBe(
      '/onboarding?next=%2Facademy%2Ffoundations%2Flesson-003',
    )
  })

  it('drops an off-site next and links to plain /onboarding', async () => {
    expect(await onboardingHref({ next: '//evil.example/phish' })).toBe('/onboarding')
    expect(await onboardingHref({ next: 'https://evil.example' })).toBe('/onboarding')
  })

  it('links to plain /onboarding when there is no next', async () => {
    expect(await onboardingHref({})).toBe('/onboarding')
  })
})
