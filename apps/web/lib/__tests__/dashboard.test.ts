process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock-service-key'

import assert from 'node:assert'
import {
  resolveRange,
  eachDay,
  toDateKey,
  countByDay,
  countDistinctByDay,
  buildLearnerSeries,
  buildLearningSeries,
  mergeSeries,
  buildFunnel,
  computeTrend,
} from '../admin/dashboard-aggregation'

/**
 * All date assertions run against an explicit timezone so the suite is
 * deterministic on any machine (CI, dev laptops, Vercel). The dashboard
 * previously mixed local-time windows with UTC bucketing, which silently
 * dropped the last day of custom ranges and broke the "Today" preset for
 * non-UTC admins — these tests pin that behavior down.
 */
const TZ = 'UTC'

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

console.log('🧪 Running Dashboard Aggregation Unit Test Suite...\n')

runTest('resolveRange resolves 7d to a 7-day inclusive window', () => {
  const range = resolveRange('7d', null, null, TZ)
  assert.strictEqual(range.key, '7d')
  assert.strictEqual(eachDay(range).length, 7)
})

runTest('resolveRange resolves today to a single-day window', () => {
  const range = resolveRange('today', null, null, TZ)
  assert.strictEqual(eachDay(range).length, 1)
  // "today" starts at local midnight and ends at "now" — never in the future.
  assert.ok(range.start.getTime() <= range.end.getTime())
})

runTest('resolveRange resolves 30d and 90d windows', () => {
  assert.strictEqual(eachDay(resolveRange('30d', null, null, TZ)).length, 30)
  assert.strictEqual(eachDay(resolveRange('90d', null, null, TZ)).length, 90)
})

runTest('resolveRange custom uses provided bounds', () => {
  const range = resolveRange('custom', '2026-08-01', '2026-08-05', TZ)
  assert.strictEqual(eachDay(range).length, 5)
  assert.strictEqual(toDateKey(range.start, TZ), '2026-08-01')
  assert.strictEqual(toDateKey(range.end, TZ), '2026-08-05')
})

runTest('resolveRange custom end is inclusive of the full last day', () => {
  // Regression: the old implementation set `end = new Date('2026-08-05')`
  // which is 00:00 UTC — the entire last day was excluded from the window.
  const range = resolveRange('custom', '2026-08-01', '2026-08-05', TZ)
  assert.strictEqual(range.end.toISOString(), '2026-08-05T23:59:59.999Z')
  // A row at 23:59 on the last day must fall inside the window.
  const rows = [{ at: '2026-08-05T23:59:00Z' }]
  const counts = countByDay(rows, (r) => r.at, range)
  assert.strictEqual(counts.get('2026-08-05'), 1)
})

runTest('resolveRange custom normalizes an inverted range (from > to)', () => {
  const range = resolveRange('custom', '2026-08-10', '2026-08-01', TZ)
  assert.strictEqual(toDateKey(range.start, TZ), '2026-08-01')
  assert.strictEqual(toDateKey(range.end, TZ), '2026-08-10')
  assert.strictEqual(eachDay(range).length, 10)
  // Regression: the swap must happen BEFORE endOfDay so the ISO bounds cover
  // both full days (previously the first/last day were truncated to ~1ms).
  assert.strictEqual(range.start.toISOString(), '2026-08-01T00:00:00.000Z')
  assert.strictEqual(range.end.toISOString(), '2026-08-10T23:59:59.999Z')
  // A row at 23:59 on the last day must fall inside the window.
  const rows = [{ at: '2026-08-10T23:59:00Z' }]
  const counts = countByDay(rows, (r) => r.at, range)
  assert.strictEqual(counts.get('2026-08-10'), 1)
})

runTest('resolveRange custom falls back to 30d when bounds are missing', () => {
  const range = resolveRange('custom', null, null, TZ)
  assert.strictEqual(eachDay(range).length, 30)
})

