/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Growth R1 / Task 10: the host claims one achievement celebration at a time from the server.
// A claim is consumed server-side, so the host only asks when it could show the answer, and a
// claimed celebration is held until it has been shown — never dropped.

const BELL_KEY = '/api/notifications?limit=1'

const nav = vi.hoisted(() => ({ pathname: '/dashboard' }))
const analytics = vi.hoisted(() => ({
  trackQuickStartOpened: vi.fn(),
  trackQuickStartStepViewed: vi.fn(),
  trackQuickStartCompleted: vi.fn(),
  trackQuickStartSkipped: vi.fn(),
  trackQuickStartReopened: vi.fn(),
}))
const api = vi.hoisted(() => ({ apiPost: vi.fn() }))
// Stands in for the bell's SWR query: the test sets `data` and re-renders.
const bell = vi.hoisted(() => ({
  data: undefined as { success: boolean; unreadCount: number } | undefined,
  mutate: vi.fn(),
  useApiQuery: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}))
vi.mock('@/lib/analytics', () => analytics)
vi.mock('@/lib/api/client', () => api)
vi.mock('@/lib/api/hooks', () => ({ useApiQuery: bell.useApiQuery }))
// The modal has its own suite. Here it only reports what the host asks it to show; clicking
// the stand-in closes it.
vi.mock('@/components/celebration/AchievementCelebrationModal', () => ({
  AchievementCelebrationModal: ({
    celebration,
    onClose,
  }: {
    celebration: { notificationId: string } | null
    onClose: () => void
  }) =>
    celebration ? (
      <div data-testid="celebration" data-notification-id={celebration.notificationId} onClick={onClose} />
    ) : null,
}))

import { AchievementCelebrationHost } from '@/components/notifications/AchievementCelebrationHost'
import { QuickStartProvider, useQuickStart } from '@/components/quick-start/QuickStartContext'
import { QUICK_START_PENDING_KEY } from '@/lib/quick-start/deferred-launch'
import {
  ACHIEVEMENT_CELEBRATIONS_PATH,
  type AchievementCelebration,
} from '@/lib/api/contracts/achievement-celebration'

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

const portfolio = { username: 'jane_doe', displayName: 'Jane Doe', isPublic: true }
const fellow = (id: string): AchievementCelebration => ({ kind: 'fellow', notificationId: id, portfolio })
const answer = (celebration: AchievementCelebration | null) => ({
  ok: true as const,
  data: { success: true as const, celebration },
  status: 200,
})
const failure = {
  ok: false as const,
  error: { kind: 'http' as const, code: 'INTERNAL_ERROR', message: 'Something went wrong.', status: 500 },
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

let container: HTMLDivElement
let root: Root

async function render(opts: { completed?: boolean; strict?: boolean } = {}) {
  // A fresh element per render, so the host re-reads the mocked pathname and bell data (in
  // the app, navigation and SWR re-render it).
  const draw = async () => {
    const tree = (
      <QuickStartProvider initialOnboardingComplete initialQuickStartCompleted={opts.completed ?? false}>
        <Probe onContext={setCtx} />
        <AchievementCelebrationHost quickStartCompleted={opts.completed ?? false} />
      </QuickStartProvider>
    )
    await act(async () => {
      root.render(opts.strict ? <React.StrictMode>{tree}</React.StrictMode> : tree)
    })
  }
  await draw()
  return {
    redraw: draw,
    navigate: async (next: string) => {
      nav.pathname = next
      await draw()
    },
    setUnread: async (unreadCount: number) => {
      bell.data = { success: true, unreadCount }
      await draw()
    },
  }
}

function flush(ms = 1000) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

const claims = () => api.apiPost.mock.calls.filter(([path]) => path === ACHIEVEMENT_CELEBRATIONS_PATH).length
const stub = () => document.querySelector<HTMLElement>('[data-testid="celebration"]')
const shown = () => stub()?.getAttribute('data-notification-id') ?? null

async function closeCelebration() {
  const el = stub()
  if (!el) throw new Error('no celebration is shown')
  await act(async () => {
    el.click()
  })
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
  })
  window.localStorage.clear()
  window.sessionStorage.clear()
  nav.pathname = '/dashboard'
  ctx = null
  Object.values(analytics).forEach((fn) => fn.mockReset())
  api.apiPost.mockReset().mockResolvedValue(answer(null))
  bell.data = { success: true, unreadCount: 1 }
  bell.mutate.mockReset().mockResolvedValue(undefined)
  bell.useApiQuery.mockReset().mockImplementation(() => ({ data: bell.data, mutate: bell.mutate }))
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

