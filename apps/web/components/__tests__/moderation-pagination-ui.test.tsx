/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Admin R6 B7 (decision 5): the moderation lists are server-paged. The page loads only the
// active tab, the URL (tab, status, q, page, capstone) drives every list, and changing the
// tab, status or search resets to page 1. The views render the server page as-is.

const nav = vi.hoisted(() => ({ search: '', push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }))
const services = vi.hoisted(() => ({
  getModerationQueuePage: vi.fn(),
  getPrivateFeedbackPage: vi.fn(),
  getCapstonesPage: vi.fn(),
  getCapstoneById: vi.fn(),
  getPortfoliosPage: vi.fn(),
  getQueuePage: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace, refresh: nav.refresh, prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => '/admin/moderation',
}))
vi.mock('@/lib/api/client', () => ({ apiPost: vi.fn(), apiPatch: vi.fn() }))
vi.mock('@/components/admin/admin-toast', () => ({ useAdminToast: () => ({ toast: vi.fn() }) }))
vi.mock('@/components/admin/CapstoneReviewDrawer', () => ({
  CapstoneReviewDrawer: ({ capstone, isOpen }: { capstone: { capstoneTitle: string } | null; isOpen: boolean }) =>
    isOpen ? <div data-testid="drawer">{capstone ? capstone.capstoneTitle : 'missing'}</div> : null,
}))
vi.mock('@/lib/admin/feedback-service', () => ({
  FeedbackAdminService: {
    getModerationQueuePage: services.getModerationQueuePage,
    getPrivateFeedbackPage: services.getPrivateFeedbackPage,
  },
}))
vi.mock('@/lib/admin/moderation-service', () => ({
  ModerationService: {
    getCapstonesPage: services.getCapstonesPage,
    getCapstoneById: services.getCapstoneById,
    getPortfoliosPage: services.getPortfoliosPage,
  },
}))
vi.mock('@/lib/admin/fellow-request-service', () => ({
  FellowRequestAdminService: { getQueuePage: services.getQueuePage },
}))

import { ModerationWorkspace, type ModerationListData } from '@/components/admin/ModerationWorkspace'
import { apiPatch, apiPost } from '@/lib/api/client'
import type { AdminFellowRequestItem } from '@/lib/admin/fellow-request-service'
import AdminModerationPage from '@/app/admin/(console)/moderation/page'
import type { AdminCapstoneRow, AdminPortfolioRow } from '@/lib/admin/achievements-aggregation'

function capstone(id: string, status: string, title: string): AdminCapstoneRow {
  return {
    id,
    userId: `u-${id}`,
    learnerName: `Learner ${id}`,
    moduleSlug: 'mod',
    moduleTitle: 'Module',
    capstoneTitle: title,
    content: '',
    wordCount: 10,
    status,
    isPublic: false,
    submittedAt: '2026-01-01T00:00:00Z',
    reviewedAt: status === 'reviewed' ? '2026-01-02T00:00:00Z' : null,
    username: null,
    portfolioPublic: false,
    publicPath: null,
  }
}

function portfolio(id: string, isFellow: boolean): AdminPortfolioRow {
  return {
    userId: id,
    learnerName: `Person ${id}`,
    username: `p${id}`,
    email: `${id}@example.test`,
    avatarUrl: null,
    bio: null,
    isPublic: true,
    isFellow,
    capstoneCount: 1,
    joinedAt: '2026-01-01T00:00:00Z',
  }
}

function fellowRequest(id: string): AdminFellowRequestItem {
  return {
    id,
    userId: `u-${id}`,
    userName: `Learner ${id}`,
    username: `l${id}`,
    email: `${id}@example.test`,
    status: 'pending',
    requestedAt: '2026-04-01T00:00:00Z',
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: null,
    isEligible: true,
    isPortfolioPublic: true,
    readinessCompletedCount: 4,
    readinessTotalCount: 4,
    isFellow: false,
    history: [],
  }
}

