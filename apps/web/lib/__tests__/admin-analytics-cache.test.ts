import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * B4: the analytics workspace is served from the Next.js data cache (90s, tag
 * `admin-analytics`, keyed by rangeKey/from/to/tab). The fake unstable_cache below
 * behaves like the real one where it matters: it JSON-serializes stored values (so
 * Dates come back as strings) and never stores a rejection.
 */

const cacheState = vi.hoisted(() => ({
  store: new Map<string, string>(),
  calls: [] as Array<{ keyParts: string[]; options: { revalidate?: number; tags?: string[] } }>,
  broken: false,
}))

vi.mock('next/cache', () => ({
  unstable_cache: vi.fn(
    (fn: () => Promise<unknown>, keyParts: string[], options: { revalidate?: number; tags?: string[] }) => {
      cacheState.calls.push({ keyParts, options })
      return async () => {
        if (cacheState.broken) throw new Error('incrementalCache missing')
        const key = JSON.stringify(keyParts)
        const hit = cacheState.store.get(key)
        if (hit !== undefined) return JSON.parse(hit)
        const value = await fn()
        cacheState.store.set(key, JSON.stringify(value))
        return JSON.parse(JSON.stringify(value))
      }
    }
  ),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('../supabase', () => ({ createServiceRoleClient: vi.fn() }))

import { AnalyticsService, ANALYTICS_CACHE_SECONDS, reviveAnalyticsWorkspaceData } from '../admin/analytics-service'
import type { AdminAnalyticsWorkspaceData } from '../admin/types'

type ComputeParams = { rangeKey: string; from: string | null; to: string | null; tab: string }

function workspace(params: ComputeParams, failed = false): AdminAnalyticsWorkspaceData {
  const data = {
    range: {
      key: params.rangeKey,
      label: 'Last 30 days',
      start: new Date('2026-09-11T00:00:00.000Z'),
      end: new Date('2026-10-11T00:00:00.000Z'),
    },
    tab: params.tab,
    overview: { kpis: { totalUsers: failed ? 0 : 42 }, funnel: [], consolidatedSeries: [] },
    learners: {},
    learning: {},
    engagement: {},
    outcomes: {},
    ...(failed ? { failed: true } : {}),
  }
  return data as unknown as AdminAnalyticsWorkspaceData
}

let compute: ReturnType<typeof vi.fn>

beforeEach(() => {
  cacheState.store.clear()
  cacheState.calls = []
  cacheState.broken = false
  compute = vi.fn(async (params: ComputeParams) => workspace(params))
  vi.spyOn(AnalyticsService as unknown as { computeWorkspaceData: typeof compute }, 'computeWorkspaceData').mockImplementation(
    compute
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AnalyticsService.getAnalyticsWorkspaceData cache', () => {
  it('caches for 90s under the admin-analytics tag, keyed by rangeKey/from/to/tab', async () => {
    await AnalyticsService.getAnalyticsWorkspaceData({
      rangeKey: 'custom',
      from: '2026-09-01',
      to: '2026-09-30',
      tab: 'learning',
    })
    expect(ANALYTICS_CACHE_SECONDS).toBe(90)
    expect(cacheState.calls).toHaveLength(1)
    expect(cacheState.calls[0].keyParts).toEqual(['admin-analytics', 'custom', '2026-09-01', '2026-09-30', 'learning'])
    expect(cacheState.calls[0].options).toEqual({ revalidate: 90, tags: ['admin-analytics'] })
  })

  it('applies the same defaults as before (30d, overview) to the key', async () => {
    await AnalyticsService.getAnalyticsWorkspaceData()
    expect(cacheState.calls[0].keyParts).toEqual(['admin-analytics', '30d', '', '', 'overview'])
    expect(compute).toHaveBeenCalledWith({ rangeKey: '30d', from: null, to: null, tab: 'overview' })
  })

  it('serves a hit from the cache and revives the range Dates', async () => {
    const first = await AnalyticsService.getAnalyticsWorkspaceData({ rangeKey: '30d', tab: 'overview' })
    const second = await AnalyticsService.getAnalyticsWorkspaceData({ rangeKey: '30d', tab: 'overview' })

    expect(compute).toHaveBeenCalledTimes(1)
    for (const data of [first, second]) {
      expect(data.range.start).toBeInstanceOf(Date)
      expect(data.range.end).toBeInstanceOf(Date)
      expect(data.range.start.toISOString()).toBe('2026-09-11T00:00:00.000Z')
      expect(data.range.end.toISOString()).toBe('2026-10-11T00:00:00.000Z')
    }
    expect(second.overview.kpis.totalUsers).toBe(42)
  })

  it('keeps separate entries per tab and per custom range', async () => {
    await AnalyticsService.getAnalyticsWorkspaceData({ rangeKey: '30d', tab: 'overview' })
    await AnalyticsService.getAnalyticsWorkspaceData({ rangeKey: '30d', tab: 'learning' })
    await AnalyticsService.getAnalyticsWorkspaceData({ rangeKey: 'custom', from: '2026-01-01', to: '2026-01-31' })
    await AnalyticsService.getAnalyticsWorkspaceData({ rangeKey: 'custom', from: '2026-02-01', to: '2026-02-28' })
    expect(compute).toHaveBeenCalledTimes(4)
  })

  it('never caches a failed result: it is returned as-is and recomputed next time', async () => {
    compute.mockImplementation(async (params: ComputeParams) => workspace(params, true))

    const first = await AnalyticsService.getAnalyticsWorkspaceData({ rangeKey: '7d' })
    expect(first.failed).toBe(true)
    expect(first.range.start).toBeInstanceOf(Date)
    expect(cacheState.store.size).toBe(0)

    compute.mockImplementation(async (params: ComputeParams) => workspace(params))
    const second = await AnalyticsService.getAnalyticsWorkspaceData({ rangeKey: '7d' })
    expect(second.failed).toBeUndefined()
    expect(second.overview.kpis.totalUsers).toBe(42)
    expect(compute).toHaveBeenCalledTimes(2)
    expect(cacheState.store.size).toBe(1)
  })

  it('computes uncached when the data cache itself is unavailable', async () => {
    cacheState.broken = true
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const data = await AnalyticsService.getAnalyticsWorkspaceData({ rangeKey: '7d' })
    expect(data.overview.kpis.totalUsers).toBe(42)
    expect(data.range.start).toBeInstanceOf(Date)
    expect(compute).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalled()
  })

  it('reviveAnalyticsWorkspaceData turns ISO strings back into Dates', () => {
    const serialized = JSON.parse(JSON.stringify(workspace({ rangeKey: '30d', from: null, to: null, tab: 'overview' })))
    expect(typeof serialized.range.start).toBe('string')
    const revived = reviveAnalyticsWorkspaceData(serialized)
    expect(revived.range.start).toBeInstanceOf(Date)
    expect(revived.range.end.getTime()).toBe(new Date('2026-10-11T00:00:00.000Z').getTime())
  })

  it('the cached computation does not read request state (cookies/headers)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../admin/analytics-service.ts'), 'utf8')
    expect(src).not.toMatch(/from ['"]next\/headers['"]/)
    expect(src).not.toMatch(/\bcookies\(\)|\bheaders\(\)/)
  })
})
