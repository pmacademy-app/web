import assert from 'assert'
import { calculateWeekStart, calculateRankings, type RawLeaderboardUserMetric } from '../leaderboard'

console.log('🧪 Running Leaderboard & Consistency Ranking Unit Test Suite...\n')

let passedTests = 0

function runTest(name: string, fn: () => void) {
  try {
    fn()
    passedTests++
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✕ ${name}`)
    console.error(err)
    process.exit(1)
  }
}

// 1. Monday Date Calculation
runTest('calculateWeekStart computes correct Monday date string', () => {
  // Test with Wednesday Aug 5 2026
  const testDate = new Date('2026-08-05T12:00:00Z')
  const monday = calculateWeekStart(testDate)

  assert.strictEqual(monday, '2026-08-03', `Expected 2026-08-03 (Monday), got ${monday}`)
})

// 2. Consistency-First Ranking Order
runTest('calculateRankings ranks by daysStudied > lessonsCompleted > xpEarned', () => {
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
      daysStudied: 6, // Highest consistency
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
      lessonsCompleted: 12, // Same days as Alice, but more lessons
      xpEarned: 300,
      currentStreak: 6,
    },
  ]

  const ranked = calculateRankings(users, 'user-b')

  assert.strictEqual(ranked[0].userId, 'user-b', 'Bob should be #1 (6 days, 12 lessons)')
  assert.strictEqual(ranked[0].rank, 1)
  assert.strictEqual(ranked[0].isCurrentUser, true)

  assert.strictEqual(ranked[1].userId, 'user-a', 'Alice should be #2 (6 days, 8 lessons)')
  assert.strictEqual(ranked[1].rank, 2)

  assert.strictEqual(ranked[2].userId, 'user-c', 'Charlie should be #3 (4 days studied)')
  assert.strictEqual(ranked[2].rank, 3)
})

// 3. Tie-breaking on XP
runTest('calculateRankings uses XP as tie-breaker when days and lessons match', () => {
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
      xpEarned: 400, // Higher XP tie-breaker
      currentStreak: 5,
    },
  ]

  const ranked = calculateRankings(users)

  assert.strictEqual(ranked[0].userId, 'user-2')
  assert.strictEqual(ranked[1].userId, 'user-1')
})

console.log(`\n✅ All ${passedTests} Leaderboard Unit Tests Passed Successfully!\n`)
