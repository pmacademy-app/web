import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// PROD-15 base: server-side product events and the north-star tile. The helper must never throw
// and must refuse names the DB would refuse; the migration must keep the table and views out of
// learner reach; the north-star summary must pick the right UTC ISO weeks.

const insertMock = vi.fn()
const inMock = vi.fn()
const fromMock = vi.fn((table: string) => {
  if (table === 'product_events') return { insert: insertMock }
  return { select: () => ({ in: inMock }) }
})
const createServiceRoleClientMock = vi.fn(() => ({ from: fromMock }))

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: () => createServiceRoleClientMock(),
}))

const logSystemErrorMock = vi.fn()
vi.mock('@/lib/monitoring/logger', () => ({
  logSystemError: (...args: unknown[]) => logSystemErrorMock(...args),
}))

// unstable_cache needs a Next request context; run the computation directly.
vi.mock('@/lib/admin/bounded-cache', () => ({
  cacheWithMaxAge: <T,>(compute: () => Promise<T>) => compute,
}))

import {
  PRODUCT_EVENT_NAMES,
  MAX_PRODUCT_EVENT_PROPERTIES_BYTES,
  trackProductEvent,
  type ProductEventName,
} from '@/lib/events/product-events'
import { isoWeekStartUtc, loadNorthStar, summarizeNorthStar } from '@/lib/admin/north-star-service'

const USER_ID = '11111111-2222-4333-8444-555555555555'

const repoRoot = path.resolve(__dirname, '../../../..')
const migrationsDir = path.join(repoRoot, 'supabase/migrations')
const NAME = '20261024000001_product_events'
const read = (...parts: string[]) => fs.readFileSync(path.join(...parts), 'utf8')
const code = (sql: string) => sql.replace(/--.*$/gm, '')