const page = <T,>(items: T[], extra: Partial<{ total: number; page: number; failed: boolean }> = {}) => ({
  items,
  total: extra.total ?? items.length,
  page: extra.page ?? 1,
  pageSize: 25,
  failed: extra.failed ?? false,
})

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  nav.search = ''
  nav.push.mockReset()
  nav.replace.mockReset()
  nav.refresh.mockReset()
  Object.values(services).forEach((fn) => fn.mockReset())
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

function render(data: ModerationListData, opts: { status?: string | null; q?: string; capstone?: string | null } = {}) {
  act(() => {
    root.render(
      <ModerationWorkspace
        data={data}
        status={opts.status ?? null}
        q={opts.q ?? ''}
        selectedCapstoneId={opts.capstone ?? null}
      />
    )
  })
}

const buttonByText = (text: string) =>
  Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as HTMLButtonElement

const lastPushedParams = () => {
  const url = nav.push.mock.calls.at(-1)?.[0] as string
  return new URLSearchParams(url.split('?')[1])
}

describe('moderation page loads only the active tab', () => {
  it('loads the capstones page and the drawer capstone by id, passing URL params through', async () => {
    services.getCapstonesPage.mockResolvedValue(page([]))
    services.getCapstoneById.mockResolvedValue({ capstone: capstone('c9', 'submitted', 'Deep link'), failed: false })

    const element = await AdminModerationPage({
      searchParams: Promise.resolve({ tab: 'capstones', status: 'reviewed', page: '3', capstone: 'c9' }),
    })

    expect(services.getCapstonesPage).toHaveBeenCalledWith({ status: 'reviewed', page: '3' })
    expect(services.getCapstoneById).toHaveBeenCalledWith('c9')
    expect(services.getModerationQueuePage).not.toHaveBeenCalled()
    expect(services.getPrivateFeedbackPage).not.toHaveBeenCalled()
    expect(services.getPortfoliosPage).not.toHaveBeenCalled()
    expect(services.getQueuePage).not.toHaveBeenCalled()
    const props = (element as React.ReactElement<{ data: ModerationListData }>).props
    expect(props.data.tab).toBe('capstones')
    expect(props.data.tab === 'capstones' && props.data.capstone?.capstoneTitle).toBe('Deep link')
  })

  it('defaults to testimonials and leaves the status default to the service', async () => {
    services.getModerationQueuePage.mockResolvedValue(page([]))
    await AdminModerationPage({ searchParams: Promise.resolve({ tab: 'nope' }) })
    expect(services.getModerationQueuePage).toHaveBeenCalledWith({ status: null, page: null })
    expect(services.getCapstonesPage).not.toHaveBeenCalled()
  })

  it('passes the search to the portfolios page', async () => {
    services.getPortfoliosPage.mockResolvedValue({ ...page([]), counts: { all: 0, pending: 0, verified: 0 } })
    await AdminModerationPage({ searchParams: Promise.resolve({ tab: 'portfolios', q: 'ada' }) })
    expect(services.getPortfoliosPage).toHaveBeenCalledWith({ status: null, page: null, q: 'ada' })
  })
})

