/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Growth R5 / B11: the first-lesson celebration frames the portfolio and can hand off to the
// referral modal. The handoff never chains into Quick Start, which waits for the next session.

const analytics = vi.hoisted(() => ({
  trackFirstRewardCelebrated: vi.fn(),
  trackReferralModalOpened: vi.fn(),
  trackReferralLinkCopied: vi.fn(),
  trackReferralShared: vi.fn(),
}))
const swr = vi.hoisted(() => ({ keys: [] as Array<string | null>, data: undefined as unknown }))

vi.mock('@/lib/analytics', () => analytics)
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('@/lib/api/hooks', () => ({
  useApiQuery: (key: string | null) => {
    swr.keys.push(key)
    return { data: key ? swr.data : undefined }
  },
}))

import { FirstSessionCelebrationModal } from '@/components/celebration/FirstSessionCelebrationModal'
import { ReferralInviteLauncher } from '@/components/referral/ReferralInviteLauncher'
import {
  QUICK_START_PENDING_KEY,
  deferQuickStartToNextSession,
  shouldLaunchDeferredQuickStart,
} from '@/lib/quick-start/deferred-launch'

let container: HTMLDivElement
let root: Root

function render(node: React.ReactNode) {
  act(() => {
    root.render(node)
  })
}

const control = (text: string) =>
  Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) ?? null

beforeEach(() => {
  Object.values(analytics).forEach((fn) => fn.mockReset())
  swr.keys = []
  swr.data = undefined
  window.localStorage.clear()
  window.sessionStorage.clear()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('FirstSessionCelebrationModal', () => {
  it('frames the portfolio, and offers Invite a peer only when asked to', () => {
    const onInvitePeers = vi.fn()
    const onClose = vi.fn()
    render(<FirstSessionCelebrationModal isOpen onClose={onClose} lessonId="les_1" onInvitePeers={onInvitePeers} />)

    expect(document.body.querySelector('[data-testid="portfolio-teaser"]')?.textContent).toMatch(/public PM portfolio/)
    act(() => {
      control('Invite a peer')!.click()
    })
    expect(onInvitePeers).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows no invite control without onInvitePeers', () => {
    render(<FirstSessionCelebrationModal isOpen onClose={vi.fn()} lessonId="les_1" />)
    expect(control('Invite a peer')).toBeNull()
  })
})

describe('deferQuickStartToNextSession', () => {
  it('queues the tour but keeps it out of this session', () => {
    deferQuickStartToNextSession()

    expect(window.localStorage.getItem(QUICK_START_PENDING_KEY)).toBe('1')
    expect(shouldLaunchDeferredQuickStart({ pathname: '/dashboard', isOpen: false, completed: false })).toBe(false)

    // A new browser session (fresh sessionStorage) opens it.
    window.sessionStorage.clear()
    expect(shouldLaunchDeferredQuickStart({ pathname: '/dashboard', isOpen: false, completed: false })).toBe(true)
  })
})

describe('ReferralInviteLauncher', () => {
  const referralModal = () => (document.body.textContent ?? '').includes('Your Personal Referral Link')

  it('fetches nothing while closed, then opens with source first_lesson_celebration once the link loads', () => {
    render(<ReferralInviteLauncher open={false} onClose={vi.fn()} source="first_lesson_celebration" />)
    expect(swr.keys.every((key) => key === null)).toBe(true)

    swr.data = { success: true, stats: { referralLink: 'https://prodily.example/signup?ref=ada', rewardXp: 75 } }
    render(<ReferralInviteLauncher open onClose={vi.fn()} source="first_lesson_celebration" />)

    expect(swr.keys).toContain('/api/referrals')
    expect(referralModal()).toBe(true)
    expect(document.body.textContent).toContain('+75 XP')
    expect(analytics.trackReferralModalOpened).toHaveBeenCalledWith('first_lesson_celebration')
  })

  it('renders nothing until the link has loaded', () => {
    render(<ReferralInviteLauncher open onClose={vi.fn()} source="first_lesson_celebration" />)
    expect(referralModal()).toBe(false)
  })
})