runTest('countByDay buckets rows into calendar days', () => {
  const range = resolveRange('custom', '2026-08-01', '2026-08-03', TZ)
  const rows = [
    { at: '2026-08-01T10:00:00Z' },
    { at: '2026-08-01T22:00:00Z' },
    { at: '2026-08-02T05:00:00Z' },
    { at: '2026-08-09T05:00:00Z' }, // outside window -> ignored
  ]
  const counts = countByDay(rows, (r) => r.at, range)
  assert.strictEqual(counts.get('2026-08-01'), 2)
  assert.strictEqual(counts.get('2026-08-02'), 1)
  assert.strictEqual(counts.get('2026-08-03'), 0)
})

runTest('countByDay buckets by the range timezone, not UTC', () => {
  // 23:30 UTC on Aug 1 is already Aug 2 in UTC+2 — must bucket to Aug 2.
  const range = resolveRange('custom', '2026-08-01', '2026-08-02', 'Europe/Paris')
  const rows = [{ at: '2026-08-01T23:30:00Z' }]
  const counts = countByDay(rows, (r) => r.at, range)
  assert.strictEqual(counts.get('2026-08-01'), 0)
  assert.strictEqual(counts.get('2026-08-02'), 1)
})

runTest('countDistinctByDay counts unique values per day', () => {
  const range = resolveRange('custom', '2026-08-01', '2026-08-02', TZ)
  const rows = [
    { user_id: 'a', at: '2026-08-01T10:00:00Z' },
    { user_id: 'a', at: '2026-08-01T12:00:00Z' },
    { user_id: 'b', at: '2026-08-01T14:00:00Z' },
    { user_id: 'c', at: '2026-08-02T09:00:00Z' },
  ]
  const sets = countDistinctByDay(rows, (r) => r.at, (r) => r.user_id, range)
  assert.strictEqual(sets.get('2026-08-01')?.size, 2)
  assert.strictEqual(sets.get('2026-08-02')?.size, 1)
})

runTest('buildLearnerSeries computes new/active/returning per day', () => {
  const range = resolveRange('custom', '2026-08-01', '2026-08-02', TZ)
  const series = buildLearnerSeries({
    range,
    newUsers: [{ created_at: '2026-08-01T09:00:00Z' }, { created_at: '2026-08-02T09:00:00Z' }],
    xpEvents: [
      { user_id: 'a', created_at: '2026-08-01T10:00:00Z' },
      { user_id: 'b', created_at: '2026-08-01T11:00:00Z' },
      { user_id: 'a', created_at: '2026-08-02T10:00:00Z' },
    ],
    usersActiveBeforeWindow: new Set(['a']),
  })

  assert.strictEqual(series.length, 2)
  const day1 = series[0]
  const day2 = series[1]
  assert.strictEqual(day1.newUsers, 1)
  assert.strictEqual(day1.activeLearners, 2)
  assert.strictEqual(day1.returningLearners, 1) // 'a' was active before window
  assert.strictEqual(day2.newUsers, 1)
  assert.strictEqual(day2.activeLearners, 1)
  assert.strictEqual(day2.returningLearners, 1) // 'a' still returning
})

runTest('buildLearningSeries buckets lessons/quizzes/capstones', () => {
  const range = resolveRange('custom', '2026-08-01', '2026-08-01', TZ)
  const series = buildLearningSeries({
    range,
    lessonsCompleted: [{ completed_at: '2026-08-01T10:00:00Z' }, { completed_at: '2026-08-01T11:00:00Z' }],
    quizAttempts: [{ attempted_at: '2026-08-01T12:00:00Z' }],
    capstonesSubmitted: [{ submitted_at: '2026-08-01T13:00:00Z' }],
  })
  assert.strictEqual(series[0].lessonsCompleted, 2)
  assert.strictEqual(series[0].quizAttempts, 1)
  assert.strictEqual(series[0].capstonesSubmitted, 1)
})

