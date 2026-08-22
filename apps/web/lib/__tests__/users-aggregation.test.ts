import { describe, it, expect } from 'vitest'
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

describe('Users Workspace Aggregation Unit Test Suite', () => {
  it('computeProgressPct clamps to 0–100 and rounds to one decimal', () => {
    expect(computeProgressPct(0)).toBe(0)
    expect(computeProgressPct(45)).toBe(50)
    expect(computeProgressPct(90)).toBe(100)
    expect(computeProgressPct(120)).toBe(100)
    expect(computeProgressPct(-5)).toBe(0)
    expect(computeProgressPct(1)).toBe(1.1)
  })

  it('computeProgressPct short-circuits to 100 with the completion badge', () => {
    expect(computeProgressPct(0, true)).toBe(100)
    expect(computeProgressPct(50, true)).toBe(100)
  })

  it('clampPct handles non-finite input', () => {
    expect(clampPct(Number.NaN)).toBe(0)
    expect(clampPct(Number.POSITIVE_INFINITY)).toBe(100)
  })

  it('buildModuleProgress groups lessons by module and counts completion', () => {
    const curriculum: CurriculumEntry[] = [
      { id: 'les_a', slug: 'a', title: 'A', module: 'foundations', order: 1, difficulty: 1, estimatedReadingTime: 10, estimatedCompletionTime: 15, prerequisites: [] },
      { id: 'les_b', slug: 'b', title: 'B', module: 'foundations', order: 2, difficulty: 1, estimatedReadingTime: 10, estimatedCompletionTime: 15, prerequisites: [] },
      { id: 'les_c', slug: 'c', title: 'C', module: 'discovery', order: 1, difficulty: 1, estimatedReadingTime: 10, estimatedCompletionTime: 15, prerequisites: [] },
    ]

    const modules = buildModuleProgress(new Set(['les_a']), curriculum)
    expect(modules.length).toBe(2)

    const foundations = modules.find((m) => m.slug === 'foundations')
    expect(foundations).toBeDefined()
    expect(foundations?.lessonsTotal).toBe(2)
    expect(foundations?.lessonsCompleted).toBe(1)
    expect(foundations?.completedPct).toBe(50)

    const discovery = modules.find((m) => m.slug === 'discovery')
    expect(discovery).toBeDefined()
    expect(discovery?.lessonsCompleted).toBe(0)
    expect(discovery?.completedPct).toBe(0)
  })

  it('buildModuleProgress omits modules with no curriculum lessons', () => {
    const modules = buildModuleProgress(new Set(), [])
    expect(modules).toEqual([])
  })

  it('computeQuizAvgScore returns percentage or null for empty attempts', () => {
    expect(computeQuizAvgScore([])).toBeNull()
    expect(computeQuizAvgScore([{ is_correct: true }, { is_correct: false }])).toBe(50)
    expect(computeQuizAvgScore([{ is_correct: true }, { is_correct: true }])).toBe(100)
  })

  it('buildUserActivityTimeline sorts newest-first, skips null timestamps, caps at limit', () => {
    const timeline = buildUserActivityTimeline(
      [
        { type: 'lesson_completed', label: 'Completed lesson', detail: 'L1', timestamp: '2026-01-01T00:00:00Z' },
        { type: 'badge_earned', label: 'Earned badge', detail: 'B1', timestamp: '2026-03-01T00:00:00Z' },
        { type: 'quiz_attempted', label: 'Attempted quiz', detail: 'Q1', timestamp: null },
        { type: 'certificate_issued', label: 'Certificate issued', detail: 'C1', timestamp: '2026-02-01T00:00:00Z' },
      ],
      2
    )

    expect(timeline.length).toBe(2)
    expect(timeline[0].type).toBe('badge_earned')
    expect(timeline[1].type).toBe('certificate_issued')
  })

  it('parseUserFilters extracts valid values and ignores invalid ones', () => {
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

    expect(filters.verification).toBe('verified')
    expect(filters.role).toBe('admin')
    expect(filters.activity).toBe('active')
    expect(filters.progress).toBe('started')
    expect(filters.minLevel).toBe(5)
    expect(filters.joinedFrom).toBe('2026-01-01')
    expect(filters.sort).toBe('totalXp')
    expect(filters.sortDir).toBe('asc')
    expect((filters as Record<string, unknown>).bogus).toBeUndefined()

    const empty = parseUserFilters({})
    expect(empty.verification).toBeUndefined()
    expect(empty.sort).toBeUndefined()
  })

  it('parseUserFilters rejects malformed date filters', () => {
    const filters = parseUserFilters({
      joinedFrom: 'not-a-date',
      joinedTo: '2026/01/01',
      activeFrom: '2026-13-99',
      activeTo: '2026-01-01',
    })

    expect(filters.joinedFrom).toBeUndefined()
    expect(filters.joinedTo).toBeUndefined()
    expect(filters.activeFrom).toBeUndefined()
    expect(filters.activeTo).toBe('2026-01-01')
  })

  it('buildUserActivityTimeline produces unique ids for identical events', () => {
    const timeline = buildUserActivityTimeline([
      { type: 'quiz_attempted', label: 'Attempted quiz', detail: 'L1', timestamp: '2026-01-01T00:00:00Z' },
      { type: 'quiz_attempted', label: 'Attempted quiz', detail: 'L1', timestamp: '2026-01-01T00:00:00Z' },
    ])

    expect(timeline.length).toBe(2)
    expect(timeline[0].id).not.toBe(timeline[1].id)
  })

  it('serializeUserFilters round-trips through parseUserFilters', () => {
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
    expect(reparsed.verification).toBe(filters.verification)
    expect(reparsed.role).toBe(filters.role)
    expect(reparsed.progress).toBe(filters.progress)
    expect(reparsed.minLevel).toBe(filters.minLevel)
    expect(reparsed.sort).toBe(filters.sort)
    expect(reparsed.sortDir).toBe(filters.sortDir)
  })

  it('describeUserFilter produces human-readable chips', () => {
    const chips = describeUserFilter({
      verification: 'verified',
      role: 'admin',
      activity: 'active',
      progress: 'started',
      minLevel: 4,
      joinedFrom: '2026-01-01',
      joinedTo: '2026-02-01',
    })
    expect(chips.includes('Verified')).toBe(true)
    expect(chips.includes('Admins')).toBe(true)
    expect(chips.includes('Active (30d)')).toBe(true)
    expect(chips.includes('In progress')).toBe(true)
    expect(chips.includes('Level 4+')).toBe(true)
  })

  it('TOTAL_LESSONS matches the curriculum denominator', () => {
    expect(TOTAL_LESSONS).toBe(90)
  })
})