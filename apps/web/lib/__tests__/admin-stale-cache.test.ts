/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The four admin loaders that sit behind `unstable_cache` must bound staleness and surface
 * a failing recompute. The shared setup mocks `unstable_cache` as a pass-through, which
 * hides what the real one does with a STALE entry on a request render
 * (next/dist/server/web/spec-extension/unstable-cache.js): it returns the old value at
 * once, recomputes in the background, and swallows a rejection. The fake below reproduces
 * exactly that, plus JSON serialization and tag expiry.
 */

const cacheState = vi.hoisted(() => ({
  store: new Map<string, { body: string; storedAt: number; tags: string[] }>(),
  /** Background revalidations Next would hold in `workStore.pendingRevalidates`. */
  background: [] as Array<Promise<unknown>>,
  swallowed: [] as unknown[],
}))

vi.mock('next/cache', () => ({
  unstable_cache: vi.fn(
    (fn: () => Promise<unknown>, keyParts: string[], options: { revalidate: number; tags?: string[] }) =>
      async () => {
        const key = JSON.stringify(keyParts)
        const store = (value: unknown) => {
          cacheState.store.set(key, { body: JSON.stringify(value), storedAt: Date.now(), tags: options.tags ?? [] })
        }
        const hit = cacheState.store.get(key)
        if (hit) {
          const cachedResponse = JSON.parse(hit.body)
          if ((Date.now() - hit.storedAt) / 1000 > options.revalidate) {
            cacheState.background.push(
              fn()
                .then((result) => {
                  store(result)
                  return result
                })
                .catch((err) => {
                  cacheState.swallowed.push(err)
                  return cachedResponse
                })
            )
          }
          return cachedResponse
        }
        const result = await fn()
        store(result)
        return result
      }
  ),
  revalidateTag: vi.fn((tag: string) => {
    for (const [key, entry] of cacheState.store) if (entry.tags.includes(tag)) cacheState.store.delete(key)
  }),
  revalidatePath: vi.fn(),
}))

// ─── Supabase fake ───────────────────────────────────────────────────────────

const failingTables = new Set<string>()
let authError: { message: string } | null = null
const queries: string[] = []
let authCalls = 0
let shellCount = 2

const SHELL_TABLES = ['contact_messages', 'testimonials', 'system_errors', 'email_queue', 'capstone_submissions', 'user_feedback']

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      queries.push(table)
      const chain: any = {}
      for (const method of ['select', 'eq', 'in', 'gte', 'lte', 'lt', 'not', 'order', 'limit', 'range']) {
        chain[method] = () => chain
      }
      chain.then = (resolve: any, reject: any) =>
        Promise.resolve(
          failingTables.has(table)
            ? { data: null, count: null, error: { message: `${table} unavailable` } }
            : { data: [], count: SHELL_TABLES.includes(table) ? shellCount : 0, error: null }
        ).then(resolve, reject)
      return chain
    },
    auth: {
      admin: {
        listUsers: () => {
          authCalls += 1
          return Promise.resolve({
            data: { users: [{ id: 'user-1', email_confirmed_at: new Date().toISOString() }] },
            error: authError,
          })
        },
      },
    },
  }),
}))

vi.mock('@/emails', () => ({ EMAIL_TEMPLATE_MAP: {}, renderEmailTemplate: vi.fn() }))

const { AdminConsoleService } = await import('../admin/service')
const { loadDashboardKpis, loadDashboardVerifiedUsers } = await import('../admin/dashboard-service')
const { AnalyticsService } = await import('../admin/analytics-service')
const { CommunicationsService } = await import('../admin/communications-service')
const { ADMIN_CACHE_TAGS, revalidateAdminTag } = await import('../admin/cache-tags')
const { ADMIN_CACHE_GRACE_MS, ADMIN_CACHE_VERSION } = await import('../admin/bounded-cache')

