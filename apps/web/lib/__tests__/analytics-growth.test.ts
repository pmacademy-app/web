import { describe, expect, it, vi } from 'vitest'

/**
 * C6: the analytics growth tab. Every metric is a head count (no row scans), bounded by the
 * selected range where the table has a timestamp, computed only for tab=growth, and a failed
 * count marks growth `failed` instead of throwing.
 */

vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => Promise<unknown>) => fn,
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('../supabase', () => ({ createServiceRoleClient: vi.fn() }))
vi.mock('../lesson-loader', () => ({ fetchCurriculumData: vi.fn(async () => ({ lessons: [] })) }))

import { createServiceRoleClient } from '../supabase'
import {
  AnalyticsService,
  GROWTH_CELEBRATION_KEY_PREFIXES,
  emptyGrowthData,
  fetchGrowthData,
} from '../admin/analytics-service'
import { ACHIEVEMENT_CELEBRATION_KEY_PREFIXES } from '../notifications/in-app/achievement-celebrations'

type Call = { method: string; args: unknown[] }
type Recorded = { table: string; calls: Call[] }

const START = '2026-09-11T00:00:00.000Z'
const END = '2026-10-11T00:00:00.000Z'

/**
 * A fake Supabase client. Each from() returns a chainable, awaitable builder that records
 * its calls; `respond` decides the { count, error } each finished query resolves to.
 */
function fakeClient(respond: (q: Recorded) => { count: number | null; error: { message: string } | null }) {
  const queries: Recorded[] = []
  const client = {
    from(table: string) {
      const recorded: Recorded = { table, calls: [] }
      queries.push(recorded)
      const builder: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'in', 'or', 'gte', 'lte', 'is', 'not', 'order', 'range']) {
        builder[method] = (...args: unknown[]) => {
          recorded.calls.push({ method, args })
          return builder
        }
      }
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve()
          .then(() => respond(recorded))
          .then(resolve, reject)
      return builder
    },
    rpc: async () => ({ data: [], error: null }),
  }
  return { client: client as never, queries }
}

const has = (q: Recorded, method: string, ...args: unknown[]) =>
  q.calls.some((c) => c.method === method && args.every((a, i) => JSON.stringify(c.args[i]) === JSON.stringify(a)))

describe('fetchGrowthData', () => {
  it('uses head counts only, never row scans', async () => {
    const { client, queries } = fakeClient(() => ({ count: 1, error: null }))
    await fetchGrowthData(client, START, END)
    expect(queries.length).toBeGreaterThan(0)
    for (const q of queries) {
      const select = q.calls.find((c) => c.method === 'select')
      expect(select?.args[1]).toEqual({ count: 'exact', head: true })
    }
  })

  it('bounds every timestamped count by the range and leaves public capstone pages current', async () => {
    const { client, queries } = fakeClient(() => ({ count: 1, error: null }))
    await fetchGrowthData(client, START, END)
    for (const q of queries) {
      if (q.table === 'capstone_submissions') {
        expect(q.calls.some((c) => c.method === 'gte' || c.method === 'lte')).toBe(false)
        continue
      }
      const gte = q.calls.find((c) => c.method === 'gte')
      const lte = q.calls.find((c) => c.method === 'lte')
      expect(gte?.args[1]).toBe(START)
      expect(lte?.args[1]).toBe(END)
      expect(gte?.args[0]).toBe(lte?.args[0])
    }
  })

  it('maps each count to its metric', async () => {
    const { client } = fakeClient((q) => {
      if (q.table === 'in_app_notifications') return { count: has(q, 'or') ? 50 : 20, error: null }
      if (q.table === 'referrals') {
        if (has(q, 'gte', 'rewarded_at')) return { count: 3, error: null }
        if (has(q, 'in', 'status')) return { count: 7, error: null }
        return { count: 12, error: null }
      }
      if (q.table === 'capstone_submissions') return { count: 9, error: null }
      if (q.table === 'fellow_requests') {
        if (has(q, 'eq', 'status', 'pending')) return { count: 4, error: null }
        if (has(q, 'eq', 'status', 'approved')) return { count: 2, error: null }
        if (has(q, 'eq', 'status', 'rejected')) return { count: 1, error: null }
      }
      return { count: null, error: { message: 'unexpected query' } }
    })

    const growth = await fetchGrowthData(client, START, END)
    expect(growth).toEqual({
      celebrations: { created: 50, claimed: 20 },
      referrals: { created: 12, signedUp: 12, activated: 7, rewarded: 3 },
      publicCapstonePages: 9,
      fellowRequests: { total: 7, pending: 4, approved: 2, rejected: 1 },
    })
  })

  it('filters the queries on the right columns', async () => {
    const { client, queries } = fakeClient(() => ({ count: 0, error: null }))
    await fetchGrowthData(client, START, END)

    const notifications = queries.filter((q) => q.table === 'in_app_notifications')
    const created = notifications.find((q) => has(q, 'or'))!
    const claimed = notifications.find((q) => !has(q, 'or'))!
    for (const prefix of GROWTH_CELEBRATION_KEY_PREFIXES) {
      expect(String(created.calls.find((c) => c.method === 'or')?.args[0])).toContain(`idempotency_key.like.${prefix}%`)
    }
    expect(has(created, 'gte', 'created_at')).toBe(true)
    expect(has(claimed, 'gte', 'celebrated_at')).toBe(true)

    const referrals = queries.filter((q) => q.table === 'referrals')
    expect(referrals).toHaveLength(3)
    expect(referrals.some((q) => has(q, 'in', 'status', ['activated', 'rewarded']))).toBe(true)
    expect(referrals.some((q) => has(q, 'gte', 'rewarded_at'))).toBe(true)

    const capstones = queries.find((q) => q.table === 'capstone_submissions')!
    expect(String(capstones.calls.find((c) => c.method === 'select')?.args[0])).toContain('!inner')
    expect(has(capstones, 'eq', 'status', 'reviewed')).toBe(true)
    expect(has(capstones, 'eq', 'is_public', true)).toBe(true)
    expect(has(capstones, 'eq', 'users.is_portfolio_public', true)).toBe(true)

    const fellow = queries.filter((q) => q.table === 'fellow_requests')
    expect(fellow).toHaveLength(3)
    expect(fellow.every((q) => has(q, 'gte', 'requested_at'))).toBe(true)
  })

  it('marks growth failed on a query error and zeroes only that count', async () => {
    const { client } = fakeClient((q) =>
      q.table === 'referrals' ? { count: null, error: { message: 'boom' } } : { count: 5, error: null }
    )
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const growth = await fetchGrowthData(client, START, END)
    spy.mockRestore()
    expect(growth.failed).toBe(true)
    expect(growth.referrals).toEqual({ created: 0, signedUp: 0, activated: 0, rewarded: 0 })
    expect(growth.publicCapstonePages).toBe(5)
  })

  it('does not throw when a query rejects', async () => {
    const { client } = fakeClient((q) => {
      if (q.table === 'capstone_submissions') throw new Error('network down')
      return { count: 1, error: null }
    })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const growth = await fetchGrowthData(client, START, END)
    spy.mockRestore()
    expect(growth.failed).toBe(true)
    expect(growth.publicCapstonePages).toBe(0)
  })
})

