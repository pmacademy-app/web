/**
 * Perf plan item 8: the dashboard hands the profile and lesson progress rows it already
 * loads to the streak and review-queue loaders, so one dashboard render reads `users` once
 * (getCurrentUserProfile) instead of three times and `user_lesson_progress` once instead of
 * twice. The loaders' old signatures keep working for every other caller, results unchanged.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../supabase'

const lessons: Record<string, string[]> = {
  'l-1': ['fc-l-1-1', 'fc-l-1-2'],
  'l-2': ['fc-l-2-1'],
  'l-3': ['fc-l-3-1'],
}

vi.mock('@/lib/lesson-loader', () => ({
  fetchCurriculumData: vi.fn(async () => ({ lessons: Object.keys(lessons).map((id) => ({ id, module: 'm' })) })),
  fetchCompiledLesson: vi.fn(async (id: string) => ({
    blocks: [{ type: 'flashcardDeck', cards: (lessons[id] ?? []).map((cid) => ({ id: cid, front: cid, back: 'b' })) }],
  })),
}))

import { getUserStreakStatus } from '../streaks/streaks-db'
import { getReviewQueueData } from '../flashcards-service'

type Row = Record<string, unknown>
interface Call {
  table: string
  columns: string
}

/** Minimal PostgREST stand-in that records every from() call and the columns selected. */
function recordingFake(tables: Record<string, Row[]>) {
  const calls: Call[] = []
  const client = {
    from(table: string) {
      const call: Call = { table, columns: '' }
      calls.push(call)
      const eqs: Array<[string, unknown]> = []
      let head = false
      let single = false
      const b: Record<string, unknown> = {}
      b.select = (columns: string, opts?: { head?: boolean }) => {
        call.columns = columns
        head = Boolean(opts?.head)
        return b
      }
      b.eq = (col: string, v: unknown) => {
        eqs.push([col, v])
        return b
      }
      for (const m of ['gte', 'order', 'limit', 'in']) b[m] = () => b
      b.maybeSingle = () => {
        single = true
        return b
      }
      b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
        let rows = tables[table] ?? []
        for (const [col, v] of eqs) rows = rows.filter((r) => r[col] === v)
        const result = head
          ? { count: 0, data: null, error: null }
          : single
            ? { data: rows[0] ?? null, error: null }
            : { data: rows, error: null }
        return Promise.resolve(result).then(resolve, reject)
      }
      return b
    },
  }
  return { client: client as unknown as SupabaseClient<Database>, calls }
}

const USER_ID = 'usr_dash'
const PROFILE = {
  id: USER_ID,
  timezone: 'Asia/Kolkata',
  current_streak: 3,
  longest_streak: 5,
  streak_freezes_available: 1,
  last_streak_date: '2026-11-17',
}
const PROGRESS = [
  { user_id: USER_ID, lesson_id: 'l-1', status: 'completed', quiz_score: 100, quiz_attempts: 1 },
  { user_id: USER_ID, lesson_id: 'l-2', status: 'in_progress', quiz_score: null, quiz_attempts: 0 },
]
const SRS = [
  { user_id: USER_ID, flashcard_id: 'fc-l-1-1', lesson_id: 'l-1', ease_factor: 2.6, next_review_at: '2026-11-20T00:00:00Z' },
  // An SRS row in a lesson with no progress unlocks that lesson.
  { user_id: USER_ID, flashcard_id: 'fc-l-3-1', lesson_id: 'l-3', ease_factor: 2.2, next_review_at: '2026-11-10T00:00:00Z' },
]

function tables(): Record<string, Row[]> {
  return { users: [PROFILE], user_lesson_progress: PROGRESS, user_flashcard_srs: SRS, xp_events: [] }
}

