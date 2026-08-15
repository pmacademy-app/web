import assert from 'node:assert'
import {
  STREAK_BUCKETS,
  buildStreakDistribution,
  computeActiveUserMetrics,
  computeModuleCompletionPct,
  computeNewVsReturning,
} from '../admin/analytics-aggregation'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✕ ${name}`)
    console.error(err)
    process.exit(1)
  }
}

console.log('🧪 Running Learning Analytics Aggregation Unit Test Suite...\n')

const NOW = new Date('2026-08-15T12:00:00.000Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000).toISOString()

runTest('computeActiveUserMetrics counts distinct learners per trailing window', () => {
  const events = [
    { user_id: 'u1', created_at: hoursAgo(1) }, // DAU + WAU + MAU
    { user_id: 'u2', created_at: hoursAgo(12) }, // DAU + WAU + MAU
    { user_id: 'u3', created_at: hoursAgo(48) }, // WAU + MAU
    { user_id: 'u4', created_at: hoursAgo(10 * 24) }, // MAU
    { user_id: 'u5', created_at: hoursAgo(40 * 24) }, // outside all windows
    { user_id: 'u1', created_at: hoursAgo(2) }, // duplicate user
  ]
  const { dau, wau, mau } = computeActiveUserMetrics(events, NOW)
  assert.strictEqual(dau, 2)
  assert.strictEqual(wau, 3)
  assert.strictEqual(mau, 4)
})

runTest('computeActiveUserMetrics handles empty input', () => {
  const { dau, wau, mau } = computeActiveUserMetrics([], NOW)
  assert.strictEqual(dau, 0)
  assert.strictEqual(wau, 0)
  assert.strictEqual(mau, 0)
})

runTest('computeNewVsReturning splits the active set', () => {
  const result = computeNewVsReturning({
    activeUserIds: new Set(['u1', 'u2', 'u3']),
    usersActiveBeforeWindow: new Set(['u1', 'u3']),
  })
  assert.strictEqual(result.returningLearners, 2)
  assert.strictEqual(result.newLearners, 1)
})

runTest('buildStreakDistribution buckets users and preserves bucket order', () => {
  const users = [
    { current_streak: 0 },
    { current_streak: null },
    { current_streak: undefined },
    { current_streak: 2 },
    { current_streak: 5 },
    { current_streak: 12 },
    { current_streak: 20 },
    { current_streak: 45 },
  ]
  const buckets = buildStreakDistribution(users)
  assert.deepStrictEqual(
    buckets.map((b) => b.bucket),
    STREAK_BUCKETS.map((b) => b.bucket)
  )
  const byBucket = Object.fromEntries(buckets.map((b) => [b.bucket, b.count]))
  assert.strictEqual(byBucket['0 days'], 3)
  assert.strictEqual(byBucket['1–3 days'], 1)
  assert.strictEqual(byBucket['4–7 days'], 1)
  assert.strictEqual(byBucket['8–14 days'], 1)
  assert.strictEqual(byBucket['15–30 days'], 1)
  assert.strictEqual(byBucket['30+ days'], 1)
})

runTest('buildStreakDistribution handles empty input', () => {
  const buckets = buildStreakDistribution([])
  assert.ok(buckets.every((b) => b.count === 0))
  assert.strictEqual(buckets.length, STREAK_BUCKETS.length)
})

runTest('computeModuleCompletionPct averages and clamps', () => {
  assert.strictEqual(computeModuleCompletionPct([]), 0)
  assert.strictEqual(computeModuleCompletionPct([{ completedPct: 50 }, { completedPct: 100 }]), 75)
  assert.strictEqual(computeModuleCompletionPct([{ completedPct: 120 }]), 100)
})