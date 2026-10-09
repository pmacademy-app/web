/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// The global setup mocks `next/link` as children-only, which drops href. Render a real anchor.
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

import {
  DashboardLeaderboardWidget,
  LeaderboardWidgetSkeleton,
  clampDaysStudied,
} from '@/components/dashboard/DashboardLeaderboardWidget'
import { LeaderboardWidgetSlot } from '@/app/(app)/dashboard/LeaderboardWidgetSlot'
import { NO_ACTIVITY_HINT } from '@/lib/dashboard/leaderboard-widget'
import type { WeeklyLeaderboardPayload } from '@/lib/leaderboard-db'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function render(node: React.ReactNode) {
  act(() => {
    root.render(node)
  })
}

function valueFor(term: string): HTMLElement | null {
  const dt = Array.from(container.querySelectorAll('dt')).find((el) => el.textContent === term)
  return (dt?.nextElementSibling as HTMLElement | null) ?? null
}

/** The text a sighted user sees (drops sr-only spans). */
function visibleText(el: HTMLElement | null) {
  if (!el) return null
  const clone = el.cloneNode(true) as HTMLElement
  clone.querySelectorAll('.sr-only').forEach((n) => n.remove())
  return clone.textContent
}

/** The text a screen reader announces (drops aria-hidden spans). */
function spokenText(el: HTMLElement | null) {
  if (!el) return null
  const clone = el.cloneNode(true) as HTMLElement
  clone.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove())
  return clone.textContent
}

describe('DashboardLeaderboardWidget', () => {
  it('shows the weekly rank as #N', () => {
    render(<DashboardLeaderboardWidget rank={3} daysStudied={4} />)
    expect(valueFor('Weekly Rank')?.textContent).toBe('#3')
    expect(visibleText(valueFor('Days Studied'))).toBe('4 / 7')
  })

  it('announces days as "N of 7" and hides the visual slash from screen readers', () => {
    render(<DashboardLeaderboardWidget rank={3} daysStudied={4} />)
    expect(spokenText(valueFor('Days Studied'))).toBe('4 of 7')
  })

  it.each([null, 0])('shows "Unranked" when rank is %s', (rank) => {
    render(<DashboardLeaderboardWidget rank={rank} daysStudied={0} />)
    expect(valueFor('Weekly Rank')?.textContent).toBe('Unranked')
    expect(container.textContent).not.toContain('#')
  })

  it('shows the nudge under "Unranked" when a hint is given', () => {
    render(<DashboardLeaderboardWidget rank={null} daysStudied={0} hint={NO_ACTIVITY_HINT} />)
    expect(container.textContent).toContain('Complete a lesson this week to get ranked.')
  })

  it('does not show a hint for a ranked learner', () => {
    render(<DashboardLeaderboardWidget rank={2} daysStudied={3} hint={NO_ACTIVITY_HINT} />)
    expect(container.textContent).not.toContain(NO_ACTIVITY_HINT)
  })

  it.each([
    [-2, '0 / 7'],
    [9, '7 / 7'],
    [Number.NaN, '0 / 7'],
    [2.6, '2 / 7'],
  ])('clamps daysStudied %s to the 0–7 range', (days, expected) => {
    render(<DashboardLeaderboardWidget rank={1} daysStudied={days} />)
    expect(visibleText(valueFor('Days Studied'))).toBe(expected)
  })

  it('clarifies what "Days Studied" counts', () => {
    render(<DashboardLeaderboardWidget rank={1} daysStudied={2} />)
    expect(container.textContent).toContain('days you completed a lesson this week')
  })

  it('titles the card with an h3', () => {
    render(<DashboardLeaderboardWidget rank={1} daysStudied={2} />)
    expect(container.querySelector('h3')?.textContent).toBe('Weekly Leaderboard')
    expect(container.querySelector('h1, h2')).toBeNull()
  })

  it('links "View All" to /leaderboard with screen-reader context', () => {
    render(<DashboardLeaderboardWidget rank={1} daysStudied={2} />)
    const link = container.querySelector('a')
    expect(link?.getAttribute('href')).toBe('/leaderboard')
    expect(link?.textContent).toBe('View All leaderboard')
    expect(link?.querySelector('.sr-only')?.textContent).toBe(' leaderboard')
  })

  it('hides decorative icons from assistive tech', () => {
    render(<DashboardLeaderboardWidget rank={1} daysStudied={2} />)
    const icons = Array.from(container.querySelectorAll('svg'))
    expect(icons.length).toBeGreaterThan(0)
    for (const icon of icons) expect(icon.getAttribute('aria-hidden')).toBe('true')
  })

  it('shows an unavailable state with no numbers, keeping the heading and link', () => {
    render(<DashboardLeaderboardWidget unavailable />)
    expect(container.textContent).toContain('Leaderboard unavailable right now')
    expect(container.querySelector('h3')?.textContent).toBe('Weekly Leaderboard')
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/leaderboard')
    expect(container.querySelector('dl')).toBeNull()
    expect(container.textContent).not.toContain('Unranked')
    expect(container.textContent).not.toMatch(/\d\s*\/\s*7/)
  })
})

