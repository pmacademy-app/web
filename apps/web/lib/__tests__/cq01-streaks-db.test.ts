/**
 * CQ-01: streak reads must not hide database failures, and the weekly summary
 * must build its 7 day window by calendar day rather than by a mistyped
 * 84_600_000 ms "day" (23.5 hours), which produced a duplicate date and dropped
 * the oldest day once the local clock passed 21:00 in UTC+5:30.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../supabase'
import { getUserStreakStatus, getWeeklySummary, notStartedStreakStatus } from '../streaks-db'
import { MS_PER_DAY } from '../time'

type Result = { data: unknown; error: { message: string } | null }

interface MockOptions {
  profile?: Result
  timezone?: string
  xpEvents?: Array<{ source_type: string; xp_amount: number; created_at: string }>
  lessons?: Array<{ lesson_id: string; status: string; completed_at: string | null }>
}

function makeSupabase(options: MockOptions = {}) {
  const profile: Result = options.profile ?? {
    data: {
      timezone: options.timezone ?? 'Asia/Kolkata',
      current_streak: 3,
      longest_streak: 5,
      streak_freezes_available: 1,
      last_streak_date: '2026-10-19',
    },
    error: null,
  }
  const gteCalls: Array<{ table: string; column: string; value: string }> = []

  const from = vi.fn((table: string) => {
    let selected = ''
    const builder: Record<string, unknown> = {}
    const chain = () => builder
    builder.select = vi.fn((cols: string) => {
      selected = cols
      return builder
    })
    builder.eq = vi.fn(chain)
    builder.order = vi.fn(chain)
    builder.limit = vi.fn(chain)
    builder.gte = vi.fn((column: string, value: string) => {
      gteCalls.push({ table, column, value })
      return builder
    })
    const terminal = async (): Promise<Result> => {
      if (table === 'users') {
        if (selected === 'timezone') {
          return { data: { timezone: options.timezone ?? 'Asia/Kolkata' }, error: null }
        }
        return profile
      }
      return { data: null, error: null }
    }
    builder.single = vi.fn(terminal)
    builder.maybeSingle = vi.fn(terminal)
    builder.then = (resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve({
        data:
          table === 'xp_events'
            ? options.xpEvents ?? []
            : table === 'user_lesson_progress'
              ? options.lessons ?? []
              : [],
        error: null,
      }).then(resolve, reject)
    return builder
  })

  return {
    client: { from } as unknown as SupabaseClient<Database>,
    gteCalls,
  }
}

function expectedWindow(endDate: string): string[] {
  const [y, m, d] = endDate.split('-').map(Number)
  const days: string[] = []
  for (let i = 6; i >= 0; i--) {
    days.push(new Date(Date.UTC(y, m - 1, d - i)).toISOString().slice(0, 10))
  }
  return days
}

afterEach(() => {
  vi.useRealTimers()
})

describe('CQ-01 getUserStreakStatus', () => {
  it('rejects when the profile read returns an error', async () => {
    const { client } = makeSupabase({
      profile: { data: null, error: { message: 'connection reset' } },
    })
    await expect(getUserStreakStatus(client, 'user-1')).rejects.toThrow(
      'Streak profile read failed: connection reset'
    )
  })

  it('returns the not-started summary when the profile row is missing', async () => {
    const { client } = makeSupabase({ profile: { data: null, error: null } })
    const status = await getUserStreakStatus(client, 'user-1')
    expect(status).toEqual(notStartedStreakStatus())
    expect(status.status).toBe('not_started')
  })

  it('reads the profile with maybeSingle so a missing row is not an error', async () => {
    const { client } = makeSupabase({ profile: { data: null, error: null } })
    await getUserStreakStatus(client, 'user-1')
    const fromMock = client.from as unknown as ReturnType<typeof vi.fn>
    const usersBuilder = fromMock.mock.results[0].value as Record<string, ReturnType<typeof vi.fn>>
    expect(usersBuilder.maybeSingle).toHaveBeenCalled()
    expect(usersBuilder.single).not.toHaveBeenCalled()
  })
})

describe('CQ-01 getWeeklySummary calendar window', () => {
  const cases: Array<[string, string, string, string]> = [
    ['20:59 local in Asia/Kolkata', 'Asia/Kolkata', '2026-10-20T15:29:00.000Z', '2026-10-20'],
    ['21:01 local in Asia/Kolkata', 'Asia/Kolkata', '2026-10-20T15:31:00.000Z', '2026-10-20'],
    ['23:59 local across a month boundary', 'Asia/Kolkata', '2026-03-02T18:29:00.000Z', '2026-03-02'],
    ['23:30 local in America/Los_Angeles', 'America/Los_Angeles', '2026-10-21T06:30:00.000Z', '2026-10-20'],
    ['23:30 BST in Europe/London on the DST change day', 'Europe/London', '2026-03-29T22:30:00.000Z', '2026-03-29'],
    ['00:30 GMT in Europe/London before the DST change', 'Europe/London', '2026-03-29T00:30:00.000Z', '2026-03-29'],
    ['noon in Asia/Kolkata across a year boundary', 'Asia/Kolkata', '2026-01-03T06:30:00.000Z', '2026-01-03'],
  ]

  it.each(cases)('gives 7 distinct consecutive dates ending today at %s', async (_label, timezone, isoNow, today) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(isoNow))
    const { client, gteCalls } = makeSupabase({ timezone })

    const summary = await getWeeklySummary(client, 'user-1')
    const dates = summary.dailyActivityMap.map((d) => d.date)

    expect(dates).toHaveLength(7)
    expect(new Set(dates).size).toBe(7)
    expect(dates[6]).toBe(today)
    expect(dates).toEqual(expectedWindow(today))

    const lowerBound = new Date(new Date(isoNow).getTime() - 8 * MS_PER_DAY).toISOString()
    expect(gteCalls.length).toBeGreaterThan(0)
    for (const call of gteCalls) {
      expect(call.value).toBe(lowerBound)
    }
  })
})

describe('CQ-01 getWeeklySummary totals', () => {
  it('excludes rows older than the 7 day window from XP and lesson totals', async () => {
    // 21:01 local in Asia/Kolkata on 2026-10-20; the window is 2026-10-14 to 2026-10-20.
    const nowIso = '2026-10-20T15:31:00.000Z'
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(nowIso))
    const now = new Date(nowIso).getTime()
    const sevenAndHalfDaysAgo = new Date(now - 7.5 * MS_PER_DAY).toISOString()
    const oneDayAgo = new Date(now - MS_PER_DAY).toISOString()

    const { client } = makeSupabase({
      timezone: 'Asia/Kolkata',
      xpEvents: [
        { source_type: 'lesson', xp_amount: 40, created_at: sevenAndHalfDaysAgo },
        { source_type: 'lesson', xp_amount: 10, created_at: oneDayAgo },
      ],
      lessons: [
        { lesson_id: 'old', status: 'completed', completed_at: sevenAndHalfDaysAgo },
        { lesson_id: 'recent', status: 'completed', completed_at: oneDayAgo },
      ],
    })

    const summary = await getWeeklySummary(client, 'user-1')

    expect(summary.totalXpEarned).toBe(10)
    expect(summary.lessonsCompleted).toBe(1)
    expect(summary.daysStudied).toBe(1)
    expect(summary.dailyActivityMap.find((d) => d.date === '2026-10-19')?.xpEarned).toBe(10)
  })
})

describe('CQ-01 static guards', () => {
  it('MS_PER_DAY is a real 24 hour day', () => {
    expect(MS_PER_DAY).toBe(86_400_000)
  })

  it('streaks-db.ts no longer uses the 84600000 typo', () => {
    const source = readFileSync(join(__dirname, '..', 'streaks', 'streaks-db.ts'), 'utf8')
    expect(source).not.toMatch(/84_?600_?000/)
  })
})
