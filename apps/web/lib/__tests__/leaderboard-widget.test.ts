import { describe, it, expect } from 'vitest'
import { toLeaderboardRows, toLeaderboardWidgetView, NO_ACTIVITY_HINT } from '@/lib/dashboard/leaderboard-widget'
import type { LeaderboardEntry } from '@/lib/leaderboard'

function entry(overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    userId: 'user-1',
    username: 'learner',
    name: 'Learner',
    avatarUrl: null,
    levelTitle: 'Associate',
    level: 2,
    daysStudied: 3,
    lessonsCompleted: 4,
    xpEarned: 80,
    currentStreak: 3,
    rank: 7,
    positionChange: 0,
    isCurrentUser: true,
    ...overrides,
  }
}

describe('toLeaderboardWidgetView', () => {
  it('reports unavailable (not a fake Unranked · 0/7) when the payload is missing', () => {
    expect(toLeaderboardWidgetView(null)).toEqual({ status: 'unavailable' })
  })

  it('returns null (render nothing) when the learner opted out', () => {
    expect(toLeaderboardWidgetView({ isOptedIn: false, personalEntry: entry() })).toBeNull()
  })

  it('shows Unranked with the nudge when there is no personal entry', () => {
    expect(toLeaderboardWidgetView({ isOptedIn: true, personalEntry: null })).toEqual({
      status: 'available',
      rank: null,
      daysStudied: 0,
      hint: NO_ACTIVITY_HINT,
    })
  })

  it('suppresses a tie-break rank when the learner has no lesson-days this week', () => {
    expect(
      toLeaderboardWidgetView({ isOptedIn: true, personalEntry: entry({ rank: 212, daysStudied: 0 }) }),
    ).toEqual({ status: 'available', rank: null, daysStudied: 0, hint: NO_ACTIVITY_HINT })
  })

  it('maps rank and days studied from an active personal entry', () => {
    expect(
      toLeaderboardWidgetView({ isOptedIn: true, personalEntry: entry({ rank: 2, daysStudied: 5 }) }),
    ).toEqual({ status: 'available', rank: 2, daysStudied: 5, hint: null })
  })

  it('treats a non-positive rank as unranked without the no-activity nudge', () => {
    expect(
      toLeaderboardWidgetView({ isOptedIn: true, personalEntry: entry({ rank: 0, daysStudied: 2 }) }),
    ).toEqual({ status: 'available', rank: null, daysStudied: 2, hint: null })
  })

  it('reports unavailable, not Unranked, when the board was built from a failed query', () => {
    // A degraded build zeroes the metrics it could not load, so this learner's real
    // 5 days could just as easily have arrived as 0.
    expect(
      toLeaderboardWidgetView({
        isOptedIn: true,
        degraded: true,
        personalEntry: entry({ rank: 2, daysStudied: 5 }),
      }),
    ).toEqual({ status: 'unavailable' })
    expect(
      toLeaderboardWidgetView({
        isOptedIn: true,
        degraded: true,
        personalEntry: entry({ rank: 212, daysStudied: 0 }),
      }),
    ).toEqual({ status: 'unavailable' })
  })

  it('still renders nothing for an opted-out learner on a degraded board', () => {
    expect(toLeaderboardWidgetView({ isOptedIn: false, degraded: true, personalEntry: entry() })).toBeNull()
  })

  it('treats degraded: false exactly like an absent flag', () => {
    const active = entry({ rank: 2, daysStudied: 5 })
    expect(toLeaderboardWidgetView({ isOptedIn: true, degraded: false, personalEntry: active })).toEqual(
      toLeaderboardWidgetView({ isOptedIn: true, personalEntry: active }),
    )
    expect(toLeaderboardWidgetView({ isOptedIn: true, degraded: false, personalEntry: active })).toEqual({
      status: 'available',
      rank: 2,
      daysStudied: 5,
      hint: null,
    })
    expect(toLeaderboardWidgetView({ isOptedIn: true, degraded: false, personalEntry: null })).toEqual({
      status: 'available',
      rank: null,
      daysStudied: 0,
      hint: NO_ACTIVITY_HINT,
    })
  })

  it('uses the agreed nudge copy', () => {
    expect(NO_ACTIVITY_HINT).toBe('Complete a lesson this week to get ranked.')
  })
})

describe('toLeaderboardRows', () => {
  const other = (id: string, rank: number, days: number, name: string | null = `Name ${id}`) =>
    entry({ userId: id, rank, daysStudied: days, name, username: id, isCurrentUser: false })

  it('takes the top three learners who studied, in rank order', () => {
    const rows = toLeaderboardRows({ entries: [other('c', 3, 2), other('a', 1, 5), other('b', 2, 4), other('d', 4, 1)], personalEntry: null })
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3])
    expect(rows[0].name).toBe('Name a')
  })

  it('leaves out learners with no days studied', () => {
    expect(toLeaderboardRows({ entries: [other('a', 1, 0)], personalEntry: null })).toEqual([])
  })

  it('appends the learner as You when outside the top three', () => {
    const me = entry({ userId: 'me', rank: 9, daysStudied: 2 })
    const rows = toLeaderboardRows({ entries: [other('a', 1, 5), other('b', 2, 4), other('c', 3, 3), me], personalEntry: me })
    expect(rows).toHaveLength(4)
    expect(rows[3]).toMatchObject({ name: 'You', rank: 9, isYou: true })
  })

  it('marks the learner as You inside the top three without a duplicate', () => {
    const me = entry({ userId: 'me', rank: 2, daysStudied: 4 })
    const rows = toLeaderboardRows({ entries: [other('a', 1, 5), me, other('c', 3, 3)], personalEntry: me })
    expect(rows.filter((r) => r.isYou)).toHaveLength(1)
    expect(rows).toHaveLength(3)
  })

  it('falls back to @username when there is no name', () => {
    expect(toLeaderboardRows({ entries: [other('zed', 1, 3, null)], personalEntry: null })[0].name).toBe('@zed')
  })

  it('returns no rows for a missing payload', () => {
    expect(toLeaderboardRows(null)).toEqual([])
  })
})
