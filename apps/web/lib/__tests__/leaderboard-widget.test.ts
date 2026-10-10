import { describe, it, expect } from 'vitest'
import { toLeaderboardWidgetView, NO_ACTIVITY_HINT } from '@/lib/dashboard/leaderboard-widget'
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
