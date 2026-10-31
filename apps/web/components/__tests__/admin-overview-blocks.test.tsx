/**
 * @vitest-environment jsdom
 */

import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const { loaders, apiPost, refresh, toast } = vi.hoisted(() => ({
  loaders: {
    loadDashboardKpis: vi.fn(),
    loadDashboardVerifiedUsers: vi.fn(),
    loadDashboardSeries: vi.fn(),
    loadDashboardFunnel: vi.fn(),
    loadDashboardAttention: vi.fn(),
    loadDashboardRecentActivity: vi.fn(),
    loadDashboardSystemSnapshot: vi.fn(),
  },
  apiPost: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/lib/admin/dashboard-service', () => loaders)
vi.mock('@/lib/api/client', () => ({ apiPost }))
vi.mock('@/components/admin/admin-toast', () => ({ useAdminToast: () => ({ toast }) }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}))

function stub(name: string) {
  return function Stub(props: Record<string, unknown>) {
    const items = (props.items ?? props.stages ?? props.data) as unknown[] | undefined
    return <div data-testid={name} data-count={items?.length ?? 0} />
  }
}

vi.mock('@/components/admin/AdminAttentionCenter', () => ({ AdminAttentionCenter: stub('attention') }))
vi.mock('@/components/admin/AdminFunnelChart', () => ({ AdminFunnelChart: stub('funnel') }))
vi.mock('@/components/admin/AdminRecentActivityList', () => ({ AdminRecentActivityList: stub('recent') }))
vi.mock('@/components/admin/AdminSystemSnapshot', () => ({ AdminSystemSnapshot: stub('snapshot') }))
vi.mock('@/components/admin/charts-lazy', () => ({
  AdminLearnerActivityChartLazy: stub('learner-chart'),
  AdminLearningActivityChartLazy: stub('learning-chart'),
}))
vi.mock('@/components/admin/AdminLoadWarning', () => ({
  AdminLoadWarning: ({ message }: { message: string }) => <div role="alert">{message}</div>,
}))

import { OverviewAttention } from '@/components/admin/overview/OverviewAttention'
import { OverviewKpis, OverviewVerifiedUsersKpi } from '@/components/admin/overview/OverviewKpis'
import { OverviewCharts } from '@/components/admin/overview/OverviewCharts'
import { OverviewFunnel } from '@/components/admin/overview/OverviewFunnel'
import { OverviewRecentActivity } from '@/components/admin/overview/OverviewRecentActivity'
import { OverviewSystemSnapshot } from '@/components/admin/overview/OverviewSystemSnapshot'
import { AdminDashboardRefreshButton } from '@/components/admin/AdminDashboardRefreshButton'

const RANGE = { rangeKey: '7d' as const, from: null, to: null }
const KPIS = {
  totalUsers: 1234,
  activeLearners: 5,
  newUsers: 3,
  verifiedUsers: 2,
  lessonsCompleted: 9,
  courseCompletionPct: 12,
  xpEarned: 400,
  certificatesIssued: 1,
  trends: {
    totalUsers: 10,
    activeLearners: null,
    newUsers: -5,
    verifiedUsers: null,
    lessonsCompleted: null,
    courseCompletionPct: null,
    xpEarned: null,
    certificatesIssued: null,
  },
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  vi.clearAllMocks()
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

/** Async server components are plain async functions: await the element, then render it. */
async function renderBlock(element: Promise<React.ReactElement>) {
  const resolved = await element
  await act(async () => {
    root.render(resolved)
  })
}

describe('overview blocks', () => {
  it('KPI block passes the range to its loader and renders the other 7 cards without waiting on Auth', async () => {
    loaders.loadDashboardKpis.mockResolvedValue({ range: {}, kpis: KPIS, failed: false })
    // The verified-users loader never settles: the rest of the grid must still paint.
    loaders.loadDashboardVerifiedUsers.mockReturnValue(new Promise(() => {}))
    await renderBlock(OverviewKpis(RANGE))

    expect(loaders.loadDashboardKpis).toHaveBeenCalledWith('7d', null, null)
    expect(container.textContent).toContain('Total Users')
    expect(container.textContent).toContain((1234).toLocaleString())
    expect(container.textContent).toContain('+10%')
    expect(container.textContent).toContain('Certificates Issued')
    expect(container.querySelector('[role="alert"]')).toBeNull()
    // The verified card's slot holds a card-sized skeleton until its own loader resolves.
    expect(container.querySelector('[aria-label="Loading verified users"]')).not.toBeNull()
    expect(container.textContent).not.toContain('Verified Users')
  })

  it('starts the verified-users load before the other KPIs resolve, and only once', async () => {
    let resolveKpis!: (value: unknown) => void
    loaders.loadDashboardKpis.mockReturnValue(new Promise((resolve) => (resolveKpis = resolve)))
    loaders.loadDashboardVerifiedUsers.mockReturnValue(new Promise(() => {}))
    const block = OverviewKpis(RANGE)

    // Still waiting on the KPIs: the slow Auth call is already running alongside them.
    expect(loaders.loadDashboardVerifiedUsers).toHaveBeenCalledWith('7d', null, null)

    resolveKpis({ range: {}, kpis: KPIS, failed: false })
    await renderBlock(block)
    // The card awaits the promise it was handed instead of loading again.
    expect(loaders.loadDashboardVerifiedUsers).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[aria-label="Loading verified users"]')).not.toBeNull()
  })

  it('verified-users card uses a load handed to it, keeping its failed state', async () => {
    await renderBlock(
      OverviewVerifiedUsersKpi({
        ...RANGE,
        slice: Promise.resolve({ verifiedUsers: 77, verifiedUsersTrend: null, failed: false }),
      })
    )
    expect(loaders.loadDashboardVerifiedUsers).not.toHaveBeenCalled()
    expect(container.textContent).toContain('77')

    await renderBlock(
      OverviewVerifiedUsersKpi({
        ...RANGE,
        slice: Promise.resolve({ verifiedUsers: 0, verifiedUsersTrend: null, failed: true }),
      })
    )
    expect(container.textContent).toContain('Unavailable')
  })

  it('verified-users card renders its own slice, and says so when Auth failed', async () => {
    loaders.loadDashboardVerifiedUsers.mockResolvedValue({ verifiedUsers: 4321, verifiedUsersTrend: 25, failed: false })
    await renderBlock(OverviewVerifiedUsersKpi(RANGE))

    expect(loaders.loadDashboardVerifiedUsers).toHaveBeenCalledWith('7d', null, null)
    expect(container.textContent).toContain('Verified Users')
    expect(container.textContent).toContain((4321).toLocaleString())
    expect(container.textContent).toContain('+25%')

    loaders.loadDashboardVerifiedUsers.mockResolvedValue({ verifiedUsers: 0, verifiedUsersTrend: null, failed: true })
    await renderBlock(OverviewVerifiedUsersKpi(RANGE))
    expect(container.textContent).toContain('Unavailable')
    expect(container.textContent).not.toMatch(/Verified Users\s*0/)
  })

  it('a failed block shows its own warning and still renders its content', async () => {
    loaders.loadDashboardKpis.mockResolvedValue({ range: {}, kpis: KPIS, failed: true })
    loaders.loadDashboardVerifiedUsers.mockReturnValue(new Promise(() => {}))
    await renderBlock(OverviewKpis(RANGE))

    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/Key metrics could not be loaded/)
    expect(container.textContent).toContain('Total Users')
  })

  it.each([
    ['attention', () => OverviewAttention(RANGE), 'loadDashboardAttention', { attention: [{}, {}] }],
    ['funnel', () => OverviewFunnel(), 'loadDashboardFunnel', { funnel: [{}, {}] }],
    ['recent', () => OverviewRecentActivity(), 'loadDashboardRecentActivity', { recentActivity: [{}, {}] }],
    ['snapshot', () => OverviewSystemSnapshot(), 'loadDashboardSystemSnapshot', { systemSnapshot: [{}, {}] }],
  ] as const)('%s block renders its slice and warns only when failed', async (testId, block, loader, slice) => {
    loaders[loader].mockResolvedValue({ ...slice, failed: false })
    await renderBlock(block())
    expect(container.querySelector(`[data-testid="${testId}"]`)?.getAttribute('data-count')).toBe('2')
    expect(container.querySelector('[role="alert"]')).toBeNull()

    loaders[loader].mockResolvedValue({ ...slice, failed: true })
    await renderBlock(block())
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
    expect(container.querySelector(`[data-testid="${testId}"]`)).not.toBeNull()
  })

  it('charts block uses the lazy chart wrappers with the loaded series', async () => {
    loaders.loadDashboardSeries.mockResolvedValue({ series: [{}, {}, {}], failed: false })
    await renderBlock(OverviewCharts(RANGE))

    expect(loaders.loadDashboardSeries).toHaveBeenCalledWith('7d', null, null)
    expect(container.querySelector('[data-testid="learner-chart"]')?.getAttribute('data-count')).toBe('3')
    expect(container.querySelector('[data-testid="learning-chart"]')?.getAttribute('data-count')).toBe('3')
  })
})

describe('overview page wiring', () => {
  const pageSource = fs.readFileSync(path.resolve(__dirname, '../../app/admin/(console)/page.tsx'), 'utf8')

  it('no longer awaits the single getDashboardData call or imports recharts directly', () => {
    expect(pageSource).not.toMatch(/getDashboardData/)
    expect(pageSource).not.toMatch(/from '@\/components\/admin\/AdminLearnerActivityChart'/)
    expect(pageSource).not.toMatch(/from '@\/components\/admin\/AdminLearningActivityChart'/)
  })

  it('wraps every block in its own Suspense, with the system snapshot last', () => {
    const blocks = [
      'OverviewAttention',
      'OverviewNorthStarTile',
      'OverviewKpis',
      'OverviewCharts',
      'OverviewFunnel',
      'OverviewRecentActivity',
      'OverviewSystemSnapshot',
    ]
    const positions = blocks.map((name) => pageSource.indexOf(`<${name} `))
    positions.forEach((pos) => expect(pos).toBeGreaterThan(0))
    expect(Math.max(...positions)).toBe(positions[positions.length - 1])
    expect(pageSource.match(/<Suspense\b/g)?.length).toBe(blocks.length + 1) // + the range selector
  })
})

describe('AdminDashboardRefreshButton', () => {
  it('revalidates the admin-dashboard tag, then refreshes the router', async () => {
    apiPost.mockResolvedValue({ ok: true, data: { revalidated: true }, status: 200 })
    await act(async () => {
      root.render(<AdminDashboardRefreshButton />)
    })
    const button = container.querySelector('button')!

    await act(async () => {
      button.click()
    })

    expect(apiPost).toHaveBeenCalledWith('/api/admin/cache/revalidate', { tag: 'admin-dashboard' })
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(apiPost.mock.invocationCallOrder[0]).toBeLessThan(refresh.mock.invocationCallOrder[0])
    expect(button.disabled).toBe(true)
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('animate-spin')
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Refreshing')
    expect(toast).not.toHaveBeenCalled()
  })

  it('announces "Updated" once a clean refresh has finished', async () => {
    vi.useFakeTimers()
    try {
      apiPost.mockResolvedValue({ ok: true, data: { revalidated: true }, status: 200 })
      await act(async () => {
        root.render(<AdminDashboardRefreshButton />)
      })
      const status = () => container.querySelector('[role="status"]')
      expect(status()?.className).toContain('sr-only')
      expect(status()?.textContent).toBe('')

      await act(async () => {
        container.querySelector('button')!.click()
      })
      await act(async () => {
        vi.advanceTimersByTime(700)
      })
      expect(status()?.textContent).toBe('Updated')
      expect(container.querySelector('button')!.disabled).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([
    [429, 'rate_limited', /Too many refreshes/],
    [500, 'internal_error', /Could not clear the cached numbers/],
  ])('shows an error toast and announces the failure on a %i', async (status, code, message) => {
    vi.useFakeTimers()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      apiPost.mockResolvedValue({ ok: false, error: { kind: 'http', code, message: 'x', status } })
      await act(async () => {
        root.render(<AdminDashboardRefreshButton />)
      })
      await act(async () => {
        container.querySelector('button')!.click()
      })
      expect(toast).toHaveBeenCalledTimes(1)
      expect(toast).toHaveBeenCalledWith(expect.stringMatching(message), 'error')
      // The page still refreshes, showing whatever the cache holds.
      expect(refresh).toHaveBeenCalledTimes(1)

      await act(async () => {
        vi.advanceTimersByTime(700)
      })
      const announced = container.querySelector('[role="status"]')?.textContent ?? ''
      expect(announced).toMatch(message)
      expect(announced).not.toBe('Updated')
    } finally {
      warn.mockRestore()
      vi.useRealTimers()
    }
  })

  it('still refreshes when the revalidate call fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    apiPost.mockResolvedValue({ ok: false, error: { kind: 'http', code: 'forbidden', message: 'x', status: 403 } })
    await act(async () => {
      root.render(<AdminDashboardRefreshButton />)
    })
    await act(async () => {
      container.querySelector('button')!.click()
    })
    expect(refresh).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})