const START = new Date('2026-10-11T08:00:00.000Z').getTime()
const advance = (ms: number) => vi.setSystemTime(Date.now() + ms)
const HOURS = 60 * 60 * 1000
/** Lets the background revalidations settle, as Next does after the response. */
const settle = async () => {
  await Promise.all(cacheState.background)
  cacheState.background.length = 0
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  cacheState.store.clear()
  cacheState.background.length = 0
  cacheState.swallowed.length = 0
  failingTables.clear()
  authError = null
  queries.length = 0
  authCalls = 0
  shellCount = 2
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(async () => {
  await settle()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ─── Console shell (30s) ─────────────────────────────────────────────────────

describe('stale admin cache — console shell context', () => {
  it('a fresh entry is served without running the counts again', async () => {
    await AdminConsoleService.getConsoleShellContext()
    expect(queries).toHaveLength(6)

    advance(20_000)
    const ctx = await AdminConsoleService.getConsoleShellContext()

    expect(queries).toHaveLength(6)
    expect(ctx.systemOnline).toBe(true)
    expect(ctx.attentionTotal).toBe(12)
  })

  it('reports offline when the recompute of a stale healthy entry fails', async () => {
    expect((await AdminConsoleService.getConsoleShellContext()).systemOnline).toBe(true)

    advance(31_000)
    failingTables.add('system_errors')
    const ctx = await AdminConsoleService.getConsoleShellContext()

    expect(ctx.systemOnline).toBe(false)
    expect(ctx.databaseLatencyMs).toBeNull()
    // The counts that did come back are still shown.
    expect(ctx.attention.contactMessages).toBe(2)
  })

  it('returns the fresh counts, not the stale ones, after the TTL', async () => {
    await AdminConsoleService.getConsoleShellContext()

    advance(8 * HOURS)
    shellCount = 5
    const ctx = await AdminConsoleService.getConsoleShellContext()

    expect(ctx.attentionTotal).toBe(30)
    expect(ctx.systemOnline).toBe(true)
    // One recompute for the stale read, not two.
    expect(queries).toHaveLength(12)

    // The recompute was stored, so the next read is a plain hit.
    await settle()
    advance(1_000)
    expect((await AdminConsoleService.getConsoleShellContext()).attentionTotal).toBe(30)
    expect(queries).toHaveLength(12)
  })

  it('never stores a failed batch: recovery is visible on the next request', async () => {
    failingTables.add('email_queue')
    expect((await AdminConsoleService.getConsoleShellContext()).systemOnline).toBe(false)
    expect(cacheState.store.size).toBe(0)

    // Same after a healthy entry went stale: the failed recompute does not replace it.
    failingTables.clear()
    await AdminConsoleService.getConsoleShellContext()
    const healthy = [...cacheState.store.values()][0].body
    advance(31_000)
    failingTables.add('email_queue')
    expect((await AdminConsoleService.getConsoleShellContext()).systemOnline).toBe(false)
    await settle()
    expect([...cacheState.store.values()][0].body).toBe(healthy)

    failingTables.clear()
    expect((await AdminConsoleService.getConsoleShellContext()).systemOnline).toBe(true)
  })

  it('recomputes directly when an over-age value comes back without a revalidation', async () => {
    await AdminConsoleService.getConsoleShellContext()
    // An entry Next still treats as fresh (e.g. a second read in a request whose
    // revalidation is already pending) but whose payload is past TTL + grace.
    const entry = [...cacheState.store.values()][0]
    advance(30_000 + ADMIN_CACHE_GRACE_MS + 1)
    entry.storedAt = Date.now()
    failingTables.add('system_errors')

    const ctx = await AdminConsoleService.getConsoleShellContext()

    expect(ctx.systemOnline).toBe(false)
    expect(cacheState.background).toHaveLength(0)
  })

  it('stores under a versioned key, so a payload shape change can be rolled by bumping it', async () => {
    await AdminConsoleService.getConsoleShellContext()
    expect([...cacheState.store.keys()]).toEqual([JSON.stringify([ADMIN_CACHE_VERSION, 'admin-console-shell-context'])])
    expect(ADMIN_CACHE_VERSION).toBe('v1')
  })

  it('still expires on demand through the admin-shell tag', async () => {
    await AdminConsoleService.getConsoleShellContext()
    shellCount = 9

    revalidateAdminTag(ADMIN_CACHE_TAGS.shell)
    const ctx = await AdminConsoleService.getConsoleShellContext()

    expect(ctx.attentionTotal).toBe(54)
  })
})

// ─── Dashboard slice (90s) ───────────────────────────────────────────────────

describe('stale admin cache — dashboard slice', () => {
  it('a fresh entry is served without recomputing', async () => {
    await loadDashboardVerifiedUsers('30d')
    advance(60_000)
    const slice = await loadDashboardVerifiedUsers('30d')

    expect(authCalls).toBe(1)
    expect(slice).toMatchObject({ verifiedUsers: 1, failed: false })
  })

  it('reports failed when the recompute of a stale healthy entry fails', async () => {
    expect((await loadDashboardVerifiedUsers('30d')).failed).toBe(false)

    advance(91_000)
    authError = { message: 'auth down' }
    const slice = await loadDashboardVerifiedUsers('30d')

    expect(slice).toEqual({ verifiedUsers: 0, verifiedUsersTrend: null, failed: true })
  })

  it('returns the recomputed value once after the TTL, and stores it', async () => {
    await loadDashboardVerifiedUsers('30d')

    advance(8 * HOURS)
    const slice = await loadDashboardVerifiedUsers('30d')
    expect(slice.failed).toBe(false)
    expect(authCalls).toBe(2)

    await settle()
    advance(1_000)
    await loadDashboardVerifiedUsers('30d')
    expect(authCalls).toBe(2)
  })

  it('revives the range Dates on a real cache hit of a range-scoped slice', async () => {
    const first = await loadDashboardKpis('custom', '2026-08-01', '2026-08-05')
    const computeQueries = queries.length
    expect(computeQueries).toBeGreaterThan(0)

    advance(60_000)
    const second = await loadDashboardKpis('custom', '2026-08-01', '2026-08-05')

    // Served from the store: the JSON round trip turned the Dates into ISO strings.
    expect(queries).toHaveLength(computeQueries)
    expect([...cacheState.store.values()][0].body).toMatch(/"start":"\d{4}-\d{2}-\d{2}T/)
    expect(second.failed).toBe(false)
    expect(second.range.start).toBeInstanceOf(Date)
    expect(second.range.end).toBeInstanceOf(Date)
    expect(second.range.start.getTime()).toBe(first.range.start.getTime())
    expect(second.range.end.getTime()).toBe(first.range.end.getTime())
    expect(second.range.start.getTime()).toBeLessThan(second.range.end.getTime())
  })

  it('never stores a failed slice', async () => {
    authError = { message: 'auth down' }
    expect((await loadDashboardVerifiedUsers('30d')).failed).toBe(true)
    expect(cacheState.store.size).toBe(0)
  })
})

// ─── Analytics workspace (90s) ───────────────────────────────────────────────

describe('stale admin cache — analytics workspace', () => {
  const workspace = (totalUsers: number, failed = false) =>
    ({
      range: { key: '30d', label: 'Last 30 days', start: new Date('2026-09-11T00:00:00.000Z'), end: new Date('2026-10-11T00:00:00.000Z') },
      tab: 'overview',
      overview: { kpis: { totalUsers } },
      ...(failed ? { failed: true } : {}),
    }) as any

  let compute: ReturnType<typeof vi.fn>
  beforeEach(() => {
    compute = vi.fn(async () => workspace(42))
    vi.spyOn(AnalyticsService as any, 'computeWorkspaceData').mockImplementation(compute as any)
  })

  it('a fresh entry is served without recomputing, with revived Dates', async () => {
    await AnalyticsService.getAnalyticsWorkspaceData()
    advance(60_000)
    const data = await AnalyticsService.getAnalyticsWorkspaceData()

    expect(compute).toHaveBeenCalledTimes(1)
    expect(data.range.start).toBeInstanceOf(Date)
    expect(data.overview.kpis.totalUsers).toBe(42)
    expect(data).not.toHaveProperty('computedAt')
  })

  it('returns the failed payload when the recompute of a stale healthy entry is degraded', async () => {
    await AnalyticsService.getAnalyticsWorkspaceData()

    advance(91_000)
    compute.mockImplementation(async () => workspace(0, true))
    const data = await AnalyticsService.getAnalyticsWorkspaceData()

    expect(data.failed).toBe(true)
    expect(data.overview.kpis.totalUsers).toBe(0)
    expect(compute).toHaveBeenCalledTimes(2)

    // The degraded payload did not replace the stored healthy one.
    await settle()
    expect([...cacheState.store.values()][0].body).toContain('"totalUsers":42')
  })

  it('returns the fresh value after the TTL', async () => {
    await AnalyticsService.getAnalyticsWorkspaceData()

    advance(8 * HOURS)
    compute.mockImplementation(async () => workspace(77))
    const data = await AnalyticsService.getAnalyticsWorkspaceData()

    expect(data.overview.kpis.totalUsers).toBe(77)
    expect(data.range.end).toBeInstanceOf(Date)
    expect(compute).toHaveBeenCalledTimes(2)
  })
})

// ─── Nudge readout (120s) ────────────────────────────────────────────────────

describe('stale admin cache — nudge readout', () => {
  it('reports nudgesFailed when the recompute of a stale healthy readout fails', async () => {
    expect((await CommunicationsService.getLifecycleMetrics()).nudgesFailed).toBe(false)
    expect(cacheState.store.size).toBe(1)
    expect([...cacheState.store.values()][0].tags).toEqual([ADMIN_CACHE_TAGS.automations])

    advance(121_000)
    failingTables.add('notification_events')
    const metrics = await CommunicationsService.getLifecycleMetrics()

    expect(metrics.nudgesFailed).toBe(true)
  })

  it('serves a fresh readout from the cache and never stores a failed one', async () => {
    failingTables.add('notification_events')
    expect((await CommunicationsService.getLifecycleMetrics()).nudgesFailed).toBe(true)
    expect(cacheState.store.size).toBe(0)

    failingTables.clear()
    expect((await CommunicationsService.getLifecycleMetrics()).nudgesFailed).toBe(false)
    advance(60_000)
    failingTables.add('notification_events')
    // Still inside the 120s window: the stored healthy readout is served.
    expect((await CommunicationsService.getLifecycleMetrics()).nudgesFailed).toBe(false)
  })
})
