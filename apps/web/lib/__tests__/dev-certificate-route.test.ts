/**
 * Admin dev "generate test certificate" route.
 *
 * The route used to issue through the learner flow and then rename the returned row to
 * `TEST-…`. Once that flow returns a learner's existing certificate (any year), that
 * rename would corrupt a graduate's real credential: /verify 404s and the LinkedIn
 * link breaks. The route now inserts its own uniquely-coded TEST row and never touches
 * an existing one.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { fakeHolder } = vi.hoisted(() => ({ fakeHolder: { current: null as unknown } }))

vi.mock('@/lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, createServiceRoleClient: () => fakeHolder.current }
})

vi.mock('@/lib/admin/guard', () => ({
  requireAdminUser: vi.fn(async () => ({ authorized: true, userId: 'admin-1', email: 'admin@prodily.app' })),
  logAdminAction: vi.fn(async () => undefined),
}))

import { POST as generateTestCertificate } from '../../app/api/admin/dev/generate-test-certificate/route'
import { globalNotificationDispatcher } from '@/lib/notifications/dispatcher'

type Row = Record<string, unknown>
type DbError = { code?: string; message: string } | null
type MutationOp = 'update' | 'upsert' | 'delete'
type QueryOp = 'select' | 'insert' | MutationOp

/**
 * Strict in-memory Supabase.
 *
 * Models exactly the chains the dev route and `issueTestCertificate` use
 * (select / eq / insert, ending in single / maybeSingle / await) plus the three ways a
 * regression could touch an existing row: `update`, `upsert` and `delete` really change
 * `tables` and are recorded in `mutations`. Any other builder method throws, so an
 * unexpected chain fails the test instead of silently doing nothing.
 */
function createFakeSupabase(options: { certificates?: Row[]; insertError?: DbError } = {}) {
  const tables: Record<string, Row[]> = {
    users: [{ id: 'grad-1', email: 'grad@example.com', name: 'Grace Grad', username: 'grace', total_xp: 4500 }],
    user_lesson_progress: [],
    certificates: options.certificates ?? [],
  }
  const mutations: Array<{ table: string; op: MutationOp; values?: Row }> = []
  let idSeq = 0

  function from(table: string) {
    const filters: Array<(r: Row) => boolean> = []
    let op: QueryOp = 'select'
    let payload: Row = {}
    let conflictColumns: string[] = ['id']

    const rowsOf = () => (tables[table] ??= [])
    const matching = () => rowsOf().filter((r) => filters.every((f) => f(r)))

    function insertRow(): { rows: Row[]; error: DbError } {
      if (table === 'certificates') {
        if (options.insertError) return { rows: [], error: options.insertError }
        if (rowsOf().some((c) => c.certificate_code === payload.certificate_code)) {
          return { rows: [], error: { code: '23505', message: 'duplicate key' } }
        }
      }
      const row = { id: `${table}-${++idSeq}`, ...payload }
      rowsOf().push(row)
      return { rows: [row], error: null }
    }

    function run(): { rows: Row[]; error: DbError } {
      if (op === 'insert') return insertRow()
      if (op === 'update') {
        const rows = matching()
        for (const row of rows) Object.assign(row, payload)
        return { rows, error: null }
      }
      if (op === 'upsert') {
        const existing = rowsOf().find((r) =>
          conflictColumns.every((col) => payload[col] !== undefined && r[col] === payload[col])
        )
        if (!existing) return insertRow()
        Object.assign(existing, payload)
        return { rows: [existing], error: null }
      }
      if (op === 'delete') {
        const rows = matching()
        tables[table] = rowsOf().filter((r) => !rows.includes(r))
        return { rows, error: null }
      }
      return { rows: matching(), error: null }
    }

    async function exec(mode: 'single' | 'maybe' | 'many') {
      const { rows, error } = run()
      if (error) return { data: null, error }
      if (mode === 'many') return { data: rows, error: null }
      if (mode === 'single' && rows.length !== 1) return { data: null, error: { code: 'PGRST116', message: 'rows' } }
      return { data: rows[0] ?? null, error: null }
    }

    // Recorded when called, not when awaited: an un-awaited mutation is still a defect.
    function mutate(nextOp: MutationOp, values?: Row) {
      op = nextOp
      payload = values ?? {}
      mutations.push(values ? { table, op: nextOp, values } : { table, op: nextOp })
      return proxy
    }

    const builder: Record<string, unknown> = {
      select: () => proxy,
      eq: (col: string, val: unknown) => {
        filters.push((r) => r[col] === val)
        return proxy
      },
      insert: (row: Row) => {
        op = 'insert'
        payload = row
        return proxy
      },
      update: (values: Row) => mutate('update', values),
      upsert: (values: Row, upsertOptions?: { onConflict?: string }) => {
        if (upsertOptions?.onConflict) conflictColumns = upsertOptions.onConflict.split(',').map((c) => c.trim())
        return mutate('upsert', values)
      },
      delete: () => mutate('delete'),
      single: () => exec('single'),
      maybeSingle: () => exec('maybe'),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => exec('many').then(res, rej),
    }
    const proxy: Record<string, unknown> = new Proxy(builder, {
      get(target, prop) {
        if (typeof prop === 'symbol') return undefined
        if (prop in target) return target[prop]
        throw new Error(`fake supabase: unmodelled call .${prop}() on "${table}"`)
      },
    })
    return proxy
  }

  return { client: { from }, tables, mutations }
}

