/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Growth R1 / Task 5: closing the first-lesson celebration queues the Quick Start tour; the
// provider opens it (as a 'post_first_lesson' open) on the next non-lesson page, once per session, and
// never once the learner has skipped or finished it.

const nav = vi.hoisted(() => ({ pathname: '/academy/foundations/les_1' }))
const analytics = vi.hoisted(() => ({
  trackQuickStartOpened: vi.fn(),
  trackQuickStartStepViewed: vi.fn(),
  trackQuickStartCompleted: vi.fn(),
  trackQuickStartSkipped: vi.fn(),
  trackQuickStartReopened: vi.fn(),
}))
const api = vi.hoisted(() => ({ apiPost: vi.fn() }))

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}))
vi.mock('@/lib/analytics', () => analytics)
vi.mock('@/lib/api/client', () => api)

import {
  QuickStartProvider,
  useQuickStart,
  useQuickStartOptional,
} from '@/components/quick-start/QuickStartContext'
import { QuickStartModal } from '@/components/quick-start/QuickStartModal'
import {
  QUICK_START_PENDING_KEY,
  QUICK_START_AUTO_SHOWN_KEY,
} from '@/lib/quick-start/deferred-launch'

type Ctx = ReturnType<typeof useQuickStart>
let ctx: Ctx | null = null

const setCtx = (value: Ctx) => {
  ctx = value
}

// Reports the latest context after every commit (an effect, so render stays pure).
function Probe({ onContext }: { onContext: (value: Ctx) => void }) {
  const value = useQuickStart()
  React.useEffect(() => {
    onContext(value)
  })
  return null
}

let container: HTMLDivElement
let root: Root

function render(opts: { completed?: boolean; strict?: boolean; withModal?: boolean } = {}) {
  // A fresh element per render: re-rendering the identical element lets React bail out, and
  // the provider would never re-read the mocked pathname (in the app, navigation re-renders
  // it through the router context).
  const draw = () => {
    const tree = (
      <QuickStartProvider initialOnboardingComplete initialQuickStartCompleted={opts.completed ?? false}>
        <Probe onContext={setCtx} />
        {opts.withModal ? (
          <>
            {/* A focusable stand-in for the Topbar control (a raw button element is inventory-gated). */}
            <input aria-label="Trigger" data-testid="trigger" />
            <QuickStartModal />
          </>
        ) : null}
      </QuickStartProvider>
    )
    act(() => {
      root.render(opts.strict ? <React.StrictMode>{tree}</React.StrictMode> : tree)
    })
  }
  draw()
  return (next: string) => {
    nav.pathname = next
    draw()
  }
}

function flush(ms = 1000) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

const deferredOpens = () =>
  analytics.trackQuickStartOpened.mock.calls.filter(([mode]) => mode === 'post_first_lesson').length

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
  })
  window.localStorage.clear()
  window.sessionStorage.clear()
  nav.pathname = '/academy/foundations/les_1'
  ctx = null
  Object.values(analytics).forEach((fn) => fn.mockReset())
  api.apiPost.mockReset().mockResolvedValue({ ok: true, data: null })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

