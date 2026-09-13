/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * B8-B — regression suite for F-COR-2.
 *
 * `getTotalXp()` summed every `xp_events` row in JS. PostgREST caps an unbounded select
 * at 1000 rows and reports no error, so any user past that cap silently reported a
 * truncated total — and `awardXp()` derives the level transition from it, so the wrong
 * number also drove level-up notifications.
 *
 * The authoritative value is `users.total_xp`, maintained in SQL by the trigger in
 * migration 20260805000001.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getTotalXp } from '../xp/xp-service'

/** A ledger large enough that a client-side sum would be truncated. */
const LEDGER_ROWS = 2500
const PER_EVENT_XP = 10
const TRUE_TOTAL = LEDGER_ROWS * PER_EVENT_XP // 25_000
const TRUNCATED_TOTAL = 1000 * PER_EVENT_XP // 10_000 — what the old code returned

function makeSupabase(options: {
  userRow?: { total_xp: number | null } | null
  userError?: unknown
  ledgerRows?: { xp_amount: number }[]
  ledgerError?: unknown
}) {
  const calls: string[] = []

  const usersChain: any = {
    select: vi.fn(() => usersChain),
    eq: vi.fn(() => usersChain),
    maybeSingle: vi.fn(() =>
      Promise.resolve({
        data: options.userError ? null : (options.userRow ?? null),
        error: options.userError ?? null,
      })
    ),
  }

  let appliedLimit: number | null = null
  const ledgerChain: any = {
    select: vi.fn(() => ledgerChain),
    eq: vi.fn(() => ledgerChain),
    limit: vi.fn((n: number) => {
      appliedLimit = n
      return ledgerChain
    }),
    then: (resolve: any) => {
      const rows = options.ledgerRows ?? []
      const bounded = appliedLimit === null ? rows : rows.slice(0, appliedLimit)
      return resolve({
        data: options.ledgerError ? null : bounded,
        error: options.ledgerError ?? null,
      })
    },
  }

  const supabase: any = {
    from: vi.fn((table: string) => {
      calls.push(table)
      return table === 'users' ? usersChain : ledgerChain
    }),
  }

  return { supabase, calls, getAppliedLimit: () => appliedLimit }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('B8-B · getTotalXp reads the authoritative total (F-COR-2)', () => {
  it('returns users.total_xp for a user whose ledger exceeds the PostgREST row cap', async () => {
    const { supabase, calls } = makeSupabase({
      userRow: { total_xp: TRUE_TOTAL },
      ledgerRows: Array.from({ length: LEDGER_ROWS }, () => ({ xp_amount: PER_EVENT_XP })),
    })

    const total = await getTotalXp(supabase, 'usr-1')

    expect(total).toBe(TRUE_TOTAL)
    // The number the old client-side sum produced. Pinned so a regression is obvious.
    expect(total).not.toBe(TRUNCATED_TOTAL)
    expect(calls).toContain('users')
    expect(calls).not.toContain('xp_events')
  })

  it('reads the users table, not the ledger, on the happy path', async () => {
    const { supabase, calls } = makeSupabase({ userRow: { total_xp: 420 } })

    await expect(getTotalXp(supabase, 'usr-1')).resolves.toBe(420)
    expect(calls).toEqual(['users'])
  })

  it('treats a null total_xp as zero', async () => {
    const { supabase } = makeSupabase({ userRow: { total_xp: null } })
    await expect(getTotalXp(supabase, 'usr-1')).resolves.toBe(0)
  })

  it('returns zero for a genuine zero rather than falling through to the ledger', async () => {
    const { supabase, calls } = makeSupabase({
      userRow: { total_xp: 0 },
      ledgerRows: [{ xp_amount: 999 }],
    })

    await expect(getTotalXp(supabase, 'usr-1')).resolves.toBe(0)
    expect(calls).not.toContain('xp_events')
  })

  describe('fallback when the users row is unreadable', () => {
    it('falls back to the ledger when the users read errors', async () => {
      const { supabase, calls } = makeSupabase({
        userError: { message: 'connection reset' },
        ledgerRows: [{ xp_amount: 50 }, { xp_amount: 150 }, { xp_amount: 25 }],
      })

      await expect(getTotalXp(supabase, 'usr-1')).resolves.toBe(225)
      expect(calls).toEqual(['users', 'xp_events'])
    })

    it('falls back when the users row is missing', async () => {
      const { supabase } = makeSupabase({
        userRow: null,
        ledgerRows: [{ xp_amount: 70 }],
      })

      await expect(getTotalXp(supabase, 'usr-1')).resolves.toBe(70)
    })

    it('bounds the fallback query explicitly instead of inheriting the cap', async () => {
      const { supabase, getAppliedLimit } = makeSupabase({
        userRow: null,
        ledgerRows: Array.from({ length: LEDGER_ROWS }, () => ({ xp_amount: PER_EVENT_XP })),
      })

      await getTotalXp(supabase, 'usr-1')
      expect(getAppliedLimit()).toBe(1000)
    })

    it('returns zero when both the users row and the ledger fail', async () => {
      const { supabase } = makeSupabase({
        userError: { message: 'down' },
        ledgerError: { message: 'also down' },
      })

      await expect(getTotalXp(supabase, 'usr-1')).resolves.toBe(0)
    })
  })
})
