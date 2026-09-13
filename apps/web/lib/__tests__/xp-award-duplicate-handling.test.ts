/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * B8-E application half — `awardXp()` treats a unique violation as already-awarded.
 *
 * Migration 20260913000001 adds a PARTIAL unique index over the six once-only source
 * types. When the F-COR-3 race loses, the database refuses the second insert with
 * SQLSTATE 23505. That is a successful no-op, not a failure: the award already exists.
 *
 * These tests pin that it is swallowed, that no spurious level-up fires, and that every
 * other error still throws — the last being the one that would be easy to break.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { awardXp } from '../xp/xp-service'

const dispatch = vi.fn()

vi.mock('../notifications/dispatcher', () => ({
  globalNotificationDispatcher: { dispatch: (...a: any[]) => dispatch(...a) },
}))
vi.mock('../notifications/events/connectors', () => ({
  initializeNotificationConnectors: () => {},
}))

/**
 * @param insertError error the xp_events insert resolves with
 * @param currentTotal value users.total_xp reports before the award
 */
function makeSupabase(insertError: unknown, currentTotal = 0) {
  const inserted: any[] = []

  const usersChain: any = {
    select: vi.fn(() => usersChain),
    eq: vi.fn(() => usersChain),
    maybeSingle: vi.fn(() => Promise.resolve({ data: { total_xp: currentTotal }, error: null })),
  }

  const xpChain: any = {
    insert: vi.fn((row: any) => {
      inserted.push(row)
      return Promise.resolve({ data: null, error: insertError })
    }),
    select: vi.fn(() => xpChain),
    eq: vi.fn(() => xpChain),
    limit: vi.fn(() => xpChain),
    then: (resolve: any) => resolve({ data: [], error: null }),
  }

  const supabase: any = { from: vi.fn((t: string) => (t === 'users' ? usersChain : xpChain)) }
  return { supabase, inserted }
}

beforeEach(() => {
  dispatch.mockReset()
  vi.restoreAllMocks()
})

describe('B8-E · awardXp duplicate handling (SQLSTATE 23505)', () => {
  it('resolves without throwing when the insert hits a unique violation', async () => {
    const { supabase } = makeSupabase({ code: '23505', message: 'duplicate key value' })
    await expect(awardXp(supabase, 'user-1', 'theory_read', 10, 'les_1')).resolves.toBeUndefined()
  })

  it('does not fire a level-up notification for an award that did not land', async () => {
    // 245 XP is one 10 XP award below the level-2 threshold of 250, so a spurious
    // transition would be dispatched if the duplicate were treated as a success.
    const { supabase } = makeSupabase({ code: '23505', message: 'duplicate key value' }, 245)
    await awardXp(supabase, 'user-1', 'theory_read', 10, 'les_1')
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('still fires a level-up when the award actually lands', async () => {
    const { supabase } = makeSupabase(null, 245)
    await awardXp(supabase, 'user-1', 'theory_read', 10, 'les_1')
    expect(dispatch).toHaveBeenCalledTimes(1)
  })

  it('still throws on every other database error', async () => {
    const { supabase } = makeSupabase({ code: '08006', message: 'connection failure' })
    await expect(awardXp(supabase, 'user-1', 'theory_read', 10, 'les_1')).rejects.toThrow(
      'Failed to record XP event'
    )
  })

  it('still throws on a not-null violation', async () => {
    const { supabase } = makeSupabase({ code: '23502', message: 'null value in column' })
    await expect(awardXp(supabase, 'user-1', 'theory_read', 10, 'les_1')).rejects.toThrow()
  })

  it('throws rather than swallowing an error of an unexpected shape', async () => {
    const { supabase } = makeSupabase(new Error('something odd'))
    await expect(awardXp(supabase, 'user-1', 'theory_read', 10, 'les_1')).rejects.toThrow()
  })

  it('does not swallow a merely similar-looking code', async () => {
    const { supabase } = makeSupabase({ code: '2350', message: 'not a real code' })
    await expect(awardXp(supabase, 'user-1', 'theory_read', 10, 'les_1')).rejects.toThrow()
  })

  it('still attempts the insert with the correct payload', async () => {
    const { supabase, inserted } = makeSupabase({ code: '23505' })
    await awardXp(supabase, 'user-1', 'theory_read', 10, 'les_1')
    expect(inserted[0]).toMatchObject({
      user_id: 'user-1',
      source_type: 'theory_read',
      xp_amount: 10,
      source_id: 'les_1',
    })
  })

  it('is unaffected for source types the partial index does not cover', async () => {
    // quiz_correct is excluded from the index, so it can never raise 23505 — but if it
    // somehow did, treating it as already-awarded is still the safe outcome.
    const { supabase } = makeSupabase({ code: '23505' })
    await expect(awardXp(supabase, 'user-1', 'quiz_correct', 30, 'les_1')).resolves.toBeUndefined()
  })
})