describe('QuickStartProvider deferred launch', () => {
  it('does not open on the lesson page, then opens once as post_first_lesson on the next non-lesson page', () => {
    const navigate = render()

    act(() => ctx!.requestDeferredLaunch())
    flush()
    expect(ctx!.isOpen).toBe(false)
    expect(window.localStorage.getItem(QUICK_START_PENDING_KEY)).toBe('1')

    navigate('/dashboard')
    // Waits for the celebration dialog to unmount before opening.
    flush(100)
    expect(ctx!.isOpen).toBe(false)
    flush()
    expect(ctx!.isOpen).toBe(true)
    expect(ctx!.isManualReopen).toBe(false)
    expect(ctx!.openMode).toBe('post_first_lesson')
    expect(ctx!.currentStepIndex).toBe(0)
    expect(analytics.trackQuickStartOpened).toHaveBeenCalledTimes(1)
    expect(analytics.trackQuickStartOpened).toHaveBeenCalledWith('post_first_lesson')
    expect(analytics.trackQuickStartReopened).not.toHaveBeenCalled()
    expect(analytics.trackQuickStartStepViewed).toHaveBeenCalledWith(1, expect.any(String))
    expect(window.localStorage.getItem(QUICK_START_PENDING_KEY)).toBeNull()
    expect(window.sessionStorage.getItem(QUICK_START_AUTO_SHOWN_KEY)).toBe('1')

    // Closed without skipping; further navigation in this session does not reopen it.
    act(() => ctx!.closeQuickStart())
    navigate('/academy')
    flush()
    navigate('/dashboard')
    flush()
    expect(ctx!.isOpen).toBe(false)
    expect(analytics.trackQuickStartOpened).toHaveBeenCalledTimes(1)
  })

  it('does not reopen on a second request in the same session', () => {
    const navigate = render()
    act(() => ctx!.requestDeferredLaunch())
    navigate('/dashboard')
    flush()
    expect(deferredOpens()).toBe(1)
    act(() => ctx!.closeQuickStart())

    navigate('/academy/foundations/les_2')
    act(() => ctx!.requestDeferredLaunch())
    navigate('/academy')
    flush()
    expect(ctx!.isOpen).toBe(false)
    expect(deferredOpens()).toBe(1)
  })

  it('opens without a pathname change when requested off a lesson page', () => {
    nav.pathname = '/academy/foundations'
    render()
    act(() => ctx!.requestDeferredLaunch())
    flush()
    expect(ctx!.isOpen).toBe(true)
    expect(deferredOpens()).toBe(1)
  })

  it('stays on lesson 2 when the learner continues to the next lesson', () => {
    const navigate = render()
    act(() => ctx!.requestDeferredLaunch())
    navigate('/academy/foundations/les_2')
    flush()
    navigate('/academy/l/les_3')
    flush()
    expect(ctx!.isOpen).toBe(false)
    expect(analytics.trackQuickStartOpened).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(QUICK_START_PENDING_KEY)).toBe('1')
  })

  it('opens a pending tour left over from an earlier session', () => {
    window.localStorage.setItem(QUICK_START_PENDING_KEY, '1')
    nav.pathname = '/dashboard'
    render()
    flush()
    expect(ctx!.isOpen).toBe(true)
    expect(deferredOpens()).toBe(1)
  })

  it('opens exactly once when a StrictMode mount lands on a non-lesson page with a pending tour', () => {
    window.localStorage.setItem(QUICK_START_PENDING_KEY, '1')
    nav.pathname = '/dashboard'
    render({ strict: true })
    flush()
    expect(ctx!.isOpen).toBe(true)
    expect(analytics.trackQuickStartOpened).toHaveBeenCalledTimes(1)
    expect(analytics.trackQuickStartOpened).toHaveBeenCalledWith('post_first_lesson')
  })

  it('keeps the pending tour when the learner moves onto a lesson before the delay elapses', () => {
    window.localStorage.setItem(QUICK_START_PENDING_KEY, '1')
    nav.pathname = '/dashboard'
    const navigate = render()
    // Run the animation frame only; the 300ms timer is still pending.
    flush(20)
    expect(ctx!.isOpen).toBe(false)

    navigate('/academy/foundations/les_2')
    flush()
    expect(ctx!.isOpen).toBe(false)
    expect(analytics.trackQuickStartOpened).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(QUICK_START_PENDING_KEY)).toBe('1')
    expect(window.sessionStorage.getItem(QUICK_START_AUTO_SHOWN_KEY)).toBeNull()

    navigate('/academy')
    flush()
    expect(ctx!.isOpen).toBe(true)
    expect(deferredOpens()).toBe(1)
  })

  it('does not open, and keeps the pending tour, when the provider unmounts mid-delay', () => {
    const navigate = render()
    act(() => ctx!.requestDeferredLaunch())
    navigate('/dashboard')
    flush(20)
    act(() => root.unmount())
    flush()
    expect(analytics.trackQuickStartOpened).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(QUICK_START_PENDING_KEY)).toBe('1')
    expect(window.sessionStorage.getItem(QUICK_START_AUTO_SHOWN_KEY)).toBeNull()
    // afterEach unmounts again; give it a fresh root.
    root = createRoot(container)
  })

  it('never opens when the tour was already completed (server flag)', () => {
    const navigate = render({ completed: true })
    act(() => ctx!.requestDeferredLaunch())
    expect(window.localStorage.getItem(QUICK_START_PENDING_KEY)).toBeNull()
    navigate('/dashboard')
    flush()
    expect(ctx!.isOpen).toBe(false)
    expect(analytics.trackQuickStartOpened).not.toHaveBeenCalled()
  })

  it('never opens for a stale pending flag once the server says completed, and clears it', () => {
    window.localStorage.setItem(QUICK_START_PENDING_KEY, '1')
    nav.pathname = '/dashboard'
    render({ completed: true })
    flush()
    expect(ctx!.isOpen).toBe(false)
    expect(analytics.trackQuickStartOpened).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(QUICK_START_PENDING_KEY)).toBeNull()
  })

  it('a manual open plus skip clears a queued tour', async () => {
    render()
    act(() => ctx!.requestDeferredLaunch())
    expect(window.localStorage.getItem(QUICK_START_PENDING_KEY)).toBe('1')

    act(() => ctx!.openQuickStart('manual'))
    expect(ctx!.openMode).toBe('manual')
    expect(ctx!.isManualReopen).toBe(true)
    expect(window.localStorage.getItem(QUICK_START_PENDING_KEY)).toBeNull()

    // A flag queued while the tour is open (e.g. another tab) is cleared by the skip.
    window.localStorage.setItem(QUICK_START_PENDING_KEY, '1')
    await act(async () => {
      await ctx!.skipTour()
    })
    expect(window.localStorage.getItem(QUICK_START_PENDING_KEY)).toBeNull()
  })

  it('never opens after the learner skipped the tour, even with a stale completed prop', async () => {
    const navigate = render()
    act(() => ctx!.openQuickStart('manual'))
    await act(async () => {
      await ctx!.skipTour()
    })
    expect(api.apiPost).toHaveBeenCalledWith('/api/user/quick-start')
    analytics.trackQuickStartOpened.mockClear()

    act(() => ctx!.requestDeferredLaunch())
    expect(window.localStorage.getItem(QUICK_START_PENDING_KEY)).toBeNull()
    navigate('/dashboard')
    flush()
    expect(ctx!.isOpen).toBe(false)
    expect(analytics.trackQuickStartOpened).not.toHaveBeenCalled()
  })

  it('never opens after the learner finished the tour', async () => {
    const navigate = render()
    act(() => ctx!.openQuickStart('manual'))
    await act(async () => {
      await ctx!.finishTour()
    })
    analytics.trackQuickStartOpened.mockClear()

    act(() => ctx!.requestDeferredLaunch())
    navigate('/dashboard')
    flush()
    expect(ctx!.isOpen).toBe(false)
    expect(analytics.trackQuickStartOpened).not.toHaveBeenCalled()
  })
})

