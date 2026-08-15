import assert from 'node:assert'
import {
  TOTAL_LESSONS,
  buildModuleProgress,
  buildUserActivityTimeline,
  clampPct,
  computeProgressPct,
  computeQuizAvgScore,
  describeUserFilter,
  parseUserFilters,
  serializeUserFilters,
} from '../admin/users-aggregation'
import type { CurriculumEntry } from '@/types'

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

console.log('🧪 Running Users Workspace Aggregation Unit Test Suite...\n')

runTest('computeProgressPct clamps to 0–100 and rounds to one decimal', () => {
  assert.strictEqual(computeProgressPct(0), 0)
  assert.strictEqual(computeProgressPct(45), 50)
  assert.strictEqual(computeProgressPct(90), 100)
  assert.strictEqual(computeProgressPct(120), 100)
  assert.strictEqual(computeProgressPct(-5), 0)
  assert.strictEqual(computeProgressPct(1), 1.1)
})

runTest('computeProgressPct short-circuits to 100 with the completion badge', () => {
  assert.strictEqual(computeProgressPct(0, true), 100)
  assert.strictEqual(computeProgressPct(50, true), 100)
})

runTest('clampPct handles non-finite input', () => {
  assert.strictEqual(clampPct(Number.NaN), 0)
  assert.strictEqual(clampPct(Number.POSITIVE_INFINITY), 100)
})

runTest('buildModuleProgress groups lessons by module and counts completion', () => {
  const curriculum: CurriculumEntry[] = [
    { id: 'les_a', slug: 'a', title: 'A', module: 'foundations', order: 1, difficulty: 1, estimatedReadingTime: 10, estimatedCompletionTime: 15, prerequisites: [] },
    { id: 'les_b', slug: 'b', title: 'B', module: 'foundations', order: 2, difficulty: 1, estimatedReadingTime: 10, estimatedCompletionTime: 15, prerequisites: [] },
    { id: 'les_c', slug: 'c', title: 'C', module: 'discovery', order: 1, difficulty: 1, estimatedReadingTime: 10, estimatedCompletionTime: 15, prerequisites: [] },
  ]

  const modules = buildModuleProgress(new Set(['les_a']), curriculum)
  assert.strictEqual(modules.length, 2)

  const foundations = modules.find((m) => m.slug === 'foundations')
  assert.ok(foundations)
  assert.strictEqual(foundations.lessonsTotal, 2)
  assert.strictEqual(foundations.lessonsCompleted, 1)
  assert.strictEqual(foundations.completedPct, 50)

  const discovery = modules.find((m) => m.slug === 'discovery')
  assert.ok(discovery)
  assert.strictEqual(discovery.lessonsCompleted, 0)
  assert.strictEqual(discovery.completedPct, 0)
})

runTest('buildModuleProgress omits modules with no curriculum lessons', () => {
  const modules = buildModuleProgress(new Set(), [])
  assert.deepStrictEqual(modules, [])
})

runTest('computeQuizAvgScore returns percentage or null for empty attempts', () => {
  assert.strictEqual(computeQuizAvgScore([]), null)
  assert.strictEqual(computeQuizAvgScore([{ is_correct: true }, { is_correct: false }]), 50)
  assert.strictEqual(computeQuizAvgScore([{ is_correct: true }, { is_correct: true }]), 100)
})

runTest('buildUserActivityTimeline sorts newest-first, skips null timestamps, caps at limit', () => {
  const timeline = buildUserActivityTimeline(
    [
      { type: 'lesson_completed', label: 'Completed lesson', detail: 'L1', timestamp: '2026-01-01T00:00:00Z' },
      { type: 'badge_earned', label: 'Earned badge', detail: 'B1', timestamp: '2026-03-01T00:00:00Z' },
      { type: 'quiz_attempted', label: 'Attempted quiz', detail: 'Q1', timestamp: null },
      { type: 'certificate_issued', label: 'Certificate issued', detail: 'C1', timestamp: '2026-02-01T00:00:00Z' },
    ],
    2
  )

  assert.strictEqual(timeline.length, 2)
  assert.strictEqual(timeline[0].type, 'badge_earned')
  assert.strictEqual(timeline[1].type, 'certificate_issued')
})

