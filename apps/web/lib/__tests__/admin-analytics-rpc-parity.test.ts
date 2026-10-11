import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  legacyActiveBeforeSet,
  legacyAnalyticsWorkspace,
  legacyCapstoneStats,
  legacyFlashcardStats,
  legacyLessonStats,
  legacyModuleDefs,
  legacyUserStats,
  type LegacyTables,
} from './fixtures/analytics-legacy'
import type { CurriculumEntry } from '@/types'

/**
 * B5 parity: the RPC-backed AnalyticsService must return exactly what the old
 * whole-table JS reductions returned.
 *
 * Rows are seeded in memory. The legacy pipeline (fixtures/analytics-legacy.ts)
 * reduces them directly. The service runs against a fake Supabase client whose
 * table queries filter the same rows and whose `rpc` answers with a JS
 * transcription of each SQL function in 20261012000001_admin_analytics_rpc.sql.
 */

const state = vi.hoisted(() => ({
  tables: null as unknown as LegacyTables,
  lessons: [] as CurriculumEntry[],
  failRpc: new Set<string>(),
  failTables: new Set<string>(),
  queries: [] as Array<{ table: string; filters: string[]; head: boolean }>,
  rpcCalls: [] as Array<{ fn: string; args?: Record<string, unknown> }>,
  rpcOrders: [] as Array<{ fn: string; col: string }>,
}))

/* ─── SQL transcriptions (one per function in the migration) ─────────────── */

const ts = (iso: string) => new Date(iso).getTime()
/** How Postgres serialises a timestamptz inside jsonb. */
const pgJsonTimestamp = (iso: string) => new Date(iso).toISOString().replace('Z', '+00:00')

function sqlUserStats(users: LegacyTables['users']) {
  const rows = users.map((x) => ({
    lvl: Math.min(5, Math.max(1, x.level == null || x.level === 0 ? 1 : x.level)),
    streak: x.current_streak ?? 0,
    pub: x.is_portfolio_public === true,
  }))
  const count = (pred: (r: (typeof rows)[number]) => boolean) => rows.filter(pred).length
  return {
    total: rows.length,
    public_portfolios: count((r) => r.pub),
    levels: { '1': count((r) => r.lvl === 1), '2': count((r) => r.lvl === 2), '3': count((r) => r.lvl === 3), '4': count((r) => r.lvl === 4), '5': count((r) => r.lvl === 5) },
    streaks: [
      count((r) => r.streak === 0),
      count((r) => r.streak >= 1 && r.streak <= 3),
      count((r) => r.streak >= 4 && r.streak <= 7),
      count((r) => r.streak >= 8 && r.streak <= 14),
      count((r) => r.streak >= 15 && r.streak <= 30),
      count((r) => r.streak > 30 || r.streak < 0),
    ],
  }
}

function sqlActiveUsers(xp: LegacyTables['xp_events'], pFrom: string, pTo: string) {
  const inRange = new Set(
    xp
      .filter((e) => e.user_id !== null && ts(e.created_at) >= ts(pFrom) && ts(e.created_at) <= ts(pTo))
      .map((e) => e.user_id as string)
  )
  return [...inRange].sort().map((userId) => ({
    user_id: userId,
    active_before: xp.some((b) => b.user_id === userId && ts(b.created_at) < ts(pFrom)),
  }))
}

function sqlLessonCompletionStats(
  progress: LegacyTables['user_lesson_progress'],
  pModules: Array<{ slug: string; lesson_ids: string[] }>
) {
  const completed = progress.filter((p) => p.status === 'completed')
  const perUser = new Map<string, number>()
  for (const c of completed) perUser.set(c.user_id, (perUser.get(c.user_id) || 0) + 1)
  const histogram = new Map<number, number>()
  for (const lessons of perUser.values()) histogram.set(lessons, (histogram.get(lessons) || 0) + 1)

  const modules = pModules.map((m, i) => {
    const lessonIds = [...new Set(m.lesson_ids)]
    const done = new Map<string, Set<string>>()
    for (const c of completed) {
      if (!lessonIds.includes(c.lesson_id)) continue
      if (!done.has(c.user_id)) done.set(c.user_id, new Set())
      done.get(c.user_id)!.add(c.lesson_id)
    }
    let completedUsers = 0
    for (const set of done.values()) if (lessonIds.length > 0 && set.size >= lessonIds.length) completedUsers++
    return { idx: i + 1, slug: m.slug, lesson_count: lessonIds.length, started: done.size, completed: completedUsers }
  })

  return {
    distinct_users: perUser.size,
    completion_histogram: [...histogram.entries()].sort((a, b) => a[0] - b[0]).map(([lessons, users]) => ({ lessons, users })),
    modules,
  }
}