runTest('buildLearnerSeries keys series by the range timezone, not the module default', () => {
  // 23:30 UTC on Aug 1 is already Aug 2 in UTC+2 — the series must bucket to Aug 2.
  const range = resolveRange('custom', '2026-08-01', '2026-08-02', 'Europe/Paris')
  const series = buildLearnerSeries({
    range,
    newUsers: [{ created_at: '2026-08-01T23:30:00Z' }],
    xpEvents: [{ user_id: 'a', created_at: '2026-08-01T23:30:00Z' }],
    usersActiveBeforeWindow: new Set(),
  })
  assert.strictEqual(series.length, 2)
  assert.strictEqual(series[0].date, '2026-08-01')
  assert.strictEqual(series[0].newUsers, 0)
  assert.strictEqual(series[0].activeLearners, 0)
  assert.strictEqual(series[1].date, '2026-08-02')
  assert.strictEqual(series[1].newUsers, 1)
  assert.strictEqual(series[1].activeLearners, 1)
})

runTest('buildLearningSeries keys series by the range timezone, not the module default', () => {
  const range = resolveRange('custom', '2026-08-01', '2026-08-02', 'Europe/Paris')
  const series = buildLearningSeries({
    range,
    lessonsCompleted: [{ completed_at: '2026-08-01T23:30:00Z' }],
    quizAttempts: [],
    capstonesSubmitted: [],
  })
  assert.strictEqual(series.length, 2)
  assert.strictEqual(series[0].date, '2026-08-01')
  assert.strictEqual(series[0].lessonsCompleted, 0)
  assert.strictEqual(series[1].date, '2026-08-02')
  assert.strictEqual(series[1].lessonsCompleted, 1)
})

runTest('mergeSeries combines learner and learning series by date', () => {
  const range = resolveRange('custom', '2026-08-01', '2026-08-01', TZ)
  const learner = buildLearnerSeries({
    range,
    newUsers: [{ created_at: '2026-08-01T09:00:00Z' }],
    xpEvents: [],
    usersActiveBeforeWindow: new Set(),
  })
  const learning = buildLearningSeries({
    range,
    lessonsCompleted: [{ completed_at: '2026-08-01T10:00:00Z' }],
    quizAttempts: [],
    capstonesSubmitted: [],
  })
  const merged = mergeSeries(learner, learning)
  assert.strictEqual(merged.length, 1)
  assert.strictEqual(merged[0].newUsers, 1)
  assert.strictEqual(merged[0].lessonsCompleted, 1)
})

runTest('buildFunnel computes conversion percentages', () => {
  const funnel = buildFunnel([
    { key: 'registered', label: 'Registered', count: 1000 },
    { key: 'onboarding', label: 'Onboarding', count: 800 },
    { key: 'first_lesson', label: 'First Lesson', count: 400 },
    { key: 'certificate', label: 'Certificate', count: 100 },
  ])
  assert.strictEqual(funnel[0].pctOfPrevious, null)
  assert.strictEqual(funnel[0].pctOverall, 100)
  assert.strictEqual(funnel[1].pctOfPrevious, 80)
  assert.strictEqual(funnel[1].pctOverall, 80)
  assert.strictEqual(funnel[2].pctOfPrevious, 50)
  assert.strictEqual(funnel[2].pctOverall, 40)
  assert.strictEqual(funnel[3].pctOfPrevious, 25)
  assert.strictEqual(funnel[3].pctOverall, 10)
})

runTest('buildFunnel handles zero baseline without division errors', () => {
  const funnel = buildFunnel([
    { key: 'registered', label: 'Registered', count: 0 },
    { key: 'onboarding', label: 'Onboarding', count: 0 },
  ])
  assert.strictEqual(funnel[0].pctOverall, 0)
  assert.strictEqual(funnel[1].pctOfPrevious, null)
  assert.strictEqual(funnel[1].pctOverall, 0)
})

runTest('computeTrend returns percentage delta or null', () => {
  assert.strictEqual(computeTrend(120, 100), 20)
  assert.strictEqual(computeTrend(80, 100), -20)
  assert.strictEqual(computeTrend(100, 0), null)
  assert.strictEqual(computeTrend(100, null), null)
  assert.strictEqual(computeTrend(100, undefined), null)
})

console.log('\n✅ All Dashboard Aggregation Unit Tests Passed Successfully!\n')