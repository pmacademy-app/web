/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { unstable_cache } from 'next/cache'

// Tables whose queries resolve with a PostgREST error, set per test.
const failingTables = new Set<string>()
let authError: { message: string } | null = null

const rowsFor = (table: string): any[] => {
  const now = new Date().toISOString()
  switch (table) {
    case 'users':
      return [{ id: 'user-1', name: 'Alice', email: 'alice@example.com', created_at: now }]
    case 'xp_events':
      return [{ user_id: 'user-1', xp_amount: 50, created_at: now }]
    case 'user_lesson_progress':
      return [{ user_id: 'user-1', lesson_id: 'les-1', completed_at: now }]
    case 'quiz_attempts':
      return [{ id: 'q-1', user_id: 'user-1', attempted_at: now }]
    case 'capstone_submissions':
      return [{ id: 'c-1', user_id: 'user-1', module_slug: 'foundations', submitted_at: now }]
    case 'certificates':
      return [{ id: 'cert-1', user_id: 'user-1', learner_name: 'Alice', issued_at: now, certificate_code: 'CERT-1' }]
    default:
      return []
  }
}

const createChain = (table: string) => {
  const chain: any = {}
  for (const method of ['select', 'eq', 'in', 'gte', 'lte', 'lt', 'not', 'order', 'limit', 'range']) {
    chain[method] = vi.fn(() => chain)
  }
  chain.then = (resolve: any, reject: any) => {
    const result = failingTables.has(table)
      ? { data: null, count: null, error: { message: `${table} unavailable` } }
      : { data: rowsFor(table), count: rowsFor(table).length, error: null }
    return Promise.resolve(result).then(resolve, reject)
  }
  return chain
}

vi.mock('../supabase', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn((table: string) => createChain(table)),
    auth: {
      admin: {
        listUsers: vi.fn(() =>
          Promise.resolve({
            data: { users: [{ id: 'user-1', email_confirmed_at: new Date().toISOString() }] },
            error: authError,
          })
        ),
      },
    },
  })),
}))

vi.mock('../lesson-loader', () => ({
  fetchCurriculumData: vi.fn(() => Promise.resolve({ lessons: [{ id: 'les-1', title: 'Lesson One', slug: 'lesson-one' }] })),
}))

vi.mock('../admin/service', () => ({
  AdminConsoleService: {
    getSystemHealth: vi.fn(() =>
      Promise.resolve({ status: 'healthy', databaseLatencyMs: 12, lastCheckedAt: new Date().toISOString() })
    ),
    getEmailQueueOverview: vi.fn(() => Promise.resolve({ pendingCount: 0, failedCount: 0, failed: false })),
  },
}))

import {
  DashboardService,
  loadDashboardAttention,
  loadDashboardFunnel,
  loadDashboardKpis,
  loadDashboardRecentActivity,
  loadDashboardSeries,
  loadDashboardSystemSnapshot,
} from '../admin/dashboard-service'

/** Mimics the real data cache: the result is JSON round-tripped, so Dates come back as strings. */
const jsonRoundTripCache = () =>
  vi.mocked(unstable_cache).mockImplementation(((fn: () => Promise<unknown>) => async () =>
    JSON.parse(JSON.stringify(await fn()))) as any)

