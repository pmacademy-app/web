/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Growth R4 / A6–A8: the proof card's lower row. Fellow is a distinction, never a credential;
// the referral link is fetched only after "Invite peers" is clicked.

const analytics = vi.hoisted(() => ({
  trackDashboardProofCardClicked: vi.fn(),
  trackReferralModalOpened: vi.fn(),
  trackReferralLinkCopied: vi.fn(),
  trackReferralShared: vi.fn(),
}))
/**
 * Stands in for SWR: records each key and returns whatever the test set for it. Like SWR, a
 * result (including an error) stays cached for the key across key flips.
 */
const swr = vi.hoisted(() => ({
  keys: [] as Array<string | null>,
  result: {} as { data?: unknown; error?: unknown; isLoading?: boolean },
  mutate: vi.fn(),
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('@/lib/analytics', () => analytics)
vi.mock('@/lib/api/hooks', () => ({
  useApiQuery: (key: string | null) => {
    swr.keys.push(key)
    return key ? { ...swr.result, mutate: swr.mutate } : { data: undefined, error: undefined, isLoading: false, mutate: swr.mutate }
  },
}))

import { ProofExtrasRow, type ProofExtras } from '@/components/dashboard/ProofExtrasRow'
import type { FellowSummary } from '@/lib/dashboard/proof-extras'

const LINK = 'https://prodily.example.test/signup?ref=JANE42'
const base: ProofExtras = {
  fellow: { state: 'not_eligible', readinessPercent: 57 },
  badges: { earned: 3, total: 10, latestName: 'Module Master' },
  level: { level: 2, title: 'Junior PM', xpRemaining: 120, isMaxLevel: false },
}

let container: HTMLDivElement
let root: Root

async function render(extras: ProofExtras = base) {
  await act(async () => {
    root.render(<ProofExtrasRow extras={extras} portfolioState="public" />)
  })
}

const cell = (id: string) => document.querySelector<HTMLElement>(`[data-testid="proof-extras-${id}"]`)
const linkIn = (el: HTMLElement | null) => el?.querySelector('a') ?? null
const control = (text: string) =>
  Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) ?? null

async function click(el: Element | null) {
  if (!el) throw new Error('element not found')
  const stop = (event: Event) => event.preventDefault()
  document.addEventListener('click', stop)
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  document.removeEventListener('click', stop)
}

beforeEach(() => {
  Object.values(analytics).forEach((fn) => fn.mockReset())
  swr.keys = []
  swr.result = {}
  swr.mutate.mockReset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('ProofExtrasRow — PM Fellow', () => {
  it.each<[FellowSummary['state'], RegExp, string | null, string | null]>([
    ['not_eligible', /57% ready for PM Fellow/, 'See checklist', 'view_fellow_readiness'],
    ['rejected', /57% ready\. Strengthen it to request again/, 'See checklist', 'view_fellow_readiness'],
    ['eligible', /You qualify for PM Fellow/, 'Request Fellow', 'request_fellow'],
    ['pending', /Fellow request under review/, 'View request', 'view_fellow_readiness'],
    ['approved', /You're a PM Fellow/, null, null],
  ])('%s', async (state, text, cta, action) => {
    await render({ ...base, fellow: { state, readinessPercent: 57 } })
    const fellow = cell('fellow')

    expect(fellow?.textContent).toMatch(text)
    expect(fellow?.outerHTML).not.toMatch(/certif|credential/i)
    if (cta) {
      expect(linkIn(fellow)?.textContent).toContain(cta)
      expect(linkIn(fellow)?.getAttribute('href')).toBe('/settings?tab=portfolio')
      await click(linkIn(fellow))
      expect(analytics.trackDashboardProofCardClicked).toHaveBeenCalledWith(action, 'public')
    } else {
      expect(linkIn(fellow)).toBeNull()
    }
  })
})

describe('ProofExtrasRow — badges and level', () => {
  it('shows the earned count and latest badge, linking to /badges', async () => {
    await render()
    expect(cell('badges')?.textContent).toContain('3 of 10 earned')
    expect(cell('badges')?.textContent).toContain('Latest: Module Master')
    expect(linkIn(cell('badges'))?.getAttribute('href')).toBe('/badges')
    expect(linkIn(cell('level'))?.getAttribute('href')).toBe('/progress/radar')
  })

  it('shows level and XP to go, or the top level', async () => {
    await render()
    expect(cell('level')?.textContent).toContain('Level 2 · Junior PM')
    expect(cell('level')?.textContent).toContain('120 XP to the next level')

    await render({ ...base, level: { level: 9, title: 'Chief Product Officer', xpRemaining: 0, isMaxLevel: true } })
    expect(cell('level')?.textContent).toContain('Top level reached')
  })

  it('hides any cell whose data could not be loaded', async () => {
    await render({ fellow: null, badges: null, level: null })
    expect(cell('fellow')).toBeNull()
    expect(cell('badges')).toBeNull()
    expect(cell('level')).toBeNull()
    expect(control('Invite peers')).not.toBeNull()
  })
})

describe('ProofExtrasRow — invite peers', () => {
  const referralModal = () => (document.body.textContent ?? '').includes('Your Personal Referral Link')

  it('requests no referral link until the click', async () => {
    await render()
    expect(swr.keys.every((key) => key === null)).toBe(true)

    swr.result = { data: { success: true, stats: { referralLink: LINK } } }
    await click(control('Invite peers'))

    expect(swr.keys).toContain('/api/referrals')
    expect(analytics.trackDashboardProofCardClicked).toHaveBeenCalledWith('invite_peers', 'public')
  })

  it('opens the referral modal with source dashboard once the link loads', async () => {
    swr.result = { data: { success: true, stats: { referralLink: LINK } } }
    await render()
    await click(control('Invite peers'))

    expect(referralModal()).toBe(true)
    expect(analytics.trackReferralModalOpened).toHaveBeenCalledWith('dashboard')
  })

  it('shows the failure inline and retries with mutate, then opens once the link loads', async () => {
    swr.result = { error: new Error('offline') }
    await render()
    await click(control('Invite peers'))

    expect(referralModal()).toBe(false)
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toContain("Couldn't load your invite link")

    await click(control('Try again'))
    expect(swr.mutate).toHaveBeenCalledTimes(1)

    // The refetch succeeded: SWR re-renders with data (the stale error may still be cached).
    swr.result = { data: { success: true, stats: { referralLink: LINK } }, error: new Error('offline') }
    await render()
    expect(referralModal()).toBe(true)
  })

  it('keeps an open modal open when a background refetch fails', async () => {
    swr.result = { data: { success: true, stats: { referralLink: LINK } } }
    await render()
    await click(control('Invite peers'))
    expect(referralModal()).toBe(true)

    swr.result = { data: { success: true, stats: { referralLink: LINK } }, error: new Error('offline') }
    await render()
    expect(referralModal()).toBe(true)
  })

  it('states the referral reward the service actually awards', async () => {
    await render()
    expect(document.body.textContent).toContain('Earn +50 XP when a peer you invite finishes their first lesson')
  })
})
