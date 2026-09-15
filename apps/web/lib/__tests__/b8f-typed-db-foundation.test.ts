/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * B8-F — the typed data layer.
 *
 * The point of this batch is not that code moved into `lib/db/`. It is that the
 * `DBChain` cast, which erased the schema at every data-access site, is gone from
 * the two aggregates that carry correctness risk — so a wrong column name is now a
 * build failure instead of a silently-zero leaderboard (F-COR-1).
 *
 * A type-level guarantee cannot be asserted at runtime, so this suite proves it two
 * ways: structurally, that the escape hatch is absent from the migrated files, and
 * behaviourally, that the queries still issue the same shapes and that the newly
 * bounded cohort queries page to completion.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { fetchAllRows, POSTGREST_PAGE_SIZE, isUniqueViolation, unwrapRows, unwrapMaybe } from '@/lib/db'

vi.mock('@/lib/monitoring/logger', () => ({
  logErrorReport: vi.fn(),
  logSystemError: vi.fn(),
}))

// ─── The escape hatch is gone where it mattered ──────────────────────────────

const MIGRATED = [
  'lib/leaderboard-db.ts',
  'lib/xp/xp-service.ts',
  'lib/db/index.ts',
  'lib/db/xp.ts',
  'lib/db/leaderboard.ts',
  'lib/db/pagination.ts',
]

describe('B8-F — the migrated aggregates no longer defeat the generated types', () => {
  const read = (rel: string) =>
    readFileSync(path.resolve(import.meta.dirname, '../../', rel), 'utf8')

  /**
   * Source with comments removed.
   *
   * `lib/db/index.ts` quotes the `DBChain` anti-pattern verbatim to explain what the
   * layer exists to replace, so a plain substring match would flag the explanation
   * as the offence. What matters is whether the cast is *executed*.
   */
  const code = (rel: string) =>
    read(rel)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')

  for (const file of MIGRATED) {
    it(`${file} declares no DBChain and casts nothing through it`, () => {
      const source = code(file)

      expect(source).not.toContain('interface DBChain')
      expect(source).not.toContain('as unknown as DBChain')
    })
  }

  it('leaves no `as unknown as` anywhere in lib/db', () => {
    // B8-G turns this into a lint rule. Until then the assertion lives here so the
    // new layer cannot acquire the habit it was built to remove.
    for (const file of MIGRATED.filter((f) => f.startsWith('lib/db/'))) {
      expect(code(file), file).not.toContain('as unknown as')
    }
  })

  it('spells the XP column as xp_amount, the name F-COR-1 got wrong', () => {
    const source = read('lib/db/leaderboard.ts')

    expect(source).toContain("select('user_id, xp_amount, created_at')")
    expect(source).not.toMatch(/select\([^)]*\bamount\b(?!_)/)
  })
})

// ─── The primitives ──────────────────────────────────────────────────────────

describe('B8-F — fetchAllRows', () => {
  it('walks past the page cap and stops on a short page', async () => {
    const all = Array.from({ length: POSTGREST_PAGE_SIZE + 7 }, (_, i) => ({ i }))
    const windows: Array<[number, number]> = []

    const rows = await fetchAllRows<{ i: number }>((from, to) => {
      windows.push([from, to])
      return Promise.resolve({ data: all.slice(from, to + 1), error: null })
    })

    expect(rows).toHaveLength(POSTGREST_PAGE_SIZE + 7)
    expect(windows).toEqual([
      [0, POSTGREST_PAGE_SIZE - 1],
      [POSTGREST_PAGE_SIZE, POSTGREST_PAGE_SIZE * 2 - 1],
    ])
  })

  it('throws rather than returning a short answer when a page fails', async () => {
    await expect(
      fetchAllRows(() => Promise.resolve({ data: null, error: { message: 'boom' } }))
    ).rejects.toThrow('boom')
  })

  it('stops immediately on an empty first page', async () => {
    const rows = await fetchAllRows(() => Promise.resolve({ data: [], error: null }))
    expect(rows).toEqual([])
  })
})

describe('B8-F — error helpers', () => {
  it('unwrapRows refuses to let a failed read look like an empty one', () => {
    expect(() => unwrapRows({ data: null, error: { message: 'db down' } }, 'ctx')).toThrow(
      'ctx: db down'
    )
    expect(unwrapRows({ data: [], error: null }, 'ctx')).toEqual([])
  })

  it('unwrapMaybe distinguishes "no row" from "query failed"', () => {
    expect(unwrapMaybe({ data: null, error: null }, 'ctx')).toBeNull()
    expect(() => unwrapMaybe({ data: null, error: { message: 'nope' } }, 'ctx')).toThrow('ctx: nope')
  })

  it('recognises a unique violation by SQLSTATE, not by message', () => {
    expect(isUniqueViolation({ code: '23505', message: 'whatever' })).toBe(true)
    expect(isUniqueViolation({ code: '23503' })).toBe(false)
    expect(isUniqueViolation(new Error('duplicate key'))).toBe(false)
    expect(isUniqueViolation(null)).toBe(false)
    expect(isUniqueViolation(undefined)).toBe(false)
  })
})

