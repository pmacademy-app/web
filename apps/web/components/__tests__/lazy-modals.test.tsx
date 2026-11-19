/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import path from 'node:path'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Perf plan item 5: closed modals are not downloaded. Each host mounts its modal body (a
// next/dynamic chunk) only on first open, and the search chunk is preloaded on intent.

// Records when each modal module is first imported, which is when its chunk would download.
const loaded = vi.hoisted(() => ({ search: 0, quickStart: 0, feedback: 0 }))

// The global setup mocks next/dynamic to render nothing. Model the real behaviour: the loader
// runs on first render, then the component appears (React.lazy + Suspense).
vi.mock('next/dynamic', async () => {
  const ReactActual = await vi.importActual<typeof import('react')>('react')
  return {
    default: (loader: () => Promise<React.ComponentType<Record<string, unknown>>>) => {
      const Lazy = ReactActual.lazy(async () => ({ default: await loader() }))
      return function DynamicComponent(props: Record<string, unknown>) {
        return ReactActual.createElement(ReactActual.Suspense, { fallback: null }, ReactActual.createElement(Lazy, props))
      }
    },
  }
})

vi.mock('@/components/search/SearchOverlay', () => {
  loaded.search += 1
  return { SearchOverlay: () => <div data-testid="search-overlay" /> }
})
vi.mock('@/components/quick-start/QuickStartModal', () => {
  loaded.quickStart += 1
  return { QuickStartModal: () => <div data-testid="quick-start" /> }
})
vi.mock('@/components/feedback/ContextualFeedbackModal', () => {
  loaded.feedback += 1
  return {
    ContextualFeedbackModal: ({ isOpen, title }: { isOpen: boolean; title: string }) =>
      isOpen ? <div data-testid="feedback-modal">{title}</div> : null,
  }
})
vi.mock('@/hooks/useUsageTimeTracker', () => ({ useUsageTimeTracker: () => {} }))
vi.mock('@/lib/analytics', () => ({
  trackQuickStartOpened: vi.fn(),
  trackQuickStartStepViewed: vi.fn(),
  trackQuickStartCompleted: vi.fn(),
  trackQuickStartSkipped: vi.fn(),
  trackQuickStartReopened: vi.fn(),
}))
vi.mock('@/lib/api/client', () => ({ apiPost: vi.fn(async () => ({ ok: true })) }))
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }))

import { SearchOverlayHost, QuickStartModalHost, useOpenedOnce } from '@/components/layout/lazy-modals'
import { SearchOverlayProvider, useSearch } from '@/components/search/SearchOverlayProvider'
import { QuickStartProvider, useQuickStart } from '@/components/quick-start/QuickStartContext'
import { LearnerFeedbackProvider } from '@/components/feedback/LearnerFeedbackProvider'

let container: HTMLDivElement
let root: Root

async function settle() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

const q = (id: string) => container.querySelector(`[data-testid="${id}"]`)

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('useOpenedOnce', () => {
  it('is false until the first open and stays true after closing', async () => {
    const seen: boolean[] = []
    function Probe({ open }: { open: boolean }) {
      seen.push(useOpenedOnce(open))
      return null
    }
    await act(async () => root.render(<Probe open={false} />))
    expect(seen.at(-1)).toBe(false)
    await act(async () => root.render(<Probe open />))
    expect(seen.at(-1)).toBe(true)
    await act(async () => root.render(<Probe open={false} />))
    expect(seen.at(-1)).toBe(true)
  })
})

describe('SearchOverlayHost', () => {
  let search: ReturnType<typeof useSearch> | null = null
  function Grab() {
    search = useSearch()
    return null
  }

  it('downloads nothing until intent, preloads on Ctrl, and opens on Ctrl K', async () => {
    await act(async () =>
      root.render(
        <SearchOverlayProvider>
          <Grab />
          <SearchOverlayHost />
        </SearchOverlayProvider>,
      ),
    )
    await settle()
    expect(loaded.search).toBe(0)
    expect(q('search-overlay')).toBeNull()

    // Pressing Ctrl (the first half of the shortcut) starts the download.
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', ctrlKey: true }))
    })
    await settle()
    expect(loaded.search).toBe(1)
    expect(q('search-overlay')).toBeNull()

    // Ctrl K still opens search, handled by the eager provider.
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
    })
    await settle()
    expect(search?.isOpen).toBe(true)
    expect(q('search-overlay')).not.toBeNull()
  })
})

describe('QuickStartModalHost', () => {
  let ctx: ReturnType<typeof useQuickStart> | null = null
  function Grab() {
    ctx = useQuickStart()
    return null
  }

  it('never loads the tour for a learner who does not open it, and loads it on a manual reopen', async () => {
    await act(async () =>
      root.render(
        <QuickStartProvider initialOnboardingComplete initialQuickStartCompleted>
          <Grab />
          <QuickStartModalHost />
        </QuickStartProvider>,
      ),
    )
    await settle()
    expect(loaded.quickStart).toBe(0)
    expect(q('quick-start')).toBeNull()

    await act(async () => ctx!.openQuickStart('manual'))
    await settle()
    expect(loaded.quickStart).toBe(1)
    expect(q('quick-start')).not.toBeNull()
  })
})

describe('LearnerFeedbackProvider', () => {
  it('keeps the prompt listener eager and loads the modal on the first prompt', async () => {
    await act(async () => root.render(<LearnerFeedbackProvider />))
    await settle()
    expect(loaded.feedback).toBe(0)

    await act(async () => {
      window.dispatchEvent(new CustomEvent('learner:feedback:prompt', { detail: { key: 'module_complete' } }))
    })
    await settle()
    expect(loaded.feedback).toBe(1)
    expect(q('feedback-modal')?.textContent).toBe('Congratulations on Completing the Module!')
  })
})

describe('static imports are gone from the eager paths', () => {
  const ROOT = path.resolve(__dirname, '../..')
  const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

  it.each([
    ['app/(app)/layout.tsx', 'components/quick-start/QuickStartModal'],
    ['components/layout/AppShell.tsx', 'components/search/SearchOverlay\''],
    ['components/feedback/LearnerFeedbackProvider.tsx', './ContextualFeedbackModal'],
    ['components/notifications/AchievementCelebrationHost.tsx', 'celebration/AchievementCelebrationModal'],
    ['components/notifications/AchievementCelebrationHost.tsx', 'referral/ReferralShareModal'],
    ['app/(app)/academy/[moduleSlug]/[lessonId]/lesson-content.tsx', 'celebration/FirstSessionCelebrationModal'],
    ['app/(app)/academy/[moduleSlug]/[lessonId]/lesson-content.tsx', 'referral/ReferralInviteLauncher'],
  ])('%s does not import %s', (file, specifier) => {
    expect(read(file)).not.toContain(specifier)
  })
})