const count = (calls: Call[], table: string) => calls.filter((c) => c.table === table).length

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-18T06:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('getUserStreakStatus with a preloaded profile', () => {
  it('does not read users and returns the same summary as the self-loading call', async () => {
    const own = recordingFake(tables())
    const baseline = await getUserStreakStatus(own.client, USER_ID)
    expect(count(own.calls, 'users')).toBe(1)

    const shared = recordingFake(tables())
    const result = await getUserStreakStatus(shared.client, USER_ID, { profile: Promise.resolve(PROFILE) })
    expect(count(shared.calls, 'users')).toBe(0)
    expect(result).toEqual(baseline)
    expect(result.effectiveCurrentStreak).toBe(3)
  })

  it('treats a null profile (no row yet) as not started', async () => {
    const shared = recordingFake(tables())
    const result = await getUserStreakStatus(shared.client, USER_ID, { profile: null })
    expect(result.status).toBe('not_started')
    expect(shared.calls).toHaveLength(0)
  })

  it('throws when the preloaded profile read failed (CQ-01), so the caller can degrade', async () => {
    const shared = recordingFake(tables())
    await expect(
      getUserStreakStatus(shared.client, USER_ID, { profile: Promise.reject(new Error('timeout')) }),
    ).rejects.toThrow('Streak profile read failed: timeout')
  })
})

describe('getReviewQueueData with preloaded rows', () => {
  it('reads neither users nor user_lesson_progress, and returns the same queue', async () => {
    const own = recordingFake(tables())
    const baseline = await getReviewQueueData(own.client, USER_ID)
    expect(count(own.calls, 'users')).toBe(1)
    expect(count(own.calls, 'user_lesson_progress')).toBe(1)

    const shared = recordingFake(tables())
    const result = await getReviewQueueData(shared.client, USER_ID, {
      profile: Promise.resolve(PROFILE),
      progressRows: Promise.resolve(PROGRESS),
    })
    expect(count(shared.calls, 'users')).toBe(0)
    expect(count(shared.calls, 'user_lesson_progress')).toBe(0)
    expect(result).toEqual(baseline)
    // l-1 (2 cards), l-2 (1) and l-3 via its SRS row (1); fc-l-1-1 is not due yet.
    expect(result.allUnlockedCards.map((c) => c.id).sort()).toEqual(['fc-l-1-1', 'fc-l-1-2', 'fc-l-2-1', 'fc-l-3-1'])
    expect(result.dueCards.map((c) => c.id).sort()).toEqual(['fc-l-1-2', 'fc-l-2-1', 'fc-l-3-1'])
    expect(result.stats.averageRecallQuality).toBe(2.4)
  })

  it('selects only the SRS columns it uses, never *', async () => {
    const own = recordingFake(tables())
    await getReviewQueueData(own.client, USER_ID)
    const srsCall = own.calls.find((c) => c.table === 'user_flashcard_srs')
    expect(srsCall?.columns).toBe('flashcard_id, lesson_id, ease_factor, next_review_at')
  })

  it('falls back to UTC when the preloaded profile is null', async () => {
    const shared = recordingFake(tables())
    await expect(
      getReviewQueueData(shared.client, USER_ID, { profile: null, progressRows: PROGRESS }),
    ).resolves.toMatchObject({ stats: { totalUnlockedCount: 4 } })
    expect(count(shared.calls, 'users')).toBe(0)
  })

  it('throws when a preloaded read failed (CQ-07) instead of showing an empty queue', async () => {
    const shared = recordingFake(tables())
    await expect(
      getReviewQueueData(shared.client, USER_ID, {
        profile: PROFILE,
        progressRows: Promise.reject(new Error('progress down')),
      }),
    ).rejects.toThrow('progress down')
  })
})

describe('dashboard wiring', () => {
  const page = readFileSync(path.resolve(__dirname, '../../app/(app)/dashboard/page.tsx'), 'utf8')

  it('passes the shared profile and progress promises to the streak and review loaders', () => {
    expect(page).toMatch(/getUserStreakStatus\(supabase, authUser\.id, \{ profile: profilePromise \}\)/)
    expect(page).toMatch(
      /getReviewQueueData\(supabase, authUser\.id, \{ profile: profilePromise, progressRows: progressPromise \}\)/,
    )
  })

  it('reads users only through getCurrentUserProfile', () => {
    expect(page).not.toMatch(/from\('users'\)/)
  })
})
