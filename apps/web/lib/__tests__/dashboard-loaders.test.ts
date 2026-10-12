/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { unstable_cache } from 'next/cache'

// Tables whose queries resolve with a PostgREST error, set per test.
const failingTables = new Set<string>()
// Tables whose `.in(...)` lookups (only) resolve with an error.
const failingInLookups = new Set<string>()
let authError: { message: string } | null = null
let activeUsersRpcError: { message: string } | null = null
let activeBefore = false
let funnelRpcError: { message: string } | null = null
let funnelStats: Record<string, number> = { first_lesson: 1, first_quiz: 1, module_completion: 1 }
const headCountTables: string[] = []
const rpcCalls: Array<{ fn: string; args: unknown; order: string | null }> = []
// Every `.range()` page read on a table, with the columns it was ordered by.
const pagedReads: Array<{ table: string; orders: string[] }> = []
let curriculumError: Error | null = null

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
    case 'badges':
      return [{ id: 'badge-1' }]
    case 'user_badges':
      return [{ user_id: 'user-1' }]
    default:
      return []
  }
}

const createChain = (table: string) => {
  const chain: any = {}
  let usedIn = false
  const orders: string[] = []
  for (const method of ['select', 'eq', 'in', 'gte', 'lte', 'lt', 'not', 'order', 'limit', 'range']) {
    chain[method] = vi.fn((...args: any[]) => {
      if (method === 'in') usedIn = true
      if (method === 'order') orders.push(args[0])
      if (method === 'range') pagedReads.push({ table, orders: [...orders] })
      if (method === 'select' && args[1]?.head) headCountTables.push(table)
      return chain
    })
  }
  chain.then = (resolve: any, reject: any) => {
    const result = failingTables.has(table) || (usedIn && failingInLookups.has(table))
      ? { data: null, count: null, error: { message: `${table} unavailable` } }
      : { data: rowsFor(table), count: rowsFor(table).length, error: null }
    return Promise.resolve(result).then(resolve, reject)
  }
  return chain
}

/** admin_active_users: user-1 is the one learner with XP in range. admin_funnel_distinct_users: `funnelStats`. */
const createRpc = (fn: string, args: unknown) => {
  const call = { fn, args, order: null as string | null }
  rpcCalls.push(call)
  const builder: any = {
    order: (col: string) => {
      call.order = col
      return builder
    },
    range: () => builder,
    then: (resolve: any, reject: any) =>
      Promise.resolve(
        fn === 'admin_funnel_distinct_users'
          ? funnelRpcError
            ? { data: null, error: funnelRpcError }
            : { data: funnelStats, error: null }
          : activeUsersRpcError
            ? { data: null, error: activeUsersRpcError }
            : { data: [{ user_id: 'user-1', active_before: activeBefore }], error: null }
      ).then(resolve, reject),
  }
  return builder
}

vi.mock('../supabase', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn((table: string) => createChain(table)),
    rpc: vi.fn((fn: string, args: unknown) => createRpc(fn, args)),
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
  fetchCurriculumData: vi.fn(() =>
    curriculumError
      ? Promise.reject(curriculumError)
      : Promise.resolve({ lessons: [{ id: 'les-1', title: 'Lesson One', slug: 'lesson-one' }] })
  ),
}))

vi.mock('../admin/service', () => ({
  AdminConsoleService: {
    getSystemHealth: vi.fn(() =>
      Promise.resolve({ status: 'healthy', databaseLatencyMs: 12, lastCheckedAt: new Date().toISOString() })
    ),
    getEmailQueueOverview: vi.fn(() => Promise.resolve({ pendingCount: 0, failedCount: 0, failed: false })),
  },
}))

import { AdminConsoleService } from '../admin/service'

import {
  DashboardService,
  loadDashboardAttention,
  loadDashboardFunnel,
  loadDashboardKpis,
  loadDashboardRecentActivity,
  loadDashboardSeries,
  loadDashboardSystemSnapshot,
  loadDashboardVerifiedUsers,
} from '../admin/dashboard-service'

/** Mimics the real data cache: the result is JSON round-tripped, so Dates come back as strings. */
const jsonRoundTripCache = () =>
  vi.mocked(unstable_cache).mockImplementation(((fn: () => Promise<unknown>) => async () =>
    JSON.parse(JSON.stringify(await fn()))) as any)

