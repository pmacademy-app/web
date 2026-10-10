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
  // Used by the real ReferralShareModal the host opens from the Fellow celebration.
  trackReferralModalOpened: vi.fn(),
  trackReferralLinkCopied: vi.fn(),
  trackReferralShared: vi.fn(),
}))
const api = vi.hoisted(() => ({ apiPost: vi.fn(), apiGet: vi.fn() }))
// The last onInvitePeers the modal received, so a test can click it again mid-animation.
const lastInvite = vi.hoisted(() => ({ fn: null as null | ((kind: string) => void) }))
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
// the stand-in closes it, and its sibling "invite" stand-in is the Fellow invite CTA.
vi.mock('@/components/celebration/AchievementCelebrationModal', () => ({
  AchievementCelebrationModal: ({
    celebration,
    onClose,
    onInvitePeers,
  }: {
    celebration: { notificationId: string; kind: string } | null
    onClose: () => void
    onInvitePeers?: (kind: string) => void
  }) => {
    lastInvite.fn = onInvitePeers ?? null
    return celebration ? (
      <>
        <div data-testid="celebration" data-notification-id={celebration.notificationId} onClick={onClose} />
        {onInvitePeers && <span data-testid="invite" onClick={() => onInvitePeers(celebration.kind)} />}
      </>
    ) : null
  },
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

const REFERRAL_LINK = 'https://prodily.example.test/signup?ref=JANE42'
const referralStats = (referralLink: string) => ({
  ok: true as const,
  data: { success: true, stats: { referralLink } },
  status: 200,
})

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
  api.apiGet.mockReset().mockResolvedValue(referralStats(REFERRAL_LINK))
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

// Growth R1 / Task 11: "Invite peers" on the Fellow celebration swaps it for the referral modal.
describe('AchievementCelebrationHost — invite peers', () => {
  const inviteStub = () => document.querySelector<HTMLElement>('[data-testid="invite"]')
  const referralModalShown = () => (document.body.textContent ?? '').includes('Your Personal Referral Link')
  const referralFetches = () => api.apiGet.mock.calls.filter(([path]) => path === '/api/referrals').length
  const controlByText = (text: string) =>
    Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) ?? null

  async function clickInvite() {
    const el = inviteStub()
    if (!el) throw new Error('no invite control is shown')
    await act(async () => {
      el.click()
    })
  }

  async function clickControl(text: string) {
    const el = controlByText(text)
    if (!el) throw new Error(`no "${text}" control`)
    await act(async () => {
      el.click()
    })
  }

  beforeEach(() => {
    api.apiPost.mockResolvedValueOnce(answer(fellow('ntf-fellow-1')))
  })

  it('fetches no referral link until the learner clicks invite', async () => {
    await render()
    expect(shown()).toBe('ntf-fellow-1')
    expect(referralFetches()).toBe(0)

    await clickInvite()
    expect(referralFetches()).toBe(1)
  })

  it('starts the flow once when invite is clicked twice', async () => {
    await render()
    const invite = lastInvite.fn
    await clickInvite()
    // The real dialog keeps its content clickable while it animates out.
    await act(async () => {
      invite?.('fellow')
    })

    expect(referralFetches()).toBe(1)
    expect(analytics.trackReferralModalOpened).toHaveBeenCalledTimes(1)
  })

  it('closes the celebration before the referral modal renders', async () => {
    const link = deferred<ReturnType<typeof referralStats>>()
    api.apiGet.mockReturnValueOnce(link.promise)
    await render()

    await clickInvite()
    // The link is still loading: neither dialog is on screen.
    expect(shown()).toBeNull()
    expect(referralModalShown()).toBe(false)

    await act(async () => {
      link.resolve(referralStats(REFERRAL_LINK))
    })
    expect(shown()).toBeNull()
    expect(referralModalShown()).toBe(true)
    expect(document.body.querySelector<HTMLInputElement>('input[readonly]')?.value).toBe(REFERRAL_LINK)
  })

  it('tracks referral_modal_opened once per open, with source fellow_celebration', async () => {
    const { redraw } = await render({ strict: true })
    await clickInvite()
    await redraw()

    expect(analytics.trackReferralModalOpened).toHaveBeenCalledTimes(1)
    expect(analytics.trackReferralModalOpened).toHaveBeenCalledWith('fellow_celebration')
  })

  it('reports the celebration kind as the source for a capstone invite', async () => {
    api.apiPost.mockReset().mockResolvedValueOnce(
      answer({
        kind: 'capstone',
        notificationId: 'ntf-capstone-1',
        portfolio,
        capstone: { moduleSlug: 'discovery', moduleTitle: 'Discovery' },
      }),
    )
    await render()
    await clickInvite()

    expect(analytics.trackReferralModalOpened).toHaveBeenCalledWith('capstone_celebration')
  })

  it('reports a copied link with channel fellow_celebration', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await render()
    await clickInvite()

    await clickControl('Copy')

    expect(writeText).toHaveBeenCalledWith(REFERRAL_LINK)
    expect(analytics.trackReferralLinkCopied).toHaveBeenCalledWith('fellow_celebration')
  })

  it('claims nothing while the referral modal is open, and resumes once it closes', async () => {
    const { setUnread } = await render()
    expect(claims()).toBe(1)
    await clickInvite()
    expect(referralModalShown()).toBe(true)

    await setUnread(3)
    expect(claims()).toBe(1)

    await clickControl('Done')
    expect(referralModalShown()).toBe(false)
    expect(claims()).toBe(2)
  })

  it.each([
    ['ok: false', () => Promise.resolve(failure)],
    ['a rejected request', () => Promise.reject(new Error('offline'))],
    ['a missing link', () => Promise.resolve(referralStats(''))],
  ])('neither opens nor crashes on %s', async (_label, respond) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    api.apiGet.mockImplementationOnce(respond)
    await render()

    await clickInvite()

    expect(referralModalShown()).toBe(false)
    expect(shown()).toBeNull()
    expect(analytics.trackReferralModalOpened).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
    // The flow ended, so the host is free to claim the next celebration.
    expect(claims()).toBe(2)
    consoleError.mockRestore()
  })
})