describe('useQuickStartOptional', () => {
  it('returns null outside a provider instead of throwing', () => {
    let value: unknown = 'unset'
    const report = (next: unknown) => {
      value = next
    }
    function Outside({ onValue }: { onValue: (next: unknown) => void }) {
      const optional = useQuickStartOptional()
      React.useEffect(() => {
        onValue(optional)
      })
      return null
    }
    act(() => root.render(<Outside onValue={report} />))
    expect(value).toBeNull()
  })
})

describe('QuickStartModal focus and dismissal', () => {
  const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')
  const backdrop = () =>
    dialog()!.parentElement!.querySelector<HTMLElement>(':scope > div[aria-hidden="true"]')!
  const pressKey = (key: string, init: KeyboardEventInit = {}) => {
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
    })
  }

  it('moves focus into the dialog on open and restores it on close', () => {
    nav.pathname = '/dashboard'
    render({ withModal: true })
    const trigger = container.querySelector<HTMLElement>('[data-testid="trigger"]')!
    trigger.focus()

    act(() => ctx!.openQuickStart('manual'))
    expect(dialog()).not.toBeNull()
    expect(document.activeElement).toBe(dialog())

    act(() => ctx!.closeQuickStart())
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('keeps Tab and Shift+Tab inside the dialog', () => {
    nav.pathname = '/dashboard'
    render({ withModal: true })
    act(() => ctx!.openQuickStart('manual'))
    const focusables = Array.from(dialog()!.querySelectorAll<HTMLElement>('button:not([disabled])'))
    expect(focusables.length).toBeGreaterThan(1)
    const first = focusables[0]
    const last = focusables[focusables.length - 1]

    last.focus()
    pressKey('Tab')
    expect(document.activeElement).toBe(first)

    pressKey('Tab', { shiftKey: true })
    expect(document.activeElement).toBe(last)

    // From the dialog container itself, Shift+Tab wraps to the last control.
    dialog()!.focus()
    pressKey('Tab', { shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('a backdrop click closes a post_first_lesson tour without skipping it', () => {
    window.localStorage.setItem(QUICK_START_PENDING_KEY, '1')
    nav.pathname = '/dashboard'
    render({ withModal: true })
    flush()
    expect(ctx!.openMode).toBe('post_first_lesson')

    act(() => backdrop().click())
    expect(ctx!.isOpen).toBe(false)
    expect(analytics.trackQuickStartSkipped).not.toHaveBeenCalled()
    expect(api.apiPost).not.toHaveBeenCalled()
  })

  it('Esc still skips a post_first_lesson tour', async () => {
    window.localStorage.setItem(QUICK_START_PENDING_KEY, '1')
    nav.pathname = '/dashboard'
    render({ withModal: true })
    flush()
    expect(ctx!.isOpen).toBe(true)

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    })
    expect(ctx!.isOpen).toBe(false)
    expect(analytics.trackQuickStartSkipped).toHaveBeenCalledWith(1)
    expect(api.apiPost).toHaveBeenCalledWith('/api/user/quick-start')
  })

  it('a backdrop click still skips a manually opened tour', async () => {
    nav.pathname = '/dashboard'
    render({ withModal: true })
    act(() => ctx!.openQuickStart('manual'))

    await act(async () => {
      backdrop().click()
    })
    expect(ctx!.isOpen).toBe(false)
    expect(analytics.trackQuickStartSkipped).toHaveBeenCalledWith(1)
    expect(api.apiPost).toHaveBeenCalledWith('/api/user/quick-start')
  })
})