function sqlCapstoneStats(caps: LegacyTables['capstone_submissions'], pFrom: string, pTo: string) {
  const inRange = caps.filter((c) => c.submitted_at && ts(c.submitted_at) >= ts(pFrom) && ts(c.submitted_at) <= ts(pTo))
  return {
    submitted: inRange.length,
    reviewed: inRange.filter((c) => c.status === 'reviewed').length,
    submitted_at: inRange
      .filter((c) => c.user_id !== null)
      .map((c) => c.submitted_at)
      .sort((a, b) => ts(a) - ts(b))
      .map(pgJsonTimestamp),
  }
}

function sqlFlashcardStats(rows: LegacyTables['user_flashcard_srs']) {
  return { total: rows.length, distinct_users: new Set(rows.map((r) => r.user_id)).size }
}

/* ─── Fake Supabase client ────────────────────────────────────────────────── */

type Row = Record<string, unknown>
type Result = { data: unknown; error: { message: string } | null; count?: number | null }

function thenable(run: () => Result) {
  return {
    then<A, B>(onFulfilled?: (v: Result) => A | PromiseLike<A>, onRejected?: (e: unknown) => B | PromiseLike<B>) {
      return Promise.resolve().then(run).then(onFulfilled, onRejected)
    },
  }
}

function tableBuilder(table: string) {
  const preds: Array<(r: Row) => boolean> = []
  const record = { table, filters: [] as string[], head: false }
  state.queries.push(record)
  const asTime = (v: unknown) => (typeof v === 'string' ? ts(v) : NaN)
  let window: [number, number] | null = null

  const run = (): Result => {
    if (state.failTables.has(table)) return { data: null, error: { message: `${table} unavailable` }, count: null }
    const rows = (state.tables[table as keyof LegacyTables] as unknown as Row[]).filter((r) => preds.every((p) => p(r)))
    if (record.head) return { data: null, error: null, count: rows.length }
    return { data: window ? rows.slice(window[0], window[1] + 1) : rows, error: null, count: null }
  }

  const builder = {
    select(_cols: string, opts?: { head?: boolean }) {
      record.head = Boolean(opts?.head)
      return builder
    },
    eq(col: string, val: unknown) {
      record.filters.push(`eq:${col}`)
      preds.push((r) => r[col] === val)
      return builder
    },
    gte(col: string, val: string) {
      record.filters.push(`gte:${col}`)
      preds.push((r) => r[col] != null && asTime(r[col]) >= ts(val))
      return builder
    },
    lte(col: string, val: string) {
      record.filters.push(`lte:${col}`)
      preds.push((r) => r[col] != null && asTime(r[col]) <= ts(val))
      return builder
    },
    lt(col: string, val: string) {
      record.filters.push(`lt:${col}`)
      preds.push((r) => r[col] != null && asTime(r[col]) < ts(val))
      return builder
    },
    range(from: number, to: number) {
      window = [from, to]
      return thenable(run)
    },
    ...thenable(run),
  }
  return builder
}

function rpc(fn: string, args?: Record<string, unknown>) {
  state.rpcCalls.push({ fn, args })
  const answer = (): unknown => {
    const t = state.tables
    switch (fn) {
      case 'admin_user_stats':
        return sqlUserStats(t.users)
      case 'admin_active_users':
        return sqlActiveUsers(t.xp_events, args!.p_from as string, args!.p_to as string)
      case 'admin_lesson_completion_stats':
        return sqlLessonCompletionStats(t.user_lesson_progress, args!.p_modules as Array<{ slug: string; lesson_ids: string[] }>)
      case 'admin_capstone_stats':
        return sqlCapstoneStats(t.capstone_submissions, args!.p_from as string, args!.p_to as string)
      case 'admin_flashcard_stats':
        return sqlFlashcardStats(t.user_flashcard_srs)
      default:
        throw new Error(`unexpected rpc ${fn}`)
    }
  }
  let orderBy: string | null = null
  const run = (window?: [number, number]): Result => {
    if (state.failRpc.has(fn)) return { data: null, error: { message: `function public.${fn} does not exist` } }
    let data = answer()
    if (orderBy && Array.isArray(data)) {
      const col = orderBy
      data = [...data].sort((a, b) => String(a[col]).localeCompare(String(b[col])))
    }
    return { data: window && Array.isArray(data) ? data.slice(window[0], window[1] + 1) : data, error: null }
  }
  const builder = {
    ...thenable(() => run()),
    order: (col: string) => {
      state.rpcOrders.push({ fn, col })
      orderBy = col
      return builder
    },
    range: (from: number, to: number) => thenable(() => run([from, to])),
  }
  return builder
}