beforeEach(() => {
  vi.clearAllMocks()
  insertMock.mockResolvedValue({ error: null })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('trackProductEvent', () => {
  it('writes one row with the service-role client and resolves true', async () => {
    const ok = await trackProductEvent('lesson_completed', USER_ID, { lessonId: 'les_001', score: 80 })

    expect(ok).toBe(true)
    expect(fromMock).toHaveBeenCalledWith('product_events')
    expect(insertMock).toHaveBeenCalledTimes(1)
    const row = insertMock.mock.calls[0][0]
    expect(row).toMatchObject({
      event_name: 'lesson_completed',
      user_id: USER_ID,
      properties: { lessonId: 'les_001', score: 80 },
    })
    expect(Number.isNaN(Date.parse(row.occurred_at))).toBe(false)
  })

  it('rejects an unknown event name without touching the database', async () => {
    const ok = await trackProductEvent('lesson_viewed' as ProductEventName, USER_ID)

    expect(ok).toBe(false)
    expect(createServiceRoleClientMock).not.toHaveBeenCalled()
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('does not throw when the insert returns an error, and logs it', async () => {
    insertMock.mockResolvedValue({ error: { message: 'relation does not exist', code: '42P01' } })

    await expect(trackProductEvent('signup', USER_ID)).resolves.toBe(false)
    expect(logSystemErrorMock).toHaveBeenCalledTimes(1)
    expect(logSystemErrorMock.mock.calls[0][0]).toMatchObject({
      operation: 'product_events.insert',
      severity: 'warning',
    })
  })

  it('does not throw when the client itself throws or the insert rejects', async () => {
    createServiceRoleClientMock.mockImplementationOnce(() => {
      throw new Error('Missing Supabase environment variables')
    })
    await expect(trackProductEvent('signup', USER_ID)).resolves.toBe(false)

    insertMock.mockRejectedValueOnce(new Error('network down'))
    await expect(trackProductEvent('signup', USER_ID)).resolves.toBe(false)
  })

  it('does not throw when the failure logger throws too', async () => {
    insertMock.mockResolvedValue({ error: { message: 'boom' } })
    logSystemErrorMock.mockRejectedValueOnce(new Error('logger down'))

    await expect(trackProductEvent('signup', USER_ID)).resolves.toBe(false)
  })

  it('rejects a malformed user id but accepts null', async () => {
    await expect(trackProductEvent('signup', 'not-a-uuid')).resolves.toBe(false)
    expect(insertMock).not.toHaveBeenCalled()

    await expect(trackProductEvent('referral_used', null)).resolves.toBe(true)
    expect(insertMock.mock.calls[0][0].user_id).toBeNull()
  })

  it('rejects properties that are not an object or exceed the size cap', async () => {
    await expect(
      trackProductEvent('signup', USER_ID, ['a'] as unknown as Record<string, never>)
    ).resolves.toBe(false)
    await expect(
      trackProductEvent('signup', USER_ID, { blob: 'x'.repeat(MAX_PRODUCT_EVENT_PROPERTIES_BYTES) })
    ).resolves.toBe(false)
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid occurredAt and honours a valid one', async () => {
    await expect(trackProductEvent('signup', USER_ID, {}, { occurredAt: 'not a date' })).resolves.toBe(false)
    expect(insertMock).not.toHaveBeenCalled()

    await trackProductEvent('signup', USER_ID, {}, { occurredAt: '2026-10-20T10:00:00Z' })
    expect(insertMock.mock.calls[0][0].occurred_at).toBe('2026-10-20T10:00:00.000Z')
  })
})

describe(`${NAME} migration`, () => {
  const sql = code(read(migrationsDir, `${NAME}.sql`))

  it('allows exactly the helper event names in the CHECK constraint', () => {
    const check = sql.match(/product_events_event_name_chk CHECK \(event_name IN \(([\s\S]*?)\)\)/)
    expect(check).not.toBeNull()
    const names = [...check![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    expect(names).toEqual([...PRODUCT_EVENT_NAMES])
  })

  it('enables RLS and creates no policy', () => {
    expect(sql).toMatch(/ALTER TABLE public\.product_events ENABLE ROW LEVEL SECURITY;/)
    expect(sql).not.toMatch(/CREATE POLICY/i)
  })

  it('revokes everything from anon and authenticated on the table and both views', () => {
    for (const rel of ['product_events', 'weekly_mastering_learners', 'weekly_cohort_retention']) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON TABLE public\\.${rel} FROM PUBLIC, anon, authenticated;`))
    }
  })

  it('grants nothing to anon or authenticated', () => {
    const grants = sql.match(/\bGRANT\b[^;]*;/g) ?? []
    expect(grants.length).toBeGreaterThan(0)
    for (const grant of grants) {
      const grantee = grant.slice(grant.lastIndexOf(' TO ') + 4)
      expect(grantee).toMatch(/^service_role;$/)
    }
  })

  it('creates the two lookup indexes', () => {
    expect(sql).toMatch(/ON public\.product_events \(event_name, occurred_at\)/)
    expect(sql).toMatch(/ON public\.product_events \(user_id, occurred_at\)/)
  })

  it('defines both views as security_invoker with the north-star rule', () => {
    expect(sql).toMatch(/CREATE OR REPLACE VIEW public\.weekly_mastering_learners\s+WITH \(security_invoker = true\)/)
    expect(sql).toMatch(/CREATE OR REPLACE VIEW public\.weekly_cohort_retention\s+WITH \(security_invoker = true\)/)
    expect(sql).toMatch(/>= 70/)
    expect(sql).toMatch(/event_name = 'capstone_submitted'/)
  })

  it('ships a rollback and a staging validation script', () => {
    const down = code(read(migrationsDir, 'rollback', `${NAME}.down.sql`))
    expect(down).toMatch(/DROP TABLE IF EXISTS public\.product_events;/)
    expect(down).toMatch(/DROP VIEW IF EXISTS public\.weekly_mastering_learners;/)
    expect(down).toMatch(/DROP VIEW IF EXISTS public\.weekly_cohort_retention;/)
    const validation = read(migrationsDir, 'validation', `${NAME}_validation.sql`)
    expect(validation).toMatch(/ROLLBACK;\s*$/)
  })
})

describe('north-star summary', () => {
  // Wednesday 2026-10-21 is in the ISO week starting Monday 2026-10-19.
  const wednesday = new Date('2026-10-21T15:00:00Z')

  it('finds the UTC Monday for any day of the week, Sunday included', () => {
    expect(isoWeekStartUtc(new Date('2026-10-19T00:00:00Z'))).toBe('2026-10-19')
    expect(isoWeekStartUtc(wednesday)).toBe('2026-10-19')
    expect(isoWeekStartUtc(new Date('2026-10-25T23:59:59Z'))).toBe('2026-10-19')
    expect(isoWeekStartUtc(new Date('2026-10-26T00:00:00Z'))).toBe('2026-10-26')
  })

  it('reports this week, last week and the percent trend', () => {
    const summary = summarizeNorthStar(
      [
        { week_start: '2026-10-19', mastering_learners: 15 },
        { week_start: '2026-10-12', mastering_learners: '10' },
        { week_start: '2026-10-05', mastering_learners: 99 },
      ],
      wednesday
    )
    expect(summary).toEqual({
      thisWeekStart: '2026-10-19',
      lastWeekStart: '2026-10-12',
      thisWeek: 15,
      lastWeek: 10,
      delta: 5,
      trendPct: 50,
    })
  })

  it('has no percent trend when last week was zero', () => {
    const summary = summarizeNorthStar([{ week_start: '2026-10-19', mastering_learners: 3 }], wednesday)
    expect(summary.lastWeek).toBe(0)
    expect(summary.delta).toBe(3)
    expect(summary.trendPct).toBeNull()
  })

  it('reads the two weeks from the view', async () => {
    inMock.mockResolvedValue({
      data: [
        { week_start: '2026-10-19', mastering_learners: 4 },
        { week_start: '2026-10-12', mastering_learners: 8 },
      ],
      error: null,
    })

    const slice = await loadNorthStar(wednesday)

    expect(fromMock).toHaveBeenCalledWith('weekly_mastering_learners')
    expect(inMock).toHaveBeenCalledWith('week_start', ['2026-10-12', '2026-10-19'])
    expect(slice).toMatchObject({ thisWeek: 4, lastWeek: 8, delta: -4, trendPct: -50, failed: false })
  })

  it('returns zeros with failed: true instead of throwing on a query error', async () => {
    inMock.mockResolvedValue({ data: null, error: { message: 'permission denied' } })

    const slice = await loadNorthStar(wednesday)

    expect(slice).toMatchObject({ thisWeek: 0, lastWeek: 0, trendPct: null, failed: true })
  })
})
