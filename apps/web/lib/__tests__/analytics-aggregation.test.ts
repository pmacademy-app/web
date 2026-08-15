import assert from 'node:assert'
import {
  STREAK_BUCKETS,
  LEVEL_TIERS,
  buildStreakDistribution,
  computeActiveUserMetrics,
  computeModuleCompletionPct,
  computeNewVsReturning,
  computeLevelDistribution,
  computeXpBySource,
  computeQuizPerformanceStats,
  computeModuleDropOffs,
  buildDailyXpSeries,
  buildCertificateSeries,
} from '../admin/analytics-aggregation'
import { resolveRange } from '../admin/dashboard-aggregation'

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

console.log('🧪 Running Analytics & Insights Aggregation Unit Test Suite...\n')

const NOW = new Date('2026-08-15T12:00:00.000Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000).toISOString()

// ── 1. Active User Metrics ───────────────────────────────────────────────────

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

// ── 2. New vs Returning ───────────────────────────────────────────────────────

runTest('computeNewVsReturning splits the active set correctly', () => {
  const result = computeNewVsReturning({
    activeUserIds: new Set(['u1', 'u2', 'u3']),
    usersActiveBeforeWindow: new Set(['u1', 'u3']),
  })
  assert.strictEqual(result.returningLearners, 2)
  assert.strictEqual(result.newLearners, 1)
})

// ── 3. Streak Distribution ───────────────────────────────────────────────────

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

// ── 4. Module Completion ─────────────────────────────────────────────────────

runTest('computeModuleCompletionPct averages and clamps', () => {
  assert.strictEqual(computeModuleCompletionPct([]), 0)
  assert.strictEqual(computeModuleCompletionPct([{ completedPct: 50 }, { completedPct: 100 }]), 75)
  assert.strictEqual(computeModuleCompletionPct([{ completedPct: 120 }]), 100)
})

// ── 5. Level Distribution ────────────────────────────────────────────────────

runTest('computeLevelDistribution calculates counts and percentages accurately', () => {
  const users = [
    { level: 1 },
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: null }, // defaults to 1
    { level: 5 },
    { level: 10 }, // clamped to 5
  ]
  const levels = computeLevelDistribution(users)
  assert.strictEqual(levels.length, LEVEL_TIERS.length)

  const byLvl = Object.fromEntries(levels.map((l) => [l.level, l]))
  assert.strictEqual(byLvl[1].count, 3) // 2 explicit + 1 null
  assert.strictEqual(byLvl[2].count, 1)
  assert.strictEqual(byLvl[3].count, 1)
  assert.strictEqual(byLvl[4].count, 0)
  assert.strictEqual(byLvl[5].count, 2) // 1 explicit + 1 clamped

  // Check percentage sum ~ 100%
  const totalPct = levels.reduce((sum, l) => sum + l.percentage, 0)
  assert.ok(totalPct >= 99.5 && totalPct <= 100.5)
})

runTest('computeLevelDistribution handles empty users list', () => {
  const levels = computeLevelDistribution([])
  assert.strictEqual(levels.length, 5)
  assert.ok(levels.every((l) => l.count === 0 && l.percentage === 0))
})

// ── 6. XP by Source ──────────────────────────────────────────────────────────

runTest('computeXpBySource groups and calculates percentages in descending order', () => {
  const events = [
    { source: 'lesson', xp_amount: 100 },
    { source: 'lesson', xp_amount: 50 },
    { source: 'quiz', xp_amount: 50 },
    { source: 'streak', xp_amount: 25 },
    { source: 'unknown_custom_source', xp_amount: 25 },
  ]
  const sources = computeXpBySource(events)
  assert.ok(sources.length > 0)
  assert.strictEqual(sources[0].source, 'lesson')
  assert.strictEqual(sources[0].xp, 150)
  assert.strictEqual(sources[0].percentage, 60) // 150 / 250 = 60%

  assert.strictEqual(sources[1].source, 'quiz')
  assert.strictEqual(sources[1].xp, 50)
  assert.strictEqual(sources[1].percentage, 20)

  // Verify sorted order
  for (let i = 1; i < sources.length; i++) {
    assert.ok(sources[i - 1].xp >= sources[i].xp)
  }
})

runTest('computeXpBySource handles empty events array', () => {
  const sources = computeXpBySource([])
  assert.deepStrictEqual(sources, [])
})

