import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// PROD-15 base: server-side product events. The helper must never throw and must refuse names the
// DB would refuse; the migration must keep the table and views out of learner reach. The north-star
// tile that reads the views moved to the admin console repository with its tests.

const insertMock = vi.fn()
const fromMock = vi.fn((table: string) => {
  if (table === 'product_events') return { insert: insertMock }
  return {}
})
const createServiceRoleClientMock = vi.fn(() => ({ from: fromMock }))

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: () => createServiceRoleClientMock(),
}))

const logSystemErrorMock = vi.fn()
vi.mock('@/lib/monitoring/logger', () => ({
  logSystemError: (...args: unknown[]) => logSystemErrorMock(...args),
}))

import {
  PRODUCT_EVENT_NAMES,
  MAX_PRODUCT_EVENT_PROPERTIES_BYTES,
  trackProductEvent,
  type ProductEventName,
} from '@/lib/events/product-events'

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