describe('growth constants', () => {
  it('restates exactly the achievement celebration key prefixes', () => {
    expect([...GROWTH_CELEBRATION_KEY_PREFIXES].sort()).toEqual(
      Object.values(ACHIEVEMENT_CELEBRATION_KEY_PREFIXES).sort()
    )
  })

  it('empty growth data is all zeros and failed', () => {
    const empty = emptyGrowthData()
    expect(empty.failed).toBe(true)
    expect(empty.publicCapstonePages).toBe(0)
    expect(empty.fellowRequests.total).toBe(0)
  })
})

describe('AnalyticsService growth wiring', () => {
  const respond = () => ({ count: 2, error: null, data: [] }) as never

  it('computes growth only for tab=growth', async () => {
    const growthFake = fakeClient(respond)
    vi.mocked(createServiceRoleClient).mockReturnValue(growthFake.client)
    const growthData = await AnalyticsService.getAnalyticsWorkspaceData({ rangeKey: '30d', tab: 'growth' })
    expect(growthData.growth).toBeDefined()
    expect(growthData.growth?.publicCapstonePages).toBe(2)
    expect(growthFake.queries.some((q) => q.table === 'referrals')).toBe(true)

    const overviewFake = fakeClient(respond)
    vi.mocked(createServiceRoleClient).mockReturnValue(overviewFake.client)
    const overview = await AnalyticsService.getAnalyticsWorkspaceData({ rangeKey: '30d', tab: 'overview' })
    expect(overview.growth).toBeUndefined()
    for (const table of ['referrals', 'in_app_notifications', 'fellow_requests', 'capstone_submissions']) {
      expect(overviewFake.queries.some((q) => q.table === table)).toBe(false)
    }
  })

  it('marks the whole payload failed (so it is not cached) when a growth count fails', async () => {
    const fake = fakeClient((q) =>
      (q.table === 'fellow_requests' ? { count: null, error: { message: 'boom' } } : respond()) as never
    )
    vi.mocked(createServiceRoleClient).mockReturnValue(fake.client)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const data = await AnalyticsService.getAnalyticsWorkspaceData({ rangeKey: '30d', tab: 'growth' })
    spy.mockRestore()
    expect(data.growth?.failed).toBe(true)
    // Not the catch-all fallback: the other growth counts are still real.
    expect(data.growth?.publicCapstonePages).toBe(2)
    expect(data.failed).toBe(true)
  })
})