const REAL_PRIOR_YEAR_CERT: Readonly<Row> = Object.freeze({
  id: 'cert-real',
  user_id: 'grad-1',
  certificate_code: 'PMA-2025-REAL0001',
  type: 'full_curriculum',
  module_slug: null,
  learner_name: 'Grace Grad',
  level: 9,
  career_title: 'Principal PM',
  total_xp: 4500,
  lessons_completed: 90,
  modules_completed: 9,
  issued_at: '2025-11-01T00:00:00.000Z',
})

function post(body: Record<string, unknown> = { targetUserId: 'grad-1', type: 'full_curriculum' }) {
  return generateTestCertificate(
    new Request('https://prodily.app/api/admin/dev/generate-test-certificate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as never
  )
}

let dispatchSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  dispatchSpy = vi
    .spyOn(globalNotificationDispatcher, 'dispatch')
    .mockResolvedValue({ dispatched: true, handlerCount: 0, errors: [] })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/admin/dev/generate-test-certificate', () => {
  it("leaves a graduate's real prior-year certificate untouched and inserts a separate TEST row", async () => {
    const fake = createFakeSupabase({ certificates: [{ ...REAL_PRIOR_YEAR_CERT }] })
    fakeHolder.current = fake.client

    const res = await post()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ success: true, isTestCertificate: true, targetUserId: 'grad-1' })
    expect(body.certificateCode).toMatch(/^TEST-PMA-\d{4}-[A-F0-9]{8}-[A-F0-9]{6}$/)
    expect(body.verificationUrl).toContain(`/verify/${encodeURIComponent(body.certificateCode)}`)

    // The learner's real row is exactly what it was, and nothing tried to change it.
    const real = fake.tables.certificates.find((c) => c.id === 'cert-real')
    expect(real).toEqual(REAL_PRIOR_YEAR_CERT)
    expect(fake.mutations.filter((m) => m.table === 'certificates')).toEqual([])

    // The table is the original row plus one new TEST row, nothing else.
    expect(fake.tables.certificates).toHaveLength(2)
    const testRows = fake.tables.certificates.filter((c) => c.id !== 'cert-real')
    expect(testRows).toHaveLength(1)
    expect(testRows[0]).toMatchObject({
      certificate_code: body.certificateCode,
      user_id: 'grad-1',
      type: 'full_curriculum',
      module_slug: null,
    })
    expect(String(testRows[0].career_title).startsWith('[TEST] ')).toBe(true)
  })

  it('two runs create two distinct TEST rows and never a real-coded row', async () => {
    const fake = createFakeSupabase()
    fakeHolder.current = fake.client

    const first = await (await post()).json()
    const second = await (await post()).json()

    expect(first.success).toBe(true)
    expect(second.success).toBe(true)
    expect(first.certificateCode).not.toBe(second.certificateCode)
    expect(fake.tables.certificates).toHaveLength(2)
    expect(fake.tables.certificates.every((c) => String(c.certificate_code).startsWith('TEST-'))).toBe(true)
    expect(fake.mutations).toEqual([])

    const ids = dispatchSpy.mock.calls.map((c: unknown[]) => (c[0] as { payload: { certificateCode: string } }).payload.certificateCode)
    expect(ids).toEqual([first.certificateCode, second.certificateCode])
  })

  it('returns an error response and dispatches nothing when the insert fails', async () => {
    const fake = createFakeSupabase({ insertError: { code: '42501', message: 'permission denied' } })
    fakeHolder.current = fake.client

    const res = await post()
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body).toMatchObject({ success: false, code: 'ISSUE_FAILED' })
    expect(body.error).not.toContain('permission denied')
    expect(fake.tables.certificates).toHaveLength(0)
    expect(dispatchSpy).not.toHaveBeenCalled()
  })

  it('rejects an unknown certificate type with 400', async () => {
    const fake = createFakeSupabase()
    fakeHolder.current = fake.client

    const res = await post({ targetUserId: 'grad-1', type: 'bogus' })

    expect(res.status).toBe(400)
    expect(fake.tables.certificates).toHaveLength(0)
    expect(dispatchSpy).not.toHaveBeenCalled()
  })
})

