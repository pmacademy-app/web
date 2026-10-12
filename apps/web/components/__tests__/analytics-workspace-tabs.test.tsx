/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { AdminAnalyticsWorkspaceData } from '@/lib/admin/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// The analytics tabs are links to a server-rendered page: the selected tab only changes when
// that render commits. A click must show at once which tab was chosen and that it is loading.

const nav = vi.hoisted(() => ({ search: '', push: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => '/admin/analytics',
}))

// Stands in for next/link's contract: `onNavigate` runs for an in-app navigation only (a plain
// click, not Ctrl/Cmd-click), and preventDefault() on it cancels the link's own navigation.
vi.mock('next/link', () => ({
  default: ({
    href,
    onNavigate,
    children,
    ...rest
  }: {
    href: string
    onNavigate?: (e: { preventDefault: () => void }) => void
    children: React.ReactNode
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      href={href}
      {...rest}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey) return
        e.preventDefault()
        onNavigate?.({ preventDefault: () => {} })
      }}
    >
      {children}
    </a>
  ),
}))

const stub = vi.hoisted(
  () => (name: string) =>
    function Stub() {
      return <div data-testid={name} />
    }
)
vi.mock('@/components/admin/AdminRangeSelector', () => ({ AdminRangeSelector: stub('range') }))
vi.mock('@/components/admin/AnalyticsOverviewTab', () => ({ AnalyticsOverviewTab: stub('overview') }))
vi.mock('@/components/admin/AnalyticsLearnersTab', () => ({ AnalyticsLearnersTab: stub('learners') }))
vi.mock('@/components/admin/AnalyticsLearningTab', () => ({ AnalyticsLearningTab: stub('learning') }))
vi.mock('@/components/admin/AnalyticsGrowthTab', () => ({ AnalyticsGrowthTab: stub('growth') }))
vi.mock('@/components/admin/charts-lazy', () => ({
  AnalyticsEngagementTabLazy: stub('engagement'),
  AnalyticsOutcomesTabLazy: stub('outcomes'),
}))

import { AnalyticsWorkspace } from '@/components/admin/AnalyticsWorkspace'

const data = (tab: string) =>
  ({
    tab,
    failed: false,
    range: { key: '30d', start: new Date('2026-09-01T00:00:00Z'), end: new Date('2026-10-01T00:00:00Z') },
  }) as unknown as AdminAnalyticsWorkspaceData

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  nav.search = ''
  nav.push.mockReset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const link = (label: string) =>
  Array.from(container.querySelectorAll('a')).find((a) => a.textContent?.trim() === label) as HTMLAnchorElement
const panel = () => container.querySelector('[aria-busy]') as HTMLElement

describe('AnalyticsWorkspace tabs', () => {
  it('links every tab to the current URL with only `tab` changed', () => {
    nav.search = 'tab=overview&range=30d'
    act(() => root.render(<AnalyticsWorkspace data={data('overview')} />))
    expect(link('Growth').getAttribute('href')).toBe('/admin/analytics?tab=growth&range=30d')
    expect(link('Overview').getAttribute('aria-current')).toBe('page')
    expect(link('Growth').hasAttribute('aria-current')).toBe(false)
    expect(panel().getAttribute('aria-busy')).toBe('false')
    expect(container.querySelector('[data-testid="overview"]')).not.toBeNull()
  })

  it('selects the clicked tab and marks the panel busy until the new tab loads', async () => {
    nav.search = 'tab=overview&range=30d'
    act(() => root.render(<AnalyticsWorkspace data={data('overview')} />))

    // Outside act, React commits the urgent pending state in a microtask and leaves the
    // transition render for a later task, so the pending UI is observable in between.
    const env = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    env.IS_REACT_ACT_ENVIRONMENT = false
    try {
      link('Growth').click()
      // One push, to the link's own href: one history entry, the range kept.
      expect(nav.push).toHaveBeenCalledTimes(1)
      expect(nav.push).toHaveBeenCalledWith('/admin/analytics?tab=growth&range=30d')
      await Promise.resolve()
      expect(link('Growth').getAttribute('aria-current')).toBe('page')
      expect(link('Overview').hasAttribute('aria-current')).toBe(false)
      expect(panel().getAttribute('aria-busy')).toBe('true')
      expect(panel().className).toContain('opacity-60')
      // The loaded tab stays on screen while the next one loads.
      expect(container.querySelector('[data-testid="overview"]')).not.toBeNull()
    } finally {
      env.IS_REACT_ACT_ENVIRONMENT = true
    }

    // The mocked navigation never changes the URL, so the selection settles back.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(panel().getAttribute('aria-busy')).toBe('false')
    expect(link('Overview').getAttribute('aria-current')).toBe('page')
  })

  it('follows the URL once the navigation commits (also Back and Forward)', () => {
    nav.search = 'tab=overview'
    act(() => root.render(<AnalyticsWorkspace data={data('overview')} />))
    nav.search = 'tab=growth'
    act(() => root.render(<AnalyticsWorkspace data={data('growth')} />))
    expect(link('Growth').getAttribute('aria-current')).toBe('page')
    expect(container.querySelector('[data-testid="growth"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="overview"]')).toBeNull()
    expect(nav.push).not.toHaveBeenCalled()
  })

  it('leaves a Ctrl/Cmd-click to the browser: no in-app navigation, no pending state', () => {
    act(() => root.render(<AnalyticsWorkspace data={data('overview')} />))
    // jsdom cannot open a tab; stop its own attempt to follow the link.
    const stopNavigation = (event: Event) => event.preventDefault()
    document.addEventListener('click', stopNavigation)
    act(() => {
      link('Growth').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }))
    })
    document.removeEventListener('click', stopNavigation)
    expect(nav.push).not.toHaveBeenCalled()
    expect(panel().getAttribute('aria-busy')).toBe('false')
  })
})