// ── 7. Quiz Performance Stats ────────────────────────────────────────────────

runTest('computeQuizPerformanceStats computes pass rate and score distribution', () => {
  const attempts = [
    { is_correct: true, score: 95 },
    { is_correct: true, score: 85 },
    { is_correct: false, score: 60 },
    { is_correct: false, score: 40 },
  ]
  const stats = computeQuizPerformanceStats(attempts)
  assert.strictEqual(stats.totalAttempts, 4)
  assert.strictEqual(stats.passedAttempts, 2)
  assert.strictEqual(stats.passRatePct, 50)
  assert.strictEqual(stats.avgScorePct, 70) // (95 + 85 + 60 + 40) / 4 = 70

  const buckets = Object.fromEntries(stats.scoreDistribution.map((b) => [b.range, b.count]))
  assert.strictEqual(buckets['90–100%'], 1)
  assert.strictEqual(buckets['70–89%'], 1)
  assert.strictEqual(buckets['50–69%'], 1)
  assert.strictEqual(buckets['0–49%'], 1)
})

runTest('computeQuizPerformanceStats handles empty attempts array', () => {
  const stats = computeQuizPerformanceStats([])
  assert.strictEqual(stats.totalAttempts, 0)
  assert.strictEqual(stats.passedAttempts, 0)
  assert.strictEqual(stats.passRatePct, 0)
  assert.strictEqual(stats.avgScorePct, null)
  assert.ok(stats.scoreDistribution.every((b) => b.count === 0))
})

// ── 8. Module Drop-Off Analysis ──────────────────────────────────────────────

runTest('computeModuleDropOffs calculates started, completed and drop-off rates', () => {
  const modules = [
    { slug: 'mod-1', title: 'Module 1', order: 1, lessonIds: ['l1', 'l2'] },
    { slug: 'mod-2', title: 'Module 2', order: 2, lessonIds: ['l3', 'l4'] },
  ]
  const completions = [
    // User 1 completes both modules
    { user_id: 'u1', lesson_id: 'l1' },
    { user_id: 'u1', lesson_id: 'l2' },
    { user_id: 'u1', lesson_id: 'l3' },
    { user_id: 'u1', lesson_id: 'l4' },
    // User 2 completes only Module 1
    { user_id: 'u2', lesson_id: 'l1' },
    { user_id: 'u2', lesson_id: 'l2' },
    // User 3 starts Module 1 (1 lesson)
    { user_id: 'u3', lesson_id: 'l1' },
  ]
  const dropOffs = computeModuleDropOffs(modules, completions, 3)
  assert.strictEqual(dropOffs.length, 2)

  // Module 1: 3 started, 2 completed
  assert.strictEqual(dropOffs[0].learnersStarted, 3)
  assert.strictEqual(dropOffs[0].learnersCompleted, 2)
  assert.strictEqual(dropOffs[0].completionPct, 66.7)

  // Module 2: 1 started, 1 completed
  assert.strictEqual(dropOffs[1].learnersStarted, 1)
  assert.strictEqual(dropOffs[1].learnersCompleted, 1)
  assert.strictEqual(dropOffs[1].completionPct, 100)
})

// ── 9. Time-Series Series Bucketing ──────────────────────────────────────────

runTest('buildDailyXpSeries buckets events across range days', () => {
  const range = resolveRange('7d', null, null, 'UTC')
  const startDay = new Date(range.start).toISOString()
  const events = [
    { xp_amount: 100, created_at: startDay },
    { xp_amount: 50, created_at: startDay },
  ]
  const series = buildDailyXpSeries(events, range)
  assert.strictEqual(series.length, 7)
  const firstDay = series[0]
  assert.strictEqual(firstDay.xp, 150)
})

runTest('buildCertificateSeries buckets certificates across range days', () => {
  const range = resolveRange('7d', null, null, 'UTC')
  const startDay = new Date(range.start).toISOString()
  const certs = [
    { issued_at: startDay },
    { issued_at: startDay },
  ]
  const series = buildCertificateSeries(certs, range)
  assert.strictEqual(series.length, 7)
  const firstDay = series[0]
  assert.strictEqual(firstDay.count, 2)
})

console.log('✅ All 14 Analytics Aggregation Unit Tests Passed!\n')