/**
 * The assertions above only mean something if the fake notices a touched row. These pin
 * that: each way of changing an existing certificate changes `tables` and is recorded,
 * and a chain the fake does not model throws.
 */
describe('strict Supabase fake (guards the regression test above)', () => {
  type Chain = Record<string, (...args: unknown[]) => Chain> & PromiseLike<{ data: unknown; error: DbError }>

  function seeded() {
    const fake = createFakeSupabase({ certificates: [{ ...REAL_PRIOR_YEAR_CERT }] })
    const certificates = () => fake.client.from('certificates') as unknown as Chain
    const real = () => fake.tables.certificates.find((c) => c.id === 'cert-real')
    return { fake, certificates, real }
  }

  it('update rewrites the matching row and is recorded', async () => {
    const { fake, certificates, real } = seeded()

    await certificates().update({ certificate_code: 'TEST-RENAMED' }).eq('id', 'cert-real')

    expect(real()).not.toEqual(REAL_PRIOR_YEAR_CERT)
    expect(real()?.certificate_code).toBe('TEST-RENAMED')
    expect(fake.mutations).toEqual([
      { table: 'certificates', op: 'update', values: { certificate_code: 'TEST-RENAMED' } },
    ])
  })

  it('upsert overwrites the conflicting row and is recorded', async () => {
    const { fake, certificates, real } = seeded()

    await certificates().upsert({ id: 'cert-real', career_title: '[TEST] Principal PM' })

    expect(real()).not.toEqual(REAL_PRIOR_YEAR_CERT)
    expect(real()?.career_title).toBe('[TEST] Principal PM')
    expect(fake.tables.certificates).toHaveLength(1)
    expect(fake.mutations.map((m) => m.op)).toEqual(['upsert'])
  })

  it('upsert honours onConflict columns', async () => {
    const { fake, certificates, real } = seeded()

    await certificates().upsert(
      { user_id: 'grad-1', type: 'full_curriculum', certificate_code: 'TEST-OVERWRITE' },
      { onConflict: 'user_id,type' }
    )

    expect(real()?.certificate_code).toBe('TEST-OVERWRITE')
    expect(fake.tables.certificates).toHaveLength(1)
  })

  it('delete removes the matching row and is recorded', async () => {
    const { fake, certificates, real } = seeded()

    await certificates().delete().eq('user_id', 'grad-1')

    expect(real()).toBeUndefined()
    expect(fake.tables.certificates).toHaveLength(0)
    expect(fake.mutations).toEqual([{ table: 'certificates', op: 'delete' }])
  })

  it('throws on a builder method it does not model', () => {
    const { certificates } = seeded()

    expect(() => certificates().select('*').order('issued_at')).toThrow(
      'fake supabase: unmodelled call .order() on "certificates"'
    )
  })
})