describe('dashboard section loaders', () => {
  beforeEach(() => {
    failingTables.clear()
    failingInLookups.clear()
    authError = null
    activeUsersRpcError = null
    activeBefore = false
    funnelRpcError = null
    funnelStats = { first_lesson: 1, first_quiz: 1, module_completion: 1 }
    headCountTables.length = 0
    rpcCalls.length = 0
    pagedReads.length = 0
    curriculumError = null
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
      loadDashboardVerifiedUsers('30d'),
    ])
    expect(slices.map((s) => s.failed)).toEqual([false, false, false, false, false, false, false])

    const [kpis, series, funnel, attention, recent, snapshot, verified] = slices
    expect(kpis.kpis.totalUsers).toBe(1)
    expect(kpis.kpis.activeLearners).toBe(1)
    expect(kpis.kpis.xpEarned).toBe(50)
    expect(series.series.length).toBe(30)
    expect(funnel.funnel.length).toBe(7)
    expect(attention.attention.map((a) => a.id)).toEqual(['failed-emails', 'contact-messages', 'pending-testimonials', 'system-alerts'])
    expect(recent.recentActivity.find((r) => r.activity === 'completed a lesson')?.entity).toBe('Lesson One')
    expect(snapshot.systemSnapshot.find((s) => s.id === 'auth')?.status).toBe('healthy')
    expect(verified.verifiedUsers).toBe(1)
    // The KPI grid no longer waits on Auth: its own verified count is a placeholder.
    expect(kpis.kpis.verifiedUsers).toBe(0)
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
    // 'v1' is the payload version cacheWithMaxAge puts in front of every key.
    expect(calls[0][1]).toEqual(['v1', 'admin-dashboard', 'kpis', '7d'])
    expect(calls[1][1]).toEqual(['v1', 'admin-dashboard', 'series', 'custom', '2026-08-01', '2026-08-05'])
    expect(calls[2][1]).toEqual(['v1', 'admin-dashboard', 'funnel'])
  })

  it('orders every paged read with its primary key last, so pages cannot overlap or skip', async () => {
    await Promise.all([loadDashboardKpis('30d'), loadDashboardSeries('30d')])
    // No summary RPC: the summary falls back to its own paged reads.
    activeUsersRpcError = { message: 'function get_admin_dashboard_summary does not exist' }
    await DashboardService.getDashboardSummary()

    const tables = new Set(pagedReads.map((r) => r.table))
    expect(tables).toEqual(new Set(['users', 'xp_events', 'user_lesson_progress', 'quiz_attempts', 'capstone_submissions']))
    for (const read of pagedReads) {
      // user_lesson_progress has no `id`: its key is user_id + lesson_id.
      const key = read.table === 'user_lesson_progress' ? ['user_id', 'lesson_id'] : ['id']
      expect(read.orders.slice(-key.length), `${read.table} paged read is unordered`).toEqual(key)
    }
  })

  it('rejects inside the cached function on failure, so a failed load is never cached', async () => {
    failingTables.add('certificates')
    await loadDashboardKpis('30d')

    const cachedFn = vi.mocked(unstable_cache).mock.calls[0][0] as () => Promise<unknown>
    await expect(cachedFn()).rejects.toThrow('certificates')
  })

  it('system snapshot shows a real Auth outage as degraded, but fails the slice so it is not cached', async () => {
    authError = { message: 'auth down' }

    const snapshot = await loadDashboardSystemSnapshot()
    expect(snapshot.failed).toBe(true)
    expect(snapshot.systemSnapshot.find((s) => s.id === 'auth')?.status).toBe('degraded')
    expect(snapshot.systemSnapshot.find((s) => s.id === 'database')?.status).toBe('healthy')

    const cachedFn = vi.mocked(unstable_cache).mock.calls[0][0] as () => Promise<unknown>
    await expect(cachedFn()).rejects.toThrow('Auth API unreachable')
  })

  it('system snapshot fails (uncached) when the email queue overview could not be read', async () => {
    vi.mocked(AdminConsoleService.getEmailQueueOverview).mockResolvedValueOnce({
      pendingCount: 0,
      failedCount: 0,
      failed: true,
    } as any)

    const snapshot = await loadDashboardSystemSnapshot()
    expect(snapshot.failed).toBe(true)
    expect(snapshot.systemSnapshot.find((s) => s.id === 'email')?.status).toBe('unknown')
    expect(snapshot.systemSnapshot.find((s) => s.id === 'auth')?.status).toBe('healthy')
  })

  it.each(['degraded', 'down'] as const)(
    'system snapshot shows a %s database, but fails the slice so it is not cached as healthy',
    async (status) => {
      const health = { status, databaseLatencyMs: status === 'down' ? -1 : 900, lastCheckedAt: new Date().toISOString() }
      vi.mocked(AdminConsoleService.getSystemHealth).mockResolvedValueOnce(health as any)

      const snapshot = await loadDashboardSystemSnapshot()
      expect(snapshot.failed).toBe(true)
      expect(snapshot.systemSnapshot.find((s) => s.id === 'database')?.status).toBe(status)
      expect(snapshot.systemSnapshot.find((s) => s.id === 'auth')?.status).toBe('healthy')

      vi.mocked(AdminConsoleService.getSystemHealth).mockResolvedValueOnce(health as any)
      const cachedFn = vi.mocked(unstable_cache).mock.calls[0][0] as () => Promise<unknown>
      await expect(cachedFn()).rejects.toThrow(`database ${status}`)
    }
  )

  it('recent activity without the curriculum keeps its rows but fails, so raw lesson ids are not cached', async () => {
    curriculumError = new Error('curriculum.json missing')

    const recent = await loadDashboardRecentActivity()
    expect(recent.failed).toBe(true)
    expect(recent.recentActivity.length).toBeGreaterThan(0)
    expect(recent.recentActivity.find((r) => r.activity === 'completed a lesson')?.entity).toBe('les-1')

    const cachedFn = vi.mocked(unstable_cache).mock.calls[0][0] as () => Promise<unknown>
    await expect(cachedFn()).rejects.toThrow('curriculum unavailable')
  })

  it('a course-completion badge query error fails the KPIs and the funnel instead of reading as 0', async () => {
    failingTables.add('user_badges')

    const [kpis, funnel] = await Promise.all([loadDashboardKpis('30d'), loadDashboardFunnel()])
    expect(kpis.failed).toBe(true)
    expect(funnel.failed).toBe(true)

    const kpisCall = vi.mocked(unstable_cache).mock.calls.find(([, key]) => (key as string[]).includes('kpis'))!
    await expect((kpisCall[0] as () => Promise<unknown>)()).rejects.toThrow('course completion users')
  })

  it('an Auth error fails only the verified-users card, never caching a zero', async () => {
    authError = { message: 'auth down' }

    const [verified, kpis] = await Promise.all([loadDashboardVerifiedUsers('30d'), loadDashboardKpis('30d')])
    expect(verified).toEqual({ verifiedUsers: 0, verifiedUsersTrend: null, failed: true })
    expect(kpis.failed).toBe(false)

    const verifiedCall = vi.mocked(unstable_cache).mock.calls.find(([, key]) => (key as string[]).includes('verified-users'))!
    expect(verifiedCall[2]).toEqual({ revalidate: 90, tags: ['admin-dashboard'] })
    await expect((verifiedCall[0] as () => Promise<unknown>)()).rejects.toThrow('auth down')

    const data = await DashboardService.getDashboardData('30d', null, null)
    expect(data.failed).toBe(true)
    expect(data.kpis.totalUsers).toBe(1)
  })

  it('funnel steps count distinct learners from the RPC, not rows', async () => {
    // 300 learners with thousands of completed lessons, quiz answers and submissions between them.
    funnelStats = { first_lesson: 240, first_quiz: 180, module_completion: 35 }

    const { funnel, failed } = await loadDashboardFunnel()
    expect(failed).toBe(false)

    const count = (key: string) => funnel.find((stage) => stage.key === key)?.count
    expect(count('first_lesson')).toBe(240)
    expect(count('first_quiz')).toBe(180)
    expect(count('module_completion')).toBe(35)
    expect(funnel.find((stage) => stage.key === 'first_quiz')?.pctOfPrevious).toBe(75)

    expect(rpcCalls.filter((call) => call.fn === 'admin_funnel_distinct_users')).toHaveLength(1)
    // No row counts on the per-activity tables: one learner's many rows must not inflate a step.
    for (const table of ['user_lesson_progress', 'quiz_attempts', 'capstone_submissions']) {
      expect(headCountTables).not.toContain(table)
    }
  })

  it('fails the funnel (uncached) when the distinct-user RPC is missing, and only the funnel', async () => {
    funnelRpcError = { message: 'function admin_funnel_distinct_users() does not exist' }
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const [funnel, kpis] = await Promise.all([loadDashboardFunnel(), loadDashboardKpis('30d')])
    expect(funnel).toEqual({ funnel: [], failed: true })
    expect(kpis.failed).toBe(false)

    const funnelCall = vi.mocked(unstable_cache).mock.calls.find(([, key]) => (key as string[]).includes('funnel'))!
    await expect((funnelCall[0] as () => Promise<unknown>)()).rejects.toThrow('admin_funnel_distinct_users')
  })

  it('fails the funnel when the RPC answers with a malformed payload', async () => {
    funnelStats = { first_lesson: 240 }
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await loadDashboardFunnel()).toEqual({ funnel: [], failed: true })
  })

  it('getDashboardData merges the verified-users card into the KPIs', async () => {
    const data = await DashboardService.getDashboardData('30d', null, null)
    expect(data.failed).toBeUndefined()
    expect(data.kpis.verifiedUsers).toBe(1)
  })

  it('recent activity fails when the actor-name lookup errors', async () => {
    failingInLookups.add('users')

    const recent = await loadDashboardRecentActivity()
    expect(recent).toEqual({ recentActivity: [], failed: true })
  })

  it('series reads "active before" from admin_active_users (ordered), not a scan of older xp_events', async () => {
    activeBefore = true
    const series = await loadDashboardSeries('30d')
    expect(series.failed).toBe(false)
    expect(rpcCalls.map((c) => [c.fn, c.order])).toEqual([['admin_active_users', 'user_id']])
    // user-1 earned XP in range and was active before it: counted as returning.
    expect(series.series.reduce((sum, p) => sum + p.returningLearners, 0)).toBe(1)

    activeBefore = false
    const fresh = await loadDashboardSeries('30d')
    expect(fresh.series.reduce((sum, p) => sum + p.returningLearners, 0)).toBe(0)
    expect(fresh.series.reduce((sum, p) => sum + p.activeLearners, 0)).toBe(1)
  })

  it('series fails when the admin_active_users RPC fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    activeUsersRpcError = { message: 'function admin_active_users does not exist' }

    const series = await loadDashboardSeries('30d')
    expect(series).toEqual({ series: [], failed: true })
  })
})