describe('ModerationWorkspace URL-driven paging', () => {
  it('renders the server page as-is, without client filtering or re-sorting', () => {
    render(
      {
        tab: 'capstones',
        list: page([capstone('a', 'reviewed', 'First'), capstone('b', 'submitted', 'Second')]),
        capstone: null,
        capstoneFailed: false,
      },
      { status: 'submitted' }
    )
    const text = container.textContent ?? ''
    expect(text).toContain('First')
    expect(text).toContain('Second')
    expect(text.indexOf('First')).toBeLessThan(text.indexOf('Second'))
  })

  it('shows pagination and keeps the filter when changing page', () => {
    nav.search = 'tab=capstones&status=reviewed&page=2'
    render(
      {
        tab: 'capstones',
        list: page([capstone('a', 'reviewed', 'Row')], { total: 60, page: 2 }),
        capstone: null,
        capstoneFailed: false,
      },
      { status: 'reviewed' }
    )
    expect(container.querySelector('nav[aria-label="Pagination"]')).not.toBeNull()
    expect(container.textContent).toContain('26–50 of 60')

    act(() => buttonByText('3').click())
    const params = lastPushedParams()
    expect(params.get('page')).toBe('3')
    expect(params.get('status')).toBe('reviewed')
    expect(params.get('tab')).toBe('capstones')

    act(() => buttonByText('1').click())
    expect(lastPushedParams().has('page')).toBe(false)
  })

  it('resets to page 1 when the status changes', () => {
    nav.search = 'tab=capstones&page=2'
    render({
      tab: 'capstones',
      list: page([capstone('a', 'reviewed', 'Row')], { total: 60, page: 2 }),
      capstone: null,
      capstoneFailed: false,
    })
    act(() => buttonByText('reviewed').click())
    const params = lastPushedParams()
    expect(params.get('status')).toBe('reviewed')
    expect(params.has('page')).toBe(false)
  })

  it('opening a capstone keeps the page, and the drawer shows the fetched capstone', () => {
    nav.search = 'tab=capstones&page=2'
    render(
      {
        tab: 'capstones',
        list: page([capstone('a', 'reviewed', 'Row')], { total: 60, page: 2 }),
        capstone: capstone('zz', 'submitted', 'Off-page capstone'),
        capstoneFailed: false,
      },
      { capstone: 'zz' }
    )
    expect(container.querySelector('[data-testid="drawer"]')?.textContent).toBe('Off-page capstone')
  })

  it('resets status, search and page when the tab changes', () => {
    nav.search = 'tab=capstones&status=reviewed&page=2&capstone=a'
    render({ tab: 'capstones', list: page([], { total: 60, page: 2 }), capstone: null, capstoneFailed: false })
    const tab = Array.from(container.querySelectorAll('[role="tab"]')).find((t) =>
      t.textContent?.includes('Fellow Requests')
    ) as HTMLButtonElement
    act(() => tab.click())
    expect(nav.push.mock.calls.at(-1)?.[0]).toBe('/admin/moderation?tab=fellow-requests')
  })

  it('hides pagination when everything fits on one page', () => {
    render({ tab: 'fellow-requests', list: page([]) })
    expect(container.querySelector('nav[aria-label="Pagination"]')).toBeNull()
  })

  it('shows a load warning when the list failed', () => {
    render({ tab: 'testimonials', list: page([], { failed: true }) })
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('could not be loaded')
  })

  it('uses the server counts for the portfolio KPIs and searches on the server', () => {
    vi.useFakeTimers()
    nav.search = 'tab=portfolios&page=3'
    render({
      tab: 'portfolios',
      list: { ...page([portfolio('1', false)], { total: 80, page: 3 }), counts: { all: 80, pending: 70, verified: 10 } },
    })
    const text = container.textContent ?? ''
    expect(text).toContain('70')
    expect(text).toContain('80')
    expect(nav.push).not.toHaveBeenCalled()

    const input = container.querySelector('input[aria-label="Search portfolios"]') as HTMLInputElement
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setValue.call(input, 'ada')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(nav.push).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(400)
    })
    // The search replaces the history entry instead of pushing one per pause.
    expect(nav.push).not.toHaveBeenCalled()
    expect(nav.replace).toHaveBeenCalledTimes(1)
    const params = new URLSearchParams((nav.replace.mock.calls[0][0] as string).split('?')[1])
    expect(params.get('q')).toBe('ada')
    expect(params.has('page')).toBe(false)
  })

  it('follows the URL when q changes from outside (Back) instead of re-sending the old search', () => {
    vi.useFakeTimers()
    nav.search = 'tab=portfolios&q=ada'
    const data: ModerationListData = {
      tab: 'portfolios',
      list: { ...page([portfolio('1', false)]), counts: { all: 1, pending: 1, verified: 0 } },
    }
    render(data, { q: 'ada' })
    const input = container.querySelector('input[aria-label="Search portfolios"]') as HTMLInputElement
    expect(input.value).toBe('ada')

    nav.search = 'tab=portfolios'
    render(data, { q: '' })
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(input.value).toBe('')
    expect(nav.push).not.toHaveBeenCalled()
    expect(nav.replace).not.toHaveBeenCalled()
    // Same element: the box was not remounted, so focus behaviour is unchanged.
    expect(container.querySelector('input[aria-label="Search portfolios"]')).toBe(input)
  })

  it('selects the target tab and marks the panel busy while the tab change is pending', async () => {
    render({ tab: 'capstones', list: page([]), capstone: null, capstoneFailed: false })
    const panel = () => container.querySelector('[role="tabpanel"]')!
    const tab = (label: string) =>
      Array.from(container.querySelectorAll('[role="tab"]')).find((t) => t.textContent?.includes(label))!
    expect(panel().getAttribute('aria-busy')).toBe('false')

    // Outside act, React commits the urgent pending state in a microtask and leaves the
    // transition render for a later task, so the pending UI is observable in between.
    const env = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    env.IS_REACT_ACT_ENVIRONMENT = false
    try {
      ;(tab('Fellow Requests') as HTMLButtonElement).click()
      expect(nav.push).toHaveBeenCalledWith('/admin/moderation?tab=fellow-requests', { scroll: false })
      await Promise.resolve()
      expect(panel().getAttribute('aria-busy')).toBe('true')
      expect(panel().className).toContain('opacity-60')
      expect(tab('Fellow Requests').getAttribute('aria-selected')).toBe('true')
      expect(tab('Capstones').getAttribute('aria-selected')).toBe('false')
    } finally {
      env.IS_REACT_ACT_ENVIRONMENT = true
    }
    // The mocked navigation never changes `data`, so once the transition settles the
    // server's tab is selected again and the panel is no longer busy.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(panel().getAttribute('aria-busy')).toBe('false')
    expect(tab('Capstones').getAttribute('aria-selected')).toBe('true')
  })
})

