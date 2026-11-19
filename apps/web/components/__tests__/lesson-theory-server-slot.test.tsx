/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BlockTreeServerRenderer } from '@/renderer/block-tree-server'
import type { CompiledBlock } from '@/types'
import type { ClientLesson } from '@/lib/academy/client-lesson'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Performance plan item 12: the Theory tab is rendered on the server (page.tsx) and handed to
// the client lesson shell as the `theory` / `deepDive` slots. The shell must still show it,
// keep its interactive blocks working, and keep the theory-read engagement tracking.

const progressHook = vi.hoisted(() => ({
  recordTheoryRead: vi.fn(),
  recordDeepDiveOpened: vi.fn(),
  markInProgress: vi.fn(),
  recordQuizAttempt: vi.fn(),
}))
const analytics = vi.hoisted(() => ({
  trackLessonStarted: vi.fn(),
  trackTheoryRead: vi.fn(),
  trackQuizCompleted: vi.fn(),
  trackLessonCompleted: vi.fn(),
  trackFirstLessonCompleted: vi.fn(),
  trackRecutExperimentExposed: vi.fn(),
  trackCoreViewed: vi.fn(),
  trackQuizStarted: vi.fn(),
  trackDeepDiveOpened: vi.fn(),
}))
const events = vi.hoisted(() => ({
  dispatchClientNotificationEvent: vi.fn(),
  showClientToast: vi.fn(),
}))

vi.mock('@/hooks/use-lesson-progress-v2', () => ({
  useLessonProgressV2: () => ({
    progress: {
      status: 'in_progress',
      theory_read_at: null,
      quiz_score: null,
      quiz_attempts: 0,
      xp_earned: 0,
      completed_at: null,
    },
    loading: false,
    error: null,
    ...progressHook,
  }),
}))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...rest }, children),
}))
vi.mock('@/contexts/breadcrumb-context', () => ({ useBreadcrumbs: () => ({ setBreadcrumbs: vi.fn() }) }))
vi.mock('@/lib/analytics', () => analytics)
vi.mock('@/lib/events/client-event-bus', () => events)
vi.mock('@/lib/api/client', () => ({ apiPost: vi.fn() }))
vi.mock('@/lib/api/hooks', () => ({ useApiQuery: () => ({ data: undefined, isLoading: false, mutate: vi.fn() }) }))
vi.mock('@/components/quick-start/QuickStartContext', () => ({ useQuickStartOptional: () => null }))
vi.mock('@/components/feedback/LessonFeedbackWidget', () => ({ LessonFeedbackWidget: () => null }))
vi.mock('@/components/capstones/LessonCapstonePreview', () => ({ LessonCapstonePreview: () => null }))
vi.mock('@/components/layout/lazy-modals', () => ({
  FirstSessionCelebrationModalLazy: () => null,
  ReferralInviteLauncherLazy: () => null,
  useOpenedOnce: (open: boolean) => open,
}))

import LessonPageContent from '@/app/(app)/academy/[moduleSlug]/[lessonId]/lesson-content'

const lesson = {
  schemaVersion: 2,
  id: 'les_test01',
  contentHash: 'h',
  title: 'Slot Lesson',
  slug: 'lesson-001',
  module: 'foundations',
  order: 1,
  totalInModule: 10,
  difficulty: 2,
  estimatedReadingTime: 9,
  estimatedCompletionTime: 20,
  prerequisites: [],
  blocks: [{ blockId: 'r1', type: 'reflection', prompts: ['What did you learn?'] }],
} as unknown as ClientLesson

const theoryBlocks: CompiledBlock[] = [
  { blockId: 'h1', type: 'heading', level: 2, text: 'Server Rendered Heading' },
  {
    blockId: 'mm1',
    type: 'mentalModel',
    name: 'Jobs To Be Done',
    children: [{ blockId: 'p1', type: 'paragraph', text: 'A **server** paragraph.' }],
  },
]

let container: HTMLDivElement
let root: Root

function mount(props: Partial<React.ComponentProps<typeof LessonPageContent>> = {}) {
  act(() => {
    root.render(
      <LessonPageContent
        lesson={lesson}
        prevLessonUrl={null}
        nextLessonUrl={null}
        globalOrder={1}
        moduleNumber={1}
        moduleLessonNumber={1}
        moduleName="Foundations"
        theory={<BlockTreeServerRenderer blocks={theoryBlocks} lessonId={lesson.id} />}
        coreReadingMinutes={7}
        deepDiveReadingMinutes={4}
        {...props}
      />
    )
  })
}

function button(text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent?.includes(text)
  )
  if (!found) throw new Error(`button "${text}" not found`)
  return found as HTMLButtonElement
}

beforeEach(() => {
  vi.useFakeTimers()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('LessonPageContent renders the server theory slot', () => {
  it('shows the theory node inside the theory panel', () => {
    mount()
    const panel = container.querySelector('#panel-theory')
    expect(panel?.textContent).toContain('Server Rendered Heading')
    expect(panel?.innerHTML).toContain('<strong>server</strong>')
    expect(panel?.textContent).toContain('Mark Theory as Read')
  })

  it('keeps interactive blocks inside the server tree working', () => {
    mount()
    act(() => button('Mark Understood').click())
    expect(button('Understood').textContent).toContain('Understood ✓')
  })

  it('still measures active seconds and scroll depth for the theory-read call', async () => {
    progressHook.recordTheoryRead.mockResolvedValue(undefined)
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 2000 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 })
    mount()

    act(() => {
      vi.advanceTimersByTime(3000)
      Object.defineProperty(window, 'scrollY', { configurable: true, value: 600 })
      window.dispatchEvent(new Event('scroll'))
    })

    await act(async () => {
      button('Mark Theory as Read').click()
    })

    expect(progressHook.recordTheoryRead).toHaveBeenCalledWith(3, 60)
    expect(analytics.trackTheoryRead).toHaveBeenCalledWith('les_test01')
    // Success moves the learner to the quiz tab.
    expect(container.querySelector('#panel-quiz')).not.toBeNull()
  })

  it('shows the server message and re-enables the button when the read is rejected', async () => {
    progressHook.recordTheoryRead.mockRejectedValue(new Error('Read a little longer.'))
    mount()

    await act(async () => {
      button('Mark Theory as Read').click()
    })

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Read a little longer.')
    expect(events.dispatchClientNotificationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'Read a little longer.', variant: 'error' })
    )
    expect(button('Mark Theory as Read').disabled).toBe(false)
  })

  it('treatment: mounts the server Deep-dive slot only when opened, and tracks the open', () => {
    mount({
      recutVariant: 'treatment',
      deepDive: <p>Deep dive server content</p>,
    })
    expect(container.textContent).toContain('Core')
    expect(container.textContent).not.toContain('Deep dive server content')

    act(() => button('optional depth').click())

    expect(container.textContent).toContain('Deep dive server content')
    expect(analytics.trackDeepDiveOpened).toHaveBeenCalledWith('les_test01')
    expect(progressHook.recordDeepDiveOpened).toHaveBeenCalledTimes(1)
  })

  it('treatment without a Deep-dive slot renders no Deep-dive section', () => {
    mount({ recutVariant: 'treatment', deepDive: null })
    expect(container.textContent).not.toContain('optional depth')
  })
})
