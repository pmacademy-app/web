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
import type { WeeklyLeaderboardPayload } from '@/lib/leaderboard/leaderboard-db'

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

function you(): HTMLElement | null {
  return container.querySelector('[data-you="true"]')
}

/** The learner's rank as a sighted user sees it ("4", or "–" when unranked). */
function yourRank() {
  const el = you()?.querySelector('[data-rank]') as HTMLElement | null
  if (!el) return null
  const clone = el.cloneNode(true) as HTMLElement
  clone.querySelectorAll('.sr-only').forEach((n) => n.remove())
  return clone.textContent
}

/** The learner's rank as a screen reader announces it. */
function spokenRank() {
  const el = you()?.querySelector('[data-rank]') as HTMLElement | null
  if (!el) return null
  const clone = el.cloneNode(true) as HTMLElement
  clone.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove())
  return clone.textContent
}

/** Filled day dots in the learner's row. */
function yourDays() {
  return you()?.querySelector('[data-days]')?.getAttribute('data-days') ?? null
}

const ROWS = [
  { key: 'a', rank: 1, name: 'Meera Iyer', daysStudied: 5, isYou: false },
  { key: 'b', rank: 2, name: 'Daniel Okafor', daysStudied: 4, isYou: false },
  { key: 'c', rank: 3, name: 'Sofia Marquez', daysStudied: 4, isYou: false },
]

describe('DashboardLeaderboardWidget', () => {
  it('lists the top learners and then the learner as You', () => {
    render(<DashboardLeaderboardWidget rank={4} daysStudied={3} rows={ROWS} />)
    const names = Array.from(container.querySelectorAll('li')).map((li) => li.querySelectorAll('span')[2]?.textContent)
    expect(container.querySelectorAll('li')).toHaveLength(4)
    expect(container.textContent).toContain('Meera Iyer')
    expect(names.length).toBe(4)
    expect(you()?.textContent).toContain('You')
    expect(yourRank()).toBe('4')
    expect(yourDays()).toBe('3')
  })

  it('does not list the learner twice when they are in the top rows', () => {
    render(<DashboardLeaderboardWidget rank={1} daysStudied={5} rows={[{ ...ROWS[0], isYou: true, name: 'You' }, ROWS[1]]} />)
    expect(container.querySelectorAll('[data-you="true"]')).toHaveLength(1)
    expect(container.querySelectorAll('li')).toHaveLength(2)
  })

  it('announces days as "N of 7 days" and hides the dots from screen readers', () => {
    render(<DashboardLeaderboardWidget rank={3} daysStudied={4} />)
    const days = you()?.querySelector('[data-days]') as HTMLElement
    expect(days.querySelector('.sr-only')?.textContent).toBe('4 of 7 days')
    expect(days.querySelector('[aria-hidden="true"]')?.children).toHaveLength(7)
  })

  it.each([null, 0])('shows the learner as Unranked when rank is %s', (rank) => {
    render(<DashboardLeaderboardWidget rank={rank} daysStudied={0} />)
    expect(spokenRank()).toBe('Unranked')
    expect(yourRank()).toBe('–')
  })

  it('shows the nudge under an Unranked learner when a hint is given', () => {
    render(<DashboardLeaderboardWidget rank={null} daysStudied={0} hint={NO_ACTIVITY_HINT} />)
    expect(container.textContent).toContain('Complete a lesson this week to get ranked.')
  })

  it('does not show a hint for a ranked learner', () => {
    render(<DashboardLeaderboardWidget rank={2} daysStudied={3} hint={NO_ACTIVITY_HINT} />)
    expect(container.textContent).not.toContain(NO_ACTIVITY_HINT)
  })

  it.each([
    [-2, '0'],
    [9, '7'],
    [Number.NaN, '0'],
    [2.6, '2'],
  ])('clamps daysStudied %s to the 0–7 range', (days, expected) => {
    render(<DashboardLeaderboardWidget rank={1} daysStudied={days} />)
    expect(yourDays()).toBe(expected)
  })

  it('says how the list is ranked', () => {
    render(<DashboardLeaderboardWidget rank={1} daysStudied={2} />)
    expect(container.textContent).toContain('Ranked by days studied, then lessons')
  })

  it('titles the card with an h3', () => {
    render(<DashboardLeaderboardWidget rank={1} daysStudied={2} />)
    expect(container.querySelector('h3')?.textContent).toBe("This week's leaderboard")
    expect(container.querySelector('h1, h2')).toBeNull()
  })

  it('links "View all" to /leaderboard with screen-reader context', () => {
    render(<DashboardLeaderboardWidget rank={1} daysStudied={2} />)
    const link = container.querySelector('a')
    expect(link?.getAttribute('href')).toBe('/leaderboard')
    expect(link?.textContent).toBe('View all leaderboard')
    expect(link?.querySelector('.sr-only')?.textContent).toBe(' leaderboard')
  })

  it('shows an unavailable state with no numbers, keeping the heading and link', () => {
    render(<DashboardLeaderboardWidget unavailable />)
    expect(container.textContent).toContain('Leaderboard unavailable right now')
    expect(container.querySelector('h3')?.textContent).toBe("This week's leaderboard")
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/leaderboard')
    expect(container.querySelector('ol')).toBeNull()
    expect(container.textContent).not.toContain('Unranked')
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
    for (const cls of ['lg:w-[22rem]', 'lg:shrink-0']) {
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
    expect(yourRank()).toBe('4')
    expect(yourDays()).toBe('5')
  })

  it('renders nothing when the learner opted out', async () => {
    const element = await renderSlot(Promise.resolve(payload({ isOptedIn: false })))
    expect(element).toBeNull()
    expect(container.innerHTML).toBe('')
  })

  it('renders Unranked with the nudge, not a tie-break rank, when there is no activity this week', async () => {
    await renderSlot(Promise.resolve(payload({ personalEntry: { ...personalEntry, rank: 212, daysStudied: 0 } })))
    expect(spokenRank()).toBe('Unranked')
    expect(container.textContent).not.toContain('212')
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