vi.mock('../supabase', () => ({
  createServiceRoleClient: () => ({ from: (table: string) => tableBuilder(table), rpc }),
}))
vi.mock('../lesson-loader', () => ({
  fetchCurriculumData: async () => ({ lessons: state.lessons }),
}))

import { AnalyticsService } from '../admin/analytics-service'
import {
  courseCompletionsFromStats,
  levelDistributionFromStats,
  moduleDropOffsFromStats,
  parseCapstoneStats,
  parseFlashcardStats,
  parseLessonCompletionStats,
  parseUserStats,
  streakDistributionFromStats,
} from '../admin/analytics-rpc'
import { resolveRange } from '../admin/dashboard-aggregation'

/* ─── Seed ────────────────────────────────────────────────────────────────── */

const NOW = new Date('2026-08-15T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

function lesson(id: string, module: string, order: number): CurriculumEntry {
  return { id, slug: id, title: id, module, order, difficulty: 1, estimatedReadingTime: 1, estimatedCompletionTime: 1, prerequisites: [] }
}

function seed(): { tables: LegacyTables; lessons: CurriculumEntry[] } {
  const r = rng(42)
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]
  const at = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * DAY - Math.floor(r() * DAY)).toISOString()

  const lessons = [
    lesson('f1', 'foundations', 1),
    lesson('f2', 'foundations', 2),
    lesson('f3', 'foundations', 3),
    lesson('d1', 'discovery-lab', 4),
    lesson('d2', 'discovery-lab', 5),
    lesson('x1', 'unknown-module', 6),
  ]

  const userIds = Array.from({ length: 60 }, (_, i) => `u${String(i).padStart(3, '0')}`)
  const users = userIds.map((id, i) => ({
    id,
    created_at: at(Math.floor(r() * 150)),
    level: pick([null, 0, 1, 2, 3, 4, 5, 7, -1]),
    current_streak: pick([null, 0, 1, 3, 4, 7, 8, 14, 15, 30, 31, 90, -2]),
    is_portfolio_public: i % 7 === 0 ? null : r() < 0.4,
  }))

  const sources = ['lesson', 'quiz', 'streak', 'flashcard', 'capstone', 'weird']
  const xp_events = Array.from({ length: 700 }, () => ({
    user_id: r() < 0.05 ? null : pick(userIds),
    xp_amount: pick([0, 5, 10, 25, -3]),
    source_type: pick(sources),
    created_at: at(Math.floor(r() * 140)),
  }))

  const allLessonIds = [...lessons.map((l) => l.id), 'orphan-lesson']
  const user_lesson_progress: LegacyTables['user_lesson_progress'] = []
  for (const userId of userIds) {
    // A few learners finish everything so course/module completion is non-zero.
    const full = r() < 0.15
    for (const lessonId of allLessonIds) {
      if (!full && r() < 0.55) continue
      const status = full ? 'completed' : pick(['completed', 'completed', 'in_progress', 'not_started'])
      user_lesson_progress.push({
        user_id: userId,
        lesson_id: lessonId,
        status,
        completed_at: status === 'completed' ? (r() < 0.05 ? null : at(Math.floor(r() * 120))) : null,
      })
    }
  }

  const quiz_attempts = Array.from({ length: 200 }, () => ({
    user_id: r() < 0.05 ? null : pick(userIds),
    is_correct: r() < 0.6,
    attempted_at: at(Math.floor(r() * 100)),
  }))
  const capstone_submissions = Array.from({ length: 40 }, (_, i) => ({
    id: `c${i}`,
    user_id: r() < 0.1 ? null : pick(userIds),
    status: pick(['submitted', 'reviewed', 'needs_revision']),
    submitted_at: at(Math.floor(r() * 120)),
  }))
  const certificates = Array.from({ length: 25 }, (_, i) => ({
    id: `cert${i}`,
    user_id: pick(userIds),
    issued_at: at(Math.floor(r() * 150)),
  }))
  const user_badges = Array.from({ length: 13 }, (_, i) => ({ id: `b${i}` }))
  const user_flashcard_srs = Array.from({ length: 90 }, (_, i) => ({ user_id: pick(userIds), flashcard_id: `fc${i}` }))

  return {
    tables: { users, xp_events, user_lesson_progress, quiz_attempts, capstone_submissions, certificates, user_badges, user_flashcard_srs },
    lessons,
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  const seeded = seed()
  state.tables = seeded.tables
  state.lessons = seeded.lessons
  state.failRpc = new Set()
  state.failTables = new Set()
  state.queries = []
  state.rpcCalls = []
  state.rpcOrders = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/* ─── Tests ───────────────────────────────────────────────────────────────── */

describe('B5 analytics RPC parity with the legacy JS reductions', () => {
  it.each([
    ['7d', null, null],
    ['30d', null, null],
    ['90d', null, null],
    ['custom', '2026-05-01', '2026-07-20'],
  ] as const)('the whole workspace matches for range %s', async (rangeKey, from, to) => {
    const actual = await AnalyticsService.getAnalyticsWorkspaceData({ rangeKey, from, to, tab: 'learning' })
    const expected = legacyAnalyticsWorkspace({
      tables: state.tables,
      lessons: state.lessons,
      range: resolveRange(rangeKey, from, to),
      now: NOW,
      tab: 'learning',
    })
    expect(actual.failed).toBeUndefined()
    expect(actual).toEqual(expected)
    // Sanity: the seed exercises the interesting branches.
    expect(expected.learning.moduleDropOffs.some((m) => m.learnersCompleted > 0)).toBe(true)
    expect(expected.learners.returningLearners).toBeGreaterThan(0)
  })

  it('user stats: levels and streaks match, including null, 0, negative and out-of-range values', () => {
    const stats = parseUserStats(sqlUserStats(state.tables.users))
    const legacy = legacyUserStats(state.tables.users)
    expect(stats.total).toBe(legacy.totalUsers)
    expect(stats.publicPortfolios).toBe(legacy.publicPortfolios)
    expect(levelDistributionFromStats(stats)).toEqual(legacy.levelDistribution)
    expect(streakDistributionFromStats(stats)).toEqual(legacy.streakDistribution)
  })

  it('active users: the "active before" flag matches the old set for every in-range learner', () => {
    const range = resolveRange('30d')
    const fromIso = range.start.toISOString()
    const rows = sqlActiveUsers(state.tables.xp_events, fromIso, range.end.toISOString())
    const legacy = legacyActiveBeforeSet(state.tables.xp_events, fromIso)
    for (const row of rows) expect(row.active_before).toBe(legacy.has(row.user_id))
  })

  it('lesson stats: drop-offs, course completions and first-lesson users match', () => {
    const defs = legacyModuleDefs(state.lessons)
    const total = state.tables.users.length
    const stats = parseLessonCompletionStats(
      sqlLessonCompletionStats(state.tables.user_lesson_progress, defs.map((d) => ({ slug: d.slug, lesson_ids: d.lessonIds })))
    )
    const legacy = legacyLessonStats(defs, state.tables.user_lesson_progress, total, state.lessons.length)
    expect(moduleDropOffsFromStats(defs, stats, total)).toEqual(legacy.moduleDropOffs)
    expect(courseCompletionsFromStats(stats, state.lessons.length)).toBe(legacy.courseCompletionsCount)
    expect(stats.distinctUsers).toBe(legacy.usersWithAtLeastOneLesson)
    expect(legacy.courseCompletionsCount).toBeGreaterThan(0)
  })

  it('lesson stats: no modules and no lessons give the same empty answers', () => {
    const stats = parseLessonCompletionStats(sqlLessonCompletionStats(state.tables.user_lesson_progress, []))
    const legacy = legacyLessonStats([], state.tables.user_lesson_progress, 10, 0)
    expect(moduleDropOffsFromStats([], stats, 10)).toEqual(legacy.moduleDropOffs)
    expect(courseCompletionsFromStats(stats, 0)).toBe(legacy.courseCompletionsCount)
  })

  it('capstone and flashcard stats match', () => {
    const range = resolveRange('90d')
    const fromIso = range.start.toISOString()
    const toIso = range.end.toISOString()
    const caps = parseCapstoneStats(sqlCapstoneStats(state.tables.capstone_submissions, fromIso, toIso))
    const legacyCaps = legacyCapstoneStats(state.tables.capstone_submissions, fromIso, toIso)
    expect(caps.submitted).toBe(legacyCaps.submitted)
    expect(caps.reviewed).toBe(legacyCaps.reviewed)
    expect(caps.submittedAt.map((s) => new Date(s).toISOString()).sort()).toEqual([...legacyCaps.seriesSubmittedAt].sort())
    expect(parseFlashcardStats(sqlFlashcardStats(state.tables.user_flashcard_srs))).toEqual(
      legacyFlashcardStats(state.tables.user_flashcard_srs)
    )
  })

  it('pages admin_active_users past the PostgREST row cap', async () => {
    const many = Array.from({ length: 2300 }, (_, i) => ({
      user_id: `p${String(i).padStart(5, '0')}`,
      xp_amount: 1,
      source_type: 'lesson',
      created_at: new Date(NOW.getTime() - DAY).toISOString(),
    }))
    state.tables.xp_events = [...state.tables.xp_events, ...many]
    const data = await AnalyticsService.getAnalyticsWorkspaceData({ rangeKey: '7d' })
    expect(state.rpcCalls.filter((c) => c.fn === 'admin_active_users').length).toBeGreaterThanOrEqual(3)
    // Every page is ordered by the outer query, so pages cannot overlap or skip rows.
    expect(state.rpcOrders.filter((o) => o.fn === 'admin_active_users')).toEqual(
      state.rpcCalls.filter((c) => c.fn === 'admin_active_users').map(() => ({ fn: 'admin_active_users', col: 'user_id' }))
    )
    expect(data.learners.newLearners + data.learners.returningLearners).toBe(data.learners.activeLearners)
  })

  it('only sends date-bounded row queries; whole-table work goes through RPCs and head counts', async () => {
    await AnalyticsService.getAnalyticsWorkspaceData({ rangeKey: '30d' })
    for (const q of state.queries) {
      if (q.head) continue
      expect(q.filters.some((f) => f.startsWith('gte:')), `${q.table} query is unbounded`).toBe(true)
    }
    expect(state.queries.find((q) => q.table === 'certificates' && q.head)).toBeTruthy()
    expect(new Set(state.rpcCalls.map((c) => c.fn))).toEqual(
      new Set(['admin_user_stats', 'admin_active_users', 'admin_lesson_completion_stats', 'admin_capstone_stats', 'admin_flashcard_stats'])
    )
  })

  it('the service source keeps fetchAllRows only for range-bounded queries', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../admin/analytics-service.ts'), 'utf8')
    const calls = src.split('fetchAllRows<').slice(1)
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      const body = call.slice(0, call.indexOf('.range(from, to)'))
      expect(body).toMatch(/\.gte\(/)
    }
  })

  it.each([
    ['admin_user_stats', (d: Awaited<ReturnType<typeof AnalyticsService.getAnalyticsWorkspaceData>>) => d.learners.totalUsers],
    ['admin_active_users', (d: Awaited<ReturnType<typeof AnalyticsService.getAnalyticsWorkspaceData>>) => d.learners.returningLearners],
    ['admin_lesson_completion_stats', (d: Awaited<ReturnType<typeof AnalyticsService.getAnalyticsWorkspaceData>>) => d.learning.moduleDropOffs.length],
    ['admin_capstone_stats', (d: Awaited<ReturnType<typeof AnalyticsService.getAnalyticsWorkspaceData>>) => d.outcomes.capstonesSubmitted],
    ['admin_flashcard_stats', (d: Awaited<ReturnType<typeof AnalyticsService.getAnalyticsWorkspaceData>>) => d.engagement.srsReviews],
  ])('a failing %s marks the payload failed, zeroes its section and keeps the rest', async (fn, pick) => {
    state.failRpc.add(fn)
    const data = await AnalyticsService.getAnalyticsWorkspaceData({ rangeKey: '90d' })
    expect(data.failed).toBe(true)
    expect(pick(data)).toBe(0)
    // Range-bounded data still loads.
    expect(data.engagement.xpEarned).toBeGreaterThan(0)
    expect(data.overview.kpis.lessonsCompleted).toBeGreaterThan(0)
  })
})

describe('analytics service: head-count failures', () => {
  it('a failing badge count marks the payload failed instead of reading as zero badges', async () => {
    state.failTables.add('user_badges')
    const data = await AnalyticsService.getAnalyticsWorkspaceData({ rangeKey: '30d' })
    expect(data.failed).toBe(true)
  })
})