describe('clampDaysStudied', () => {
  it('keeps whole days within a week', () => {
    expect(clampDaysStudied(0)).toBe(0)
    expect(clampDaysStudied(7)).toBe(7)
    expect(clampDaysStudied(8)).toBe(7)
    expect(clampDaysStudied(-1)).toBe(0)
    expect(clampDaysStudied(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('LeaderboardWidgetSkeleton', () => {
  it('is hidden from assistive tech and respects reduced motion', () => {
    render(<LeaderboardWidgetSkeleton />)
    const skeleton = container.querySelector('[data-testid="leaderboard-widget-skeleton"]')
    expect(skeleton?.getAttribute('aria-hidden')).toBe('true')
    const pulses = container.querySelectorAll('.animate-pulse')
    expect(pulses.length).toBeGreaterThan(0)
    for (const el of Array.from(pulses)) expect(el.className).toContain('motion-reduce:animate-none')
  })

  it('reserves the same column width as the widget', () => {
    render(<LeaderboardWidgetSkeleton />)
    const skeletonClass = container.firstElementChild?.className ?? ''
    act(() => root.render(<DashboardLeaderboardWidget rank={1} daysStudied={1} />))
    const widgetClass = container.firstElementChild?.className ?? ''
    for (const cls of ['md:w-[calc((100%_-_3rem)/3)]', 'md:shrink-0']) {
      expect(skeletonClass.split(' ')).toContain(cls)
      expect(widgetClass.split(' ')).toContain(cls)
    }
  })
})

describe('LeaderboardWidgetSlot', () => {
  const personalEntry = {
    userId: 'user-1',
    username: 'learner',
    name: 'Learner',
    avatarUrl: null,
    levelTitle: 'Associate',
    level: 2,
    daysStudied: 5,
    lessonsCompleted: 6,
    xpEarned: 120,
    currentStreak: 5,
    rank: 4,
    positionChange: 0,
    isCurrentUser: true,
  }

  function payload(overrides: Partial<WeeklyLeaderboardPayload> = {}): WeeklyLeaderboardPayload {
    return { weekStart: '2026-10-05', isOptedIn: true, entries: [personalEntry], personalEntry, ...overrides }
  }

  async function renderSlot(payloadPromise: Promise<WeeklyLeaderboardPayload | null>) {
    const element = await LeaderboardWidgetSlot({ payloadPromise })
    render(element)
    return element
  }

  it('renders the learner rank and days from the weekly payload', async () => {
    await renderSlot(Promise.resolve(payload()))
    expect(valueFor('Weekly Rank')?.textContent).toBe('#4')
    expect(visibleText(valueFor('Days Studied'))).toBe('5 / 7')
  })

  it('renders nothing when the learner opted out', async () => {
    const element = await renderSlot(Promise.resolve(payload({ isOptedIn: false })))
    expect(element).toBeNull()
    expect(container.innerHTML).toBe('')
  })

  it('renders Unranked with the nudge, not a tie-break rank, when there is no activity this week', async () => {
    await renderSlot(Promise.resolve(payload({ personalEntry: { ...personalEntry, rank: 212, daysStudied: 0 } })))
    expect(valueFor('Weekly Rank')?.textContent).toBe('Unranked')
    expect(container.textContent).not.toContain('#212')
    expect(container.textContent).toContain(NO_ACTIVITY_HINT)
  })

  it('renders the unavailable state when the payload promise resolves null (load failed)', async () => {
    await renderSlot(Promise.resolve(null))
    expect(container.textContent).toContain('Leaderboard unavailable right now')
    expect(container.textContent).not.toContain('Unranked')
  })

  it('renders the unavailable state, not Unranked, when the payload is degraded', async () => {
    await renderSlot(
      Promise.resolve(payload({ degraded: true, personalEntry: { ...personalEntry, rank: 212, daysStudied: 0 } })),
    )
    expect(container.textContent).toContain('Leaderboard unavailable right now')
    expect(container.textContent).not.toContain('Unranked')
    expect(container.textContent).not.toMatch(/\d\s*\/\s*7/)
  })

  it('renders nothing for an opted-out learner even when the payload is degraded', async () => {
    const element = await renderSlot(Promise.resolve(payload({ isOptedIn: false, degraded: true })))
    expect(element).toBeNull()
    expect(container.innerHTML).toBe('')
  })

  it('renders the unavailable state, never throwing, when the payload promise rejects', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    await renderSlot(Promise.reject(new Error('opt-out lookup failed')))
    expect(container.textContent).toContain('Leaderboard unavailable right now')
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