runTest('parseUserFilters extracts valid values and ignores invalid ones', () => {
  const filters = parseUserFilters({
    verification: 'verified',
    role: 'admin',
    activity: 'active',
    progress: 'started',
    minLevel: '5',
    joinedFrom: '2026-01-01',
    sort: 'totalXp',
    sortDir: 'asc',
    bogus: 'nope',
  })

  assert.strictEqual(filters.verification, 'verified')
  assert.strictEqual(filters.role, 'admin')
  assert.strictEqual(filters.activity, 'active')
  assert.strictEqual(filters.progress, 'started')
  assert.strictEqual(filters.minLevel, 5)
  assert.strictEqual(filters.joinedFrom, '2026-01-01')
  assert.strictEqual(filters.sort, 'totalXp')
  assert.strictEqual(filters.sortDir, 'asc')
  assert.strictEqual((filters as Record<string, unknown>).bogus, undefined)

  const empty = parseUserFilters({})
  assert.strictEqual(empty.verification, undefined)
  assert.strictEqual(empty.sort, undefined)
})

runTest('parseUserFilters rejects malformed date filters', () => {
  const filters = parseUserFilters({
    joinedFrom: 'not-a-date',
    joinedTo: '2026/01/01',
    activeFrom: '2026-13-99',
    activeTo: '2026-01-01',
  })

  assert.strictEqual(filters.joinedFrom, undefined)
  assert.strictEqual(filters.joinedTo, undefined)
  assert.strictEqual(filters.activeFrom, undefined)
  assert.strictEqual(filters.activeTo, '2026-01-01')
})

runTest('buildUserActivityTimeline produces unique ids for identical events', () => {
  const timeline = buildUserActivityTimeline([
    { type: 'quiz_attempted', label: 'Attempted quiz', detail: 'L1', timestamp: '2026-01-01T00:00:00Z' },
    { type: 'quiz_attempted', label: 'Attempted quiz', detail: 'L1', timestamp: '2026-01-01T00:00:00Z' },
  ])

  assert.strictEqual(timeline.length, 2)
  assert.notStrictEqual(timeline[0].id, timeline[1].id)
})

runTest('serializeUserFilters round-trips through parseUserFilters', () => {
  const filters = {
    verification: 'unverified' as const,
    role: 'learner' as const,
    progress: 'completed' as const,
    minLevel: 3,
    sort: 'level' as const,
    sortDir: 'desc' as const,
  }
  const serialized = serializeUserFilters(filters)
  const reparsed = parseUserFilters(serialized)
  assert.strictEqual(reparsed.verification, filters.verification)
  assert.strictEqual(reparsed.role, filters.role)
  assert.strictEqual(reparsed.progress, filters.progress)
  assert.strictEqual(reparsed.minLevel, filters.minLevel)
  assert.strictEqual(reparsed.sort, filters.sort)
  assert.strictEqual(reparsed.sortDir, filters.sortDir)
})

runTest('describeUserFilter produces human-readable chips', () => {
  const chips = describeUserFilter({
    verification: 'verified',
    role: 'admin',
    activity: 'active',
    progress: 'started',
    minLevel: 4,
    joinedFrom: '2026-01-01',
    joinedTo: '2026-02-01',
  })
  assert.ok(chips.includes('Verified'))
  assert.ok(chips.includes('Admins'))
  assert.ok(chips.includes('Active (30d)'))
  assert.ok(chips.includes('In progress'))
  assert.ok(chips.includes('Level 4+'))
  assert.ok(chips.some((c) => c.startsWith('Joined')))
})

runTest('TOTAL_LESSONS matches the curriculum denominator', () => {
  assert.strictEqual(TOTAL_LESSONS, 90)
})

console.log('\n✅ All Users Workspace Aggregation Unit Tests Passed Successfully!\n')