// ─── The cohort queries are bounded now ──────────────────────────────────────

/** A fake that honours `.range()` so truncation is observable. */
function createDb(rowsByTable: Record<string, any[]>) {
  const ranges: Record<string, Array<[number, number]>> = {}
  const orders: Record<string, string[]> = {}

  const from = vi.fn((table: string) => {
    const chain: any = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      gt: vi.fn(() => chain),
      gte: vi.fn(() => chain),
      order: vi.fn((col: string) => {
        ;(orders[table] ||= []).push(col)
        return chain
      }),
      range: vi.fn((f: number, t: number) => {
        ;(ranges[table] ||= []).push([f, t])
        chain._window = [f, t]
        return chain
      }),
      maybeSingle: vi.fn(() => Promise.resolve({ data: rowsByTable[table]?.[0] ?? null, error: null })),
      single: vi.fn(() => Promise.resolve({ data: rowsByTable[table]?.[0] ?? null, error: null })),
      then: (resolve: any) => {
        const all = rowsByTable[table] ?? []
        const [f, t] = chain._window ?? [0, all.length - 1]
        return resolve({ data: all.slice(f, t + 1), error: null })
      },
    }
    return chain
  })

  return { db: { from } as any, ranges, orders }
}

describe('B8-F — cohort membership queries page to completion', () => {
  let leaderboardDb: typeof import('../db/leaderboard')

  beforeEach(async () => {
    vi.resetModules()
    leaderboardDb = await import('../db/leaderboard')
  })

  it('counts every membership rather than stopping at the row cap', async () => {
    const memberships = Array.from({ length: POSTGREST_PAGE_SIZE + 250 }, (_, i) => ({
      cohort_id: i % 2 === 0 ? 'c-a' : 'c-b',
    }))
    const { db, ranges } = createDb({ cohort_members: memberships })

    const rows = await leaderboardDb.selectAllCohortMemberships(db)

    // Before B8-F this was one unbounded select: 1000 rows, no error, and every
    // cohort's member count silently short by the remainder.
    expect(rows).toHaveLength(POSTGREST_PAGE_SIZE + 250)
    expect(ranges.cohort_members.length).toBeGreaterThan(1)
  })

  it('orders the paged membership scan so pages cannot repeat or skip rows', async () => {
    const { db, orders } = createDb({ cohort_members: [] })

    await leaderboardDb.selectAllCohortMemberships(db)

    expect(orders.cohort_members).toContain('cohort_id')
  })

  it('pages a single cohort roster and orders it', async () => {
    const members = Array.from({ length: POSTGREST_PAGE_SIZE + 3 }, (_, i) => ({
      user_id: `u-${i}`,
    }))
    const { db, ranges, orders } = createDb({ cohort_members: members })

    const rows = await leaderboardDb.selectCohortMemberIds(db, 'c-a')

    expect(rows).toHaveLength(POSTGREST_PAGE_SIZE + 3)
    expect(ranges.cohort_members.length).toBeGreaterThan(1)
    expect(orders.cohort_members).toContain('user_id')
  })
})

// ─── The weekly aggregation still behaves ────────────────────────────────────

describe('B8-F — the weekly queries kept their shapes', () => {
  it('bounds the roster, opt-outs, lesson progress and XP alike', async () => {
    vi.resetModules()
    const lb = await import('../db/leaderboard')
    const { db, ranges } = createDb({
      users: [{ id: 'u1', total_xp: 10 }],
      user_leaderboard_settings: [{ user_id: 'u2' }],
      user_lesson_progress: [{ user_id: 'u1', status: 'completed', completed_at: '2026-01-01' }],
      xp_events: [{ user_id: 'u1', xp_amount: 5, created_at: '2026-01-01' }],
    })

    await lb.selectRankedUsers(db)
    await lb.selectOptedOutUserIds(db)
    await lb.selectWeeklyLessonProgress(db, '2026-01-01')
    await lb.selectWeeklyXpEvents(db, '2026-01-01')

    for (const table of ['users', 'user_leaderboard_settings', 'user_lesson_progress', 'xp_events']) {
      expect(ranges[table], table).toBeDefined()
      expect(ranges[table][0]).toEqual([0, POSTGREST_PAGE_SIZE - 1])
    }
  })
})
