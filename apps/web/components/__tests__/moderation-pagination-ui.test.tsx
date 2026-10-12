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

const nav = vi.hoisted(() => ({ search: '', push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), redirect: vi.fn() }))
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
  redirect: nav.redirect,
}))
vi.mock('@/lib/api/client', () => ({ apiPost: vi.fn(), apiPatch: vi.fn() }))
vi.mock('@/components/admin/admin-toast', () => ({ useAdminToast: () => ({ toast: vi.fn() }) }))
vi.mock('@/components/admin/CapstoneReviewDrawer', () => ({
  CapstoneReviewDrawer: ({ capstone, isOpen }: { capstone: { capstoneTitle: string } | null; isOpen: boolean }) =>
    isOpen ? <div data-testid="drawer">{capstone ? capstone.capstoneTitle : 'missing'}</div> : null,
}))
// Base UI's drawer portals out of the test container; the views only need its content.
vi.mock('@/components/admin/AdminDrawer', () => ({
  AdminDrawer: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="admin-drawer">{children}</div> : null,
}))
vi.mock('@/lib/admin/feedback-service', () => ({
  FeedbackAdminService: {
    getModerationQueuePage: services.getModerationQueuePage,
    getPrivateFeedbackPage: services.getPrivateFeedbackPage,
  },
}))
vi.mock('@/lib/admin/moderation-service', async (importOriginal) => ({
  // The page uses the real URL helpers; only the database reads are replaced.
  ...(await importOriginal<typeof import('@/lib/admin/moderation-service')>()),
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
import type { TestimonialItem } from '@/lib/admin/feedback-service'
import type { AdminFeedbackItem } from '@/components/admin/FeedbackListView'
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

function testimonial(id: string, status: TestimonialItem['status'] = 'pending'): TestimonialItem {
  return {
    id,
    userId: `u-${id}`,
    authorName: `Author ${id}`,
    authorRole: 'Learner',
    sourceEvent: 'general',
    content: `Quote ${id}`,
    status,
    isPublished: false,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: '2026-04-01T00:00:00Z',
  }
}

function feedback(id: string, status = 'new'): AdminFeedbackItem {
  return {
    id,
    userId: `u-${id}`,
    authorName: `Author ${id}`,
    authorEmail: `${id}@example.test`,
    userExists: true,
    category: 'bug',
    sourceEvent: 'general',
    content: `Note ${id}`,
    rating: null,
    status,
    createdAt: '2026-04-01T00:00:00Z',
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
  // The real redirect() throws to stop the render; the mock does the same.
  nav.redirect.mockReset().mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`)
  })
  vi.mocked(apiPatch).mockReset()
  vi.mocked(apiPost).mockReset()
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

describe('moderation page: a page past the end', () => {
  it('redirects an emptied last page to the last page that has rows, keeping the filters', async () => {
    // 26 pending requests, the only one on page 2 was just approved.
    services.getQueuePage.mockResolvedValue(page([], { total: 25, page: 2 }))
    await expect(
      AdminModerationPage({ searchParams: Promise.resolve({ tab: 'fellow-requests', status: 'pending', page: '2' }) })
    ).rejects.toThrow('NEXT_REDIRECT')
    expect(nav.redirect).toHaveBeenCalledWith('/admin/moderation?tab=fellow-requests&status=pending')
    // The redirect target is computed from the total already read: no second query.
    expect(services.getQueuePage).toHaveBeenCalledTimes(1)
  })

  it('redirects a hand-typed page number on the portfolios tab, keeping the search', async () => {
    services.getPortfoliosPage.mockResolvedValue({
      ...page([], { total: 60, page: 99 }),
      counts: { all: 60, pending: 60, verified: 0 },
    })
    await expect(
      AdminModerationPage({ searchParams: Promise.resolve({ tab: 'portfolios', q: 'ada', page: '99' }) })
    ).rejects.toThrow('NEXT_REDIRECT')
    expect(nav.redirect).toHaveBeenCalledWith('/admin/moderation?tab=portfolios&q=ada&page=3')
  })

  it('renders the normal empty state on page 1 and for a list with no rows at all', async () => {
    services.getQueuePage.mockResolvedValue(page([]))
    const element = await AdminModerationPage({ searchParams: Promise.resolve({ tab: 'fellow-requests' }) })
    expect(nav.redirect).not.toHaveBeenCalled()
    act(() => root.render(element as React.ReactElement))
    expect(container.textContent).toContain('No Fellow requests found')
  })

  it('passes repeated search params to the views as plain strings', async () => {
    services.getPortfoliosPage.mockResolvedValue({ ...page([]), counts: { all: 0, pending: 0, verified: 0 } })
    const element = await AdminModerationPage({
      searchParams: Promise.resolve({ tab: 'portfolios', q: ['a', 'b'], status: ['all', 'verified'] }),
    })
    expect(services.getPortfoliosPage).toHaveBeenCalledWith({ status: null, page: null, q: null })
    const props = (element as React.ReactElement<{ q: unknown; status: unknown }>).props
    expect(props.q).toBe('')
    expect(props.status).toBeNull()
    // PortfoliosView calls q.trim(): it must render, not throw.
    act(() => root.render(element as React.ReactElement))
    expect(container.querySelector('input[aria-label="Search portfolios"]')).not.toBeNull()
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

  it('refreshes after approving a testimonial so it leaves the pending list', async () => {
    vi.mocked(apiPatch).mockResolvedValue({ ok: true, status: 200, data: { success: true } } as never)
    render({ tab: 'testimonials', list: page([testimonial('t1')]) }, { status: 'pending' })
    await act(async () => buttonByText('Approve').click())
    expect(apiPatch).toHaveBeenCalledWith('/api/admin/feedback/t1', { action: 'approve', updatedContent: undefined })
    expect(nav.refresh).toHaveBeenCalledTimes(1)
  })

  it('does not refresh when the testimonial action fails', async () => {
    vi.mocked(apiPatch).mockResolvedValue({ ok: false, error: { message: 'Nope' } } as never)
    render({ tab: 'testimonials', list: page([testimonial('t1')]) }, { status: 'pending' })
    await act(async () => buttonByText('Approve').click())
    expect(nav.refresh).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Quote t1')
  })

  it('re-seeds the testimonial list when the server sends a fresh page', async () => {
    vi.mocked(apiPatch).mockResolvedValue({ ok: true, status: 200, data: { success: true } } as never)
    render({ tab: 'testimonials', list: page([testimonial('t1'), testimonial('t2')], { total: 2 }) }, { status: 'pending' })
    await act(async () => buttonByText('Approve').click())
    // Same tab, status and page (same key), new rows: what router.refresh() delivers.
    render({ tab: 'testimonials', list: page([testimonial('t2')], { total: 1 }) }, { status: 'pending' })
    expect(container.textContent).not.toContain('Quote t1')
    expect(container.textContent).toContain('Quote t2')
    expect(container.textContent).not.toContain('APPROVED')
  })

  const openFeedback = (id: string) =>
    act(() => (container.querySelector(`[aria-label="Open feedback from Author ${id}"]`) as HTMLElement).click())

  it('refreshes after changing a product feedback status so a status-filtered list and total update', async () => {
    vi.mocked(apiPatch).mockResolvedValue({ ok: true, status: 200, data: { success: true } } as never)
    render({ tab: 'feedback', list: page([feedback('f1')]) }, { status: 'new' })
    openFeedback('f1')
    await act(async () => buttonByText('Resolved').click())
    expect(apiPatch).toHaveBeenCalledWith('/api/admin/feedback/f1', { action: 'update_status', status: 'resolved' })
    expect(nav.refresh).toHaveBeenCalledTimes(1)
  })

  it('does not refresh when the product feedback status change fails', async () => {
    vi.mocked(apiPatch).mockResolvedValue({ ok: false, error: { message: 'Nope' } } as never)
    render({ tab: 'feedback', list: page([feedback('f1')]) }, { status: 'new' })
    openFeedback('f1')
    await act(async () => buttonByText('Resolved').click())
    expect(nav.refresh).not.toHaveBeenCalled()
    expect(container.textContent).toContain('NEW')
  })

  it('re-seeds the product feedback list when the server sends a fresh page', async () => {
    vi.mocked(apiPatch).mockResolvedValue({ ok: true, status: 200, data: { success: true } } as never)
    render({ tab: 'feedback', list: page([feedback('f1'), feedback('f2')], { total: 2 }) }, { status: 'new' })
    openFeedback('f1')
    await act(async () => buttonByText('Resolved').click())
    // Same tab, status and page (same key), new rows: what router.refresh() delivers.
    render({ tab: 'feedback', list: page([feedback('f2')], { total: 1 }) }, { status: 'new' })
    expect(container.querySelector('[aria-label="Open feedback from Author f1"]')).toBeNull()
    expect(container.querySelector('[aria-label="Open feedback from Author f2"]')).not.toBeNull()
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

describe('moderation tabs: manual activation', () => {
  const tabs = () => Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
  const press = (el: HTMLElement, key: string) =>
    act(() => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    })

  it('arrow keys move focus without loading a tab or adding history', () => {
    render({ tab: 'testimonials', list: page([]) })
    const [first, second, third] = tabs()
    const last = tabs().at(-1)!
    first.focus()
    press(first, 'ArrowRight')
    expect(document.activeElement).toBe(second)
    press(second, 'ArrowRight')
    expect(document.activeElement).toBe(third)
    press(third, 'End')
    expect(document.activeElement).toBe(last)
    press(last, 'ArrowRight')
    expect(document.activeElement).toBe(first)
    press(first, 'ArrowLeft')
    expect(document.activeElement).toBe(last)
    press(last, 'Home')
    expect(document.activeElement).toBe(first)

    expect(nav.push).not.toHaveBeenCalled()
    expect(nav.replace).not.toHaveBeenCalled()
    // Focus moved, selection did not: the roving tabindex stays on the selected tab.
    expect(first.getAttribute('aria-selected')).toBe('true')
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1, -1, -1])
  })

  it('activating the focused tab (Enter and Space click a button) loads it once', () => {
    render({ tab: 'testimonials', list: page([]) })
    const [first, second] = tabs()
    first.focus()
    press(first, 'ArrowRight')
    act(() => second.click())
    expect(nav.push).toHaveBeenCalledTimes(1)
    expect(nav.push).toHaveBeenCalledWith('/admin/moderation?tab=feedback', { scroll: false })
  })

  it('points aria-controls only at the panel that exists', () => {
    render({ tab: 'capstones', list: page([]), capstone: null, capstoneFailed: false })
    const controlled = tabs().filter((t) => t.hasAttribute('aria-controls'))
    expect(controlled.length).toBe(1)
    expect(controlled[0].textContent).toContain('Capstones')
    const panel = document.getElementById(controlled[0].getAttribute('aria-controls')!)
    expect(panel?.getAttribute('role')).toBe('tabpanel')
  })

  it('does not call product feedback read-only: the drawer sets a status', () => {
    render({ tab: 'feedback', list: page([feedback('f1')]) })
    expect(container.textContent).not.toContain('read-only')
    expect(container.textContent).toContain('Open an item to mark it reviewed, planned, resolved or dismissed.')
  })
})

describe('moderation search and filter changes made while a navigation is loading', () => {
  const portfolios: ModerationListData = {
    tab: 'portfolios',
    list: { ...page([portfolio('1', false)]), counts: { all: 1, pending: 1, verified: 0 } },
  }
  const typeSearch = (text: string) => {
    const input = container.querySelector('input[aria-label="Search portfolios"]') as HTMLInputElement
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setValue.call(input, text)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  /** The most recent navigation, whether it was a push or a replace. */
  const lastNav = () => {
    const calls = [
      ...nav.push.mock.calls.map((c, i) => ({ url: c[0] as string, order: nav.push.mock.invocationCallOrder[i], kind: 'push' })),
      ...nav.replace.mock.calls.map((c, i) => ({
        url: c[0] as string,
        order: nav.replace.mock.invocationCallOrder[i],
        kind: 'replace',
      })),
    ]
    const last = calls.sort((a, b) => a.order - b.order).at(-1)!
    return { kind: last.kind, params: new URLSearchParams(last.url.split('?')[1]) }
  }

  it('keeps the status when the debounced search fires before the status navigation commits', () => {
    vi.useFakeTimers()
    nav.search = 'tab=portfolios'
    render(portfolios)
    typeSearch('ali')
    // One act: the status push is still pending (the URL snapshot has not changed) when the
    // search timer fires.
    act(() => {
      buttonByText('Verified0').click()
      vi.advanceTimersByTime(400)
    })
    const { kind, params } = lastNav()
    expect(params.get('status')).toBe('verified')
    expect(params.get('q')).toBe('ali')
    expect(params.get('tab')).toBe('portfolios')
    // The pending status change was a push; replacing over it would lose its history entry.
    expect(kind).toBe('push')
  })

  it('keeps the search when a status is chosen before the search navigation commits', () => {
    vi.useFakeTimers()
    nav.search = 'tab=portfolios'
    render(portfolios)
    typeSearch('ali')
    act(() => {
      vi.advanceTimersByTime(400)
      buttonByText('Verified0').click()
    })
    const { params } = lastNav()
    expect(params.get('status')).toBe('verified')
    expect(params.get('q')).toBe('ali')
  })

  it('drops a typed search instead of cancelling a tab change that is loading', () => {
    vi.useFakeTimers()
    nav.search = 'tab=portfolios'
    render(portfolios)
    typeSearch('ali')
    const tab = Array.from(container.querySelectorAll('[role="tab"]')).find((t) =>
      t.textContent?.includes('Capstones')
    ) as HTMLButtonElement
    act(() => {
      tab.click()
      vi.advanceTimersByTime(400)
    })
    expect(nav.replace).not.toHaveBeenCalled()
    expect(nav.push).toHaveBeenCalledTimes(1)
    expect(nav.push).toHaveBeenCalledWith('/admin/moderation?tab=capstones', { scroll: false })
  })

  it('builds from the URL again once the navigation has settled', () => {
    vi.useFakeTimers()
    nav.search = 'tab=portfolios&status=verified'
    render(portfolios, { status: 'verified' })
    act(() => buttonByText('All Public1').click())
    // The settled navigation asked for status=all, but the URL (as after Back) has no status.
    nav.search = 'tab=portfolios'
    render(portfolios)
    typeSearch('ali')
    act(() => {
      vi.advanceTimersByTime(400)
    })
    const { kind, params } = lastNav()
    expect(kind).toBe('replace')
    expect(params.get('q')).toBe('ali')
    expect(params.has('status')).toBe(false)
  })
})

describe('moderation views: accessible names and states', () => {
  it('names the Fellow decline reason and announces a failed review', async () => {
    vi.mocked(apiPatch).mockResolvedValue({ ok: false, error: { message: 'Portfolio must be public' } } as never)
    render({ tab: 'fellow-requests', list: page([fellowRequest('r1')]) })

    act(() => buttonByText('Decline').click())
    const reason = container.querySelector('input[placeholder="Reason (optional)"]')!
    expect(reason.getAttribute('aria-label')).toBe('Reason for declining Learner r1 (optional)')

    await act(async () => buttonByText('Confirm').click())
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Portfolio must be public')
  })

  it('names the testimonial edit button and its textarea', () => {
    render({ tab: 'testimonials', list: page([testimonial('t1')]) })
    const edit = container.querySelector('button[aria-label="Edit testimonial from Author t1"]') as HTMLButtonElement
    expect(edit).not.toBeNull()
    act(() => edit.click())
    expect(container.querySelector('textarea')!.getAttribute('aria-label')).toBe('Testimonial text from Author t1')
  })

  it('marks the pressed portfolio filter, and the KPI cards are not click targets', () => {
    nav.search = 'tab=portfolios&status=verified'
    render(
      {
        tab: 'portfolios',
        list: { ...page([portfolio('1', true)]), counts: { all: 3, pending: 2, verified: 1 } },
      },
      { status: 'verified' }
    )
    expect(buttonByText('Verified1').getAttribute('aria-pressed')).toBe('true')
    expect(buttonByText('Pending Verification2').getAttribute('aria-pressed')).toBe('false')
    expect(buttonByText('All Public3').getAttribute('aria-pressed')).toBe('false')

    const kpi = Array.from(container.querySelectorAll('div')).find(
      (d) => d.className.includes('rounded-xl') && d.textContent?.startsWith('Verified Fellows')
    ) as HTMLDivElement
    expect(kpi.className).not.toContain('cursor-pointer')
    act(() => kpi.click())
    expect(nav.push).not.toHaveBeenCalled()
  })
})