describe('dashboard section loaders', () => {
  beforeEach(() => {
    failingTables.clear()
    authError = null
    vi.mocked(unstable_cache).mockReset()
    vi.mocked(unstable_cache).mockImplementation(((fn: any) => fn) as any)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('every loader succeeds with failed=false on a healthy database', async () => {
    const slices = await Promise.all([
      loadDashboardKpis('30d'),
      loadDashboardSeries('30d'),
      loadDashboardFunnel(),
      loadDashboardAttention('30d'),
      loadDashboardRecentActivity(),
      loadDashboardSystemSnapshot(),
    ])
    expect(slices.map((s) => s.failed)).toEqual([false, false, false, false, false, false])

    const [kpis, series, funnel, attention, recent, snapshot] = slices
    expect(kpis.kpis.totalUsers).toBe(1)
    expect(kpis.kpis.activeLearners).toBe(1)
    expect(kpis.kpis.xpEarned).toBe(50)
    expect(series.series.length).toBe(30)
    expect(funnel.funnel.length).toBe(7)
    expect(attention.attention.map((a) => a.id)).toEqual(['failed-emails', 'contact-messages', 'pending-testimonials', 'system-alerts'])
    expect(recent.recentActivity.find((r) => r.activity === 'completed a lesson')?.entity).toBe('Lesson One')
    expect(snapshot.systemSnapshot.find((s) => s.id === 'auth')?.status).toBe('healthy')
  })

  it('revives the range Dates after a JSON-serializing cache round trip', async () => {
    jsonRoundTripCache()

    const kpis = await loadDashboardKpis('custom', '2026-08-01', '2026-08-05')
    expect(kpis.failed).toBe(false)
    expect(kpis.range.start).toBeInstanceOf(Date)
    expect(kpis.range.end).toBeInstanceOf(Date)
    expect(kpis.range.start.getTime()).toBeLessThan(kpis.range.end.getTime())

    const data = await DashboardService.getDashboardData('7d', null, null)
    expect(data.range.start).toBeInstanceOf(Date)
    expect(data.range.end).toBeInstanceOf(Date)
  })

  it('keeps a failure isolated to the loaders that depend on the failing table', async () => {
    failingTables.add('xp_events')

    const data = await DashboardService.getDashboardData('30d', null, null)
    expect(data.failed).toBe(true)
    // xp_events feeds the KPIs and the series only.
    expect(data.kpis.totalUsers).toBe(0)
    expect(data.series).toEqual([])
    // Every other section still carries live data.
    expect(data.funnel.length).toBe(7)
    expect(data.funnel[0].count).toBe(1)
    expect(data.attention.length).toBe(4)
    expect(data.recentActivity.length).toBeGreaterThan(0)
    expect(data.systemSnapshot.length).toBe(6)
    expect(data.range.start).toBeInstanceOf(Date)
  })

  it('fails only the attention loader when an inbox table errors', async () => {
    failingTables.add('contact_messages')

    const [kpis, funnel, attention] = await Promise.all([
      loadDashboardKpis('30d'),
      loadDashboardFunnel(),
      loadDashboardAttention('30d'),
    ])
    expect(attention).toEqual({ attention: [], failed: true })
    expect(kpis.failed).toBe(false)
    expect(funnel.failed).toBe(false)
  })

  it('omits failed from getDashboardData when every section loads', async () => {
    const data = await DashboardService.getDashboardData('30d', null, null)
    expect(data.failed).toBeUndefined()
  })

  it('caches each loader for 90s under the admin-dashboard tag, keyed by range', async () => {
    await loadDashboardKpis('7d', '2026-01-01', '2026-01-02')
    await loadDashboardSeries('custom', '2026-08-01', '2026-08-05')
    await loadDashboardFunnel()

    const calls = vi.mocked(unstable_cache).mock.calls
    for (const [, , options] of calls) {
      expect(options).toEqual({ revalidate: 90, tags: ['admin-dashboard'] })
    }
    // Presets ignore from/to, so the key drops them.
    expect(calls[0][1]).toEqual(['admin-dashboard', 'kpis', '7d'])
    expect(calls[1][1]).toEqual(['admin-dashboard', 'series', 'custom', '2026-08-01', '2026-08-05'])
    expect(calls[2][1]).toEqual(['admin-dashboard', 'funnel'])
  })

  it('rejects inside the cached function on failure, so a failed load is never cached', async () => {
    failingTables.add('certificates')
    await loadDashboardKpis('30d')

    const cachedFn = vi.mocked(unstable_cache).mock.calls[0][0] as () => Promise<unknown>
    await expect(cachedFn()).rejects.toThrow('certificates')
  })

  it('system snapshot probes Auth itself and reports it degraded on an Auth error', async () => {
    authError = { message: 'auth down' }

    const snapshot = await loadDashboardSystemSnapshot()
    expect(snapshot.failed).toBe(false)
    expect(snapshot.systemSnapshot.find((s) => s.id === 'auth')?.status).toBe('degraded')
    expect(snapshot.systemSnapshot.find((s) => s.id === 'database')?.status).toBe('healthy')
  })
})
