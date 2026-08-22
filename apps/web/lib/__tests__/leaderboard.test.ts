import { describe, it, expect } from 'vitest'
import { calculateWeekStart, calculateRankings, type RawLeaderboardUserMetric } from '../leaderboard'

describe('Leaderboard & Consistency Ranking Unit Test Suite', () => {
  describe('Monday Date Calculation', () => {
    it('calculateWeekStart computes correct Monday date string', () => {
      const testDate = new Date('2026-08-05T12:00:00Z')
      const monday = calculateWeekStart(testDate)
      expect(monday).toBe('2026-08-03')
    })
  })

  describe('Consistency-First Ranking Order', () => {
    it('calculateRankings ranks by daysStudied > lessonsCompleted > xpEarned', () => {
      const users: RawLeaderboardUserMetric[] = [
        {
          userId: 'user-c',
          username: 'charlie',
          name: 'Charlie',
          avatarUrl: null,
          levelTitle: 'PM',
          level: 3,
          daysStudied: 4,
          lessonsCompleted: 15,
          xpEarned: 500,
          currentStreak: 10,
        },
        {
          userId: 'user-a',
          username: 'alice',
          name: 'Alice',
          avatarUrl: null,
          levelTitle: 'Senior PM',
          level: 4,
          daysStudied: 6,
          lessonsCompleted: 8,
          xpEarned: 200,
          currentStreak: 6,
        },
        {
          userId: 'user-b',
          username: 'bob',
          name: 'Bob',
          avatarUrl: null,
          levelTitle: 'Junior PM',
          level: 2,
          daysStudied: 6,
          lessonsCompleted: 12,
          xpEarned: 300,
          currentStreak: 6,
        },
      ]

      const ranked = calculateRankings(users, 'user-b')

      expect(ranked[0].userId).toBe('user-b')
      expect(ranked[0].rank).toBe(1)
      expect(ranked[0].isCurrentUser).toBe(true)

      expect(ranked[1].userId).toBe('user-a')
      expect(ranked[1].rank).toBe(2)

      expect(ranked[2].userId).toBe('user-c')
      expect(ranked[2].rank).toBe(3)
    })
  })

  describe('Tie-breaking on XP', () => {
    it('calculateRankings uses XP as tie-breaker when days and lessons match', () => {
      const users: RawLeaderboardUserMetric[] = [
        {
          userId: 'user-1',
          username: 'u1',
          name: 'User 1',
          avatarUrl: null,
          levelTitle: 'PM',
          level: 3,
          daysStudied: 5,
          lessonsCompleted: 10,
          xpEarned: 250,
          currentStreak: 5,
        },
        {
          userId: 'user-2',
          username: 'u2',
          name: 'User 2',
          avatarUrl: null,
          levelTitle: 'PM',
          level: 3,
          daysStudied: 5,
          lessonsCompleted: 10,
          xpEarned: 400,
          currentStreak: 5,
        },
      ]

      const ranked = calculateRankings(users)

      expect(ranked[0].userId).toBe('user-2')
      expect(ranked[1].userId).toBe('user-1')
    })
  })
})