describe('moderation mutations refetch the server page', () => {
  it('refreshes after approving a Fellow request so the status-filtered list and total update', async () => {
    vi.mocked(apiPatch).mockResolvedValue({ ok: true, status: 200, data: { success: true } } as never)
    render({ tab: 'fellow-requests', list: page([fellowRequest('r1')]) })
    await act(async () => buttonByText('Approve').click())
    expect(apiPatch).toHaveBeenCalledWith('/api/admin/fellow-requests/r1', { decision: 'approved', rejectionReason: undefined })
    expect(nav.refresh).toHaveBeenCalledTimes(1)
  })

  it('does not refresh when the review fails', async () => {
    vi.mocked(apiPatch).mockResolvedValue({ ok: false, error: { message: 'Nope' } } as never)
    render({ tab: 'fellow-requests', list: page([fellowRequest('r1')]) })
    await act(async () => buttonByText('Approve').click())
    expect(nav.refresh).not.toHaveBeenCalled()
  })

  it('says "declined", not "rejected", in the Fellow request filters', () => {
    render({ tab: 'fellow-requests', list: page([fellowRequest('r1')]) })
    expect(buttonByText('declined')).toBeTruthy()
    expect(buttonByText('rejected')).toBeUndefined()
    expect(buttonByText('Decline')).toBeTruthy()
  })

  it('refreshes after verifying a portfolio', async () => {
    vi.mocked(apiPost).mockResolvedValue({ ok: true, status: 200, data: { success: true } } as never)
    render({
      tab: 'portfolios',
      list: { ...page([portfolio('1', false)]), counts: { all: 1, pending: 1, verified: 0 } },
    })
    await act(async () => buttonByText('Verify').click())
    expect(apiPost).toHaveBeenCalledWith('/api/admin/users/1/fellow-status', { isFellow: true })
    expect(nav.refresh).toHaveBeenCalledTimes(1)
  })
})
