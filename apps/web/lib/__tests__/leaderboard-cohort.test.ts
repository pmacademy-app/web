/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest'
import { getWeeklyLeaderboard, getCohortLeaderboard } from '../leaderboard-db'

type TableResult = { data: unknown; error?: unknown; single?: { data: unknown; error?: unknown } }

/**
 * Generic chainable Supabase query-builder fake: every method call (select/eq/gt/in/gte/
 * order/etc.) returns the same object, and the object itself is awaitable (thenable),
 * resolving to the configured { data, error } for that table. `.maybeSingle()`/`.single()`
 * resolve to a separately-configured single-row result, since the same table is often
 * queried both as a list and as a single row within one code path.
 */
function chainable(result: { data: unknown; error?: unknown }, singleResult: { data: unknown; error?: unknown }) {
  const obj: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => void) => resolve(result)
        }
        if (prop === 'maybeSingle' || prop === 'single') {
          return () => chainable(singleResult, singleResult)
        }
        return (..._args: unknown[]) => obj
      },
    }
  )
  return obj
}

function createMockSupabase(tableResults: Record<string, TableResult>) {
  return {
    from: vi.fn((table: string) => {
      const config = tableResults[table] ?? { data: null, error: null }
      return chainable(config, config.single ?? { data: null, error: null })
    }),
  } as any
}

const baseUsers = [
  { id: 'user-a', username: 'alice', name: 'Alice', avatar_url: null, total_xp: 500, current_streak: 3, level: 3 },
  { id: 'user-b', username: 'bob', name: 'Bob', avatar_url: null, total_xp: 300, current_streak: 1, level: 2 },
  { id: 'user-c', username: 'carol', name: 'Carol', avatar_url: null, total_xp: 900, current_streak: 5, level: 4 },
]

describe('Leaderboard 2.0 — Cohort-Scoped Ranking & Privacy', () => {
  it('scopes ranking to cohort members only and re-ranks locally (not global rank)', async () => {
    const weekStart = '2026-01-05'
    const supabase = createMockSupabase({
      users: { data: baseUsers },
      user_leaderboard_settings: { data: [] }, // nobody opted out
      user_lesson_progress: {
        data: [
          { user_id: 'user-a', status: 'completed', completed_at: `${weekStart}T10:00:00Z` },
          { user_id: 'user-c', status: 'completed', completed_at: `${weekStart}T10:00:00Z` },
          { user_id: 'user-c', status: 'completed', completed_at: `${weekStart}T11:00:00Z` },
        ],
      },
      xp_events: {
        data: [
          { user_id: 'user-a', amount: 50, created_at: `${weekStart}T10:00:00Z` },
          { user_id: 'user-c', amount: 120, created_at: `${weekStart}T10:00:00Z` },
        ],
      },
      cohorts: { data: null, single: { data: { id: 'cohort-1', name: 'Foundations Cohort' } } },
      cohort_members: { data: [{ user_id: 'user-a' }, { user_id: 'user-b' }] }, // carol NOT in cohort
    })

    // Global ranking: carol (2 study days) should outrank alice (1 study day)
    const global = await getWeeklyLeaderboard(supabase, 'user-a', weekStart)
    expect(global.entries.map((e) => e.userId)).toEqual(['user-c', 'user-a', 'user-b'])

    // Cohort ranking: carol is excluded (not a member); only alice + bob remain, re-ranked
    const cohort = await getCohortLeaderboard(supabase, 'user-a', 'cohort-1', weekStart)
    expect(cohort.entries.map((e) => e.userId)).toEqual(['user-a', 'user-b'])
    expect(cohort.entries.every((e) => e.userId !== 'user-c')).toBe(true)
    expect(cohort.entries[0].rank).toBe(1)
    expect(cohort.isMember).toBe(true)
    expect(cohort.cohortName).toBe('Foundations Cohort')
    expect(cohort.personalEntry?.userId).toBe('user-a')

    // Switching scope must actually change the ranking data (different member sets/ranks)
    expect(cohort.entries.map((e) => e.userId)).not.toEqual(global.entries.map((e) => e.userId))
  })

  it('returns a useful empty state for a cohort with zero members', async () => {
    const weekStart = '2026-01-12'
    const supabase = createMockSupabase({
      users: { data: baseUsers },
      user_leaderboard_settings: { data: [] },
      user_lesson_progress: { data: [] },
      xp_events: { data: [] },
      cohorts: { data: null, single: { data: { id: 'cohort-empty', name: 'Empty Cohort' } } },
      cohort_members: { data: [] },
    })

    const cohort = await getCohortLeaderboard(supabase, 'user-a', 'cohort-empty', weekStart)
    expect(cohort.entries).toEqual([])
    expect(cohort.personalEntry).toBeNull()
    expect(cohort.isMember).toBe(false)
  })

  it('handles a one-member cohort correctly (self only)', async () => {
    const weekStart = '2026-01-19'
    const supabase = createMockSupabase({
      users: { data: baseUsers },
      user_leaderboard_settings: { data: [] },
      user_lesson_progress: { data: [] },
      xp_events: { data: [] },
      cohorts: { data: null, single: { data: { id: 'cohort-solo', name: 'Solo Cohort' } } },
      cohort_members: { data: [{ user_id: 'user-a' }] },
    })

    const cohort = await getCohortLeaderboard(supabase, 'user-a', 'cohort-solo', weekStart)
    expect(cohort.entries).toHaveLength(1)
    expect(cohort.entries[0].userId).toBe('user-a')
    expect(cohort.entries[0].rank).toBe(1)
    expect(cohort.isMember).toBe(true)
  })

  it('excludes opted-out users from public entries (global) except themselves', async () => {
    const weekStart = '2026-01-26'
    const supabase = createMockSupabase({
      users: { data: baseUsers },
      user_leaderboard_settings: {
        data: [{ user_id: 'user-c' }], // carol opted out (used by the exclusion-list query)
        single: { data: { is_opted_in: false, allow_friend_requests: true } }, // carol's own settings row
      },
      user_lesson_progress: { data: [] },
      xp_events: { data: [] },
    })

    // Viewed by alice: carol must not appear
    const asAlice = await getWeeklyLeaderboard(supabase, 'user-a', weekStart)
    expect(asAlice.entries.some((e) => e.userId === 'user-c')).toBe(false)

    // Viewed by carol herself: she still sees her own entry
    const asCarol = await getWeeklyLeaderboard(supabase, 'user-c', weekStart)
    expect(asCarol.entries.some((e) => e.userId === 'user-c')).toBe(true)
    expect(asCarol.isOptedIn).toBe(false)
  })

  it('excludes opted-out cohort members from public cohort entries except themselves', async () => {
    const weekStart = '2026-02-02'
    const supabase = createMockSupabase({
      users: { data: baseUsers },
      user_leaderboard_settings: { data: [{ user_id: 'user-b' }] }, // bob opted out
      user_lesson_progress: { data: [] },
      xp_events: { data: [] },
      cohorts: { data: null, single: { data: { id: 'cohort-1', name: 'Foundations Cohort' } } },
      cohort_members: { data: [{ user_id: 'user-a' }, { user_id: 'user-b' }] },
    })

    const cohort = await getCohortLeaderboard(supabase, 'user-a', 'cohort-1', weekStart)
    expect(cohort.entries.some((e) => e.userId === 'user-b')).toBe(false)
    expect(cohort.entries.some((e) => e.userId === 'user-a')).toBe(true)
  })
})