describe('AchievementCelebrationHost — when it claims', () => {
  it('claims with a body-less POST and shows the celebration', async () => {
    api.apiPost.mockResolvedValueOnce(answer(fellow('ntf-1')))
    await render()

    expect(api.apiPost).toHaveBeenCalledWith(ACHIEVEMENT_CELEBRATIONS_PATH)
    expect(claims()).toBe(1)
    expect(shown()).toBe('ntf-1')
  })

  it('does not claim on a lesson path, and claims once the learner leaves it', async () => {
    nav.pathname = '/academy/foundations/les_1'
    const { navigate } = await render()
    expect(claims()).toBe(0)

    await navigate('/academy/l/les_2')
    expect(claims()).toBe(0)

    await navigate('/academy/foundations')
    expect(claims()).toBe(1)
  })

  it('does not claim while Quick Start is open, and claims when it closes', async () => {
    bell.data = { success: true, unreadCount: 0 }
    const { setUnread } = await render()
    act(() => ctx!.openQuickStart('manual'))

    await setUnread(1)
    expect(claims()).toBe(0)

    await act(async () => ctx!.closeQuickStart())
    expect(claims()).toBe(1)
  })

  it('does not claim while a deferred Quick Start is about to open, and claims after it closes', async () => {
    window.localStorage.setItem(QUICK_START_PENDING_KEY, '1')
    await render()
    expect(claims()).toBe(0)

    flush()
    expect(ctx!.isOpen).toBe(true)
    expect(claims()).toBe(0)

    await act(async () => ctx!.closeQuickStart())
    expect(claims()).toBe(1)
  })

  it('ignores a stale deferred Quick Start flag once the tour is completed', async () => {
    window.localStorage.setItem(QUICK_START_PENDING_KEY, '1')
    await render({ completed: true })

    expect(claims()).toBe(1)
  })

  it('does not claim when nothing is unread, or before the bell has loaded', async () => {
    bell.data = undefined
    const { setUnread, navigate } = await render()
    expect(claims()).toBe(0)

    await setUnread(0)
    await navigate('/progress')
    expect(claims()).toBe(0)
  })

  it('claims once under StrictMode and while a request is in flight', async () => {
    const pending = deferred<ReturnType<typeof answer>>()
    api.apiPost.mockReturnValueOnce(pending.promise)
    const { redraw, navigate, setUnread } = await render({ strict: true })
    expect(claims()).toBe(1)

    await redraw()
    await navigate('/progress')
    await setUnread(3)
    expect(claims()).toBe(1)

    await act(async () => {
      pending.resolve(answer(fellow('ntf-1')))
    })
    expect(shown()).toBe('ntf-1')
    expect(claims()).toBe(1)
  })
})

describe('AchievementCelebrationHost — showing what it claimed', () => {
  it('claims the next one after the modal closes, and stops at a null answer', async () => {
    api.apiPost.mockResolvedValueOnce(answer(fellow('ntf-1'))).mockResolvedValueOnce(answer(fellow('ntf-2')))
    bell.data = { success: true, unreadCount: 2 }
    const { redraw } = await render()
    expect(shown()).toBe('ntf-1')
    expect(claims()).toBe(1)

    await closeCelebration()
    expect(shown()).toBe('ntf-2')
    expect(claims()).toBe(2)

    await closeCelebration()
    expect(shown()).toBeNull()
    expect(claims()).toBe(3)

    await redraw()
    expect(claims()).toBe(3)
  })

  it('holds a claimed celebration on a lesson page and shows it once the learner leaves', async () => {
    api.apiPost.mockResolvedValueOnce(answer(fellow('ntf-1')))
    const { navigate } = await render()
    expect(shown()).toBe('ntf-1')

    await navigate('/academy/foundations/les_1')
    expect(shown()).toBeNull()

    await navigate('/academy')
    expect(shown()).toBe('ntf-1')
    expect(claims()).toBe(1)
  })

  it('holds a celebration that arrives after the learner moved onto a lesson', async () => {
    const pending = deferred<ReturnType<typeof answer>>()
    api.apiPost.mockReturnValueOnce(pending.promise)
    const { navigate } = await render()
    await navigate('/academy/foundations/les_1')

    await act(async () => {
      pending.resolve(answer(fellow('ntf-1')))
    })
    expect(shown()).toBeNull()

    await navigate('/dashboard')
    expect(shown()).toBe('ntf-1')
    expect(claims()).toBe(1)
  })

  it('hides a held celebration while Quick Start is open and shows it again after', async () => {
    api.apiPost.mockResolvedValueOnce(answer(fellow('ntf-1')))
    await render()
    expect(shown()).toBe('ntf-1')

    await act(async () => ctx!.openQuickStart('manual'))
    expect(shown()).toBeNull()

    await act(async () => ctx!.closeQuickStart())
    expect(shown()).toBe('ntf-1')
    expect(claims()).toBe(1)
  })
})

describe('AchievementCelebrationHost — the bell', () => {
  it('reads the unread count from the bell key and revalidates it after a claim', async () => {
    api.apiPost.mockResolvedValueOnce(answer(fellow('ntf-1')))
    await render()

    expect(bell.useApiQuery).toHaveBeenCalled()
    expect(bell.useApiQuery.mock.calls.every(([key]) => key === BELL_KEY)).toBe(true)
    expect(bell.mutate).toHaveBeenCalledTimes(1)
    expect(bell.mutate).toHaveBeenCalledWith()
  })

  it('does not revalidate the bell after a null answer', async () => {
    await render()

    expect(claims()).toBe(1)
    expect(bell.mutate).not.toHaveBeenCalled()
  })
})

describe('AchievementCelebrationHost — answers with nothing to show', () => {
  it('does not ask again after a null answer until the unread count changes', async () => {
    const { redraw, navigate, setUnread } = await render()
    expect(claims()).toBe(1)

    await redraw()
    await navigate('/progress')
    await navigate('/dashboard')
    expect(claims()).toBe(1)

    await setUnread(2)
    expect(claims()).toBe(2)
  })

  it.each([
    ['ok: false', () => Promise.resolve(failure)],
    ['a rejected request', () => Promise.reject(new Error('offline'))],
  ])('is silent on %s and does not loop', async (_label, respond) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    api.apiPost.mockImplementation(respond)
    const { redraw, navigate, setUnread } = await render()

    expect(shown()).toBeNull()
    expect(claims()).toBe(1)

    await redraw()
    await navigate('/progress')
    expect(claims()).toBe(1)
    expect(bell.mutate).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()

    // A changed unread count is the only thing that asks again.
    await setUnread(2)
    expect(claims()).toBe(2)
    consoleError.mockRestore()
  })
})
