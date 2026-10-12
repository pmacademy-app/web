import { LEVEL_TIERS, STREAK_BUCKETS } from './analytics-aggregation'
import { fetchAllRows } from './fetch-all'

import type { AdminLevelDistribution, AdminModuleDropOff, AdminStreakBucket } from './types'

/**
 * Typed callers and pure reducers for the admin analytics RPCs
 * (supabase/migrations/20261012000001_admin_analytics_rpc.sql).
 *
 * Each caller returns `null` when the RPC errors (missing function, timeout,
 * malformed payload) so the service can mark that section `failed` instead of
 * throwing. A payload is malformed when a key the SQL always emits is absent or
 * not a number: reading that as 0 would cache made-up zeros as a healthy result.
 * The reducers turn the SQL aggregates into the exact shapes the old
 * whole-table JS reductions produced; the parity test
 * (lib/__tests__/admin-analytics-rpc-parity.test.ts) holds them to that.
 */

type RpcError = { message: string } | null
type RpcResult<T> = { data: T | null; error: RpcError }
type RpcBuilder<T> = PromiseLike<RpcResult<T>> & {
  order: (column: string) => RpcBuilder<T>
  range: (from: number, to: number) => PromiseLike<RpcResult<T>>
}
/** `types/database.ts` is generated and does not know these functions yet. */
type RpcClient = { rpc: (fn: string, args?: object) => RpcBuilder<unknown> }

const asRpc = (supabase: unknown) => supabase as RpcClient

/** A number as PostgREST sends it (a numeric string for bigint). Null when absent or not a number. */
const num = (value: unknown): number | null => {
  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === '')) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Every value as a number, or null if any one is missing or not a number. */
const nums = (values: unknown[]): number[] | null => {
  const out = values.map(num)
  return out.every((n): n is number => n !== null) ? out : null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Calls an RPC and parses its payload; a payload the parser rejects is logged and returned as null. */
async function callParsed<T>(
  supabase: unknown,
  fn: string,
  parse: (data: Record<string, unknown>) => T | null,
  args?: object
): Promise<T | null> {
  const data = await callJson(supabase, fn, args)
  if (!data) return null
  const parsed = parse(data)
  if (!parsed) console.error(`[AnalyticsRpc] ${fn} returned an unexpected payload`)
  return parsed
}

async function callJson(supabase: unknown, fn: string, args?: object): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await asRpc(supabase).rpc(fn, args)
    if (error) {
      console.error(`[AnalyticsRpc] ${fn} failed:`, error.message)
      return null
    }
    if (!isRecord(data)) {
      console.error(`[AnalyticsRpc] ${fn} returned an unexpected payload`)
      return null
    }
    return data
  } catch (err) {
    console.error(`[AnalyticsRpc] ${fn} threw:`, err)
    return null
  }
}

/* ─── #1 admin_user_stats ─────────────────────────────────────────────────── */

export interface AdminUserStats {
  total: number
  publicPortfolios: number
  /** Count per level 1..5 (index 0 = level 1). */
  levels: number[]
  /** Count per STREAK_BUCKETS entry, same order. */
  streaks: number[]
}

export function parseUserStats(data: Record<string, unknown>): AdminUserStats | null {
  const levelCounts = isRecord(data.levels) ? data.levels : {}
  const streakCounts = Array.isArray(data.streaks) ? data.streaks : []
  const total = num(data.total)
  const publicPortfolios = num(data.public_portfolios)
  const levels = nums(LEVEL_TIERS.map((tier) => levelCounts[String(tier.level)]))
  const streaks = nums(STREAK_BUCKETS.map((_, i) => streakCounts[i]))
  if (total === null || publicPortfolios === null || !levels || !streaks) return null
  return { total, publicPortfolios, levels, streaks }
}

export async function fetchUserStats(supabase: unknown): Promise<AdminUserStats | null> {
  return callParsed(supabase, 'admin_user_stats', parseUserStats)
}

/** Same output as `computeLevelDistribution(allUsers)`. */
export function levelDistributionFromStats(stats: AdminUserStats): AdminLevelDistribution[] {
  return LEVEL_TIERS.map((tier, i) => {
    const count = stats.levels[i] || 0
    const percentage = stats.total > 0 ? Math.round((count / stats.total) * 1000) / 10 : 0
    return { level: tier.level, label: tier.label, count, percentage }
  })
}

/** Same output as `buildStreakDistribution(allUsers)`. */
export function streakDistributionFromStats(stats: AdminUserStats): AdminStreakBucket[] {
  return STREAK_BUCKETS.map((b, i) => ({ bucket: b.bucket, count: stats.streaks[i] || 0 }))
}

/* ─── #6 admin_active_users ───────────────────────────────────────────────── */

export interface AdminActiveUsers {
  /** Distinct users with XP in the range. */
  active: Set<string>
  /** The subset of `active` that also had XP before the range start. */
  activeBefore: Set<string>
}

export async function fetchActiveUsers(
  supabase: unknown,
  fromIso: string,
  toIso: string
): Promise<AdminActiveUsers | null> {
  try {
    const rows = await fetchAllRows<{ user_id: string | null; active_before: boolean | null }>((from, to) =>
      // The outer ORDER BY makes the paging stable; the function's own order is not
      // guaranteed to survive PostgREST's wrapping query.
      asRpc(supabase)
        .rpc('admin_active_users', { p_from: fromIso, p_to: toIso })
        .order('user_id')
        .range(from, to) as PromiseLike<RpcResult<{ user_id: string | null; active_before: boolean | null }[]>>
    )
    const active = new Set<string>()
    const activeBefore = new Set<string>()
    for (const row of rows) {
      if (!row.user_id) continue
      active.add(row.user_id)
      if (row.active_before) activeBefore.add(row.user_id)
    }
    return { active, activeBefore }
  } catch (err) {
    console.error('[AnalyticsRpc] admin_active_users failed:', err)
    return null
  }
}

/* ─── #10 admin_lesson_completion_stats ───────────────────────────────────── */

export interface AdminModuleDef {
  slug: string
  title: string
  order: number
  lessonIds: string[]
}

export interface AdminLessonCompletionStats {
  distinctUsers: number
  /** [lessons completed, users with that many]. */
  histogram: Array<{ lessons: number; users: number }>
  /** Keyed by the 1-based position of the module in the request. */
  modules: Map<number, { started: number; completed: number }>
}

export function parseLessonCompletionStats(data: Record<string, unknown>): AdminLessonCompletionStats | null {
  const distinctUsers = num(data.distinct_users)
  if (distinctUsers === null || !Array.isArray(data.completion_histogram) || !Array.isArray(data.modules)) return null

  const histogram: AdminLessonCompletionStats['histogram'] = []
  for (const h of data.completion_histogram) {
    const row = isRecord(h) ? nums([h.lessons, h.users]) : null
    if (!row) return null
    histogram.push({ lessons: row[0], users: row[1] })
  }
  const modules = new Map<number, { started: number; completed: number }>()
  for (const m of data.modules) {
    const row = isRecord(m) ? nums([m.idx, m.started, m.completed]) : null
    if (!row) return null
    modules.set(row[0], { started: row[1], completed: row[2] })
  }
  return { distinctUsers, histogram, modules }
}

export async function fetchLessonCompletionStats(
  supabase: unknown,
  moduleDefs: AdminModuleDef[]
): Promise<AdminLessonCompletionStats | null> {
  const p_modules = moduleDefs.map((m) => ({ slug: m.slug, lesson_ids: m.lessonIds }))
  return callParsed(supabase, 'admin_lesson_completion_stats', parseLessonCompletionStats, { p_modules })
}

/**
 * Same output as `computeModuleDropOffs(moduleDefs, allCompletedLessons, totalUsers)`.
 * `stats.modules` is keyed by the module's 1-based position in `moduleDefs`.
 */
export function moduleDropOffsFromStats(
  moduleDefs: AdminModuleDef[],
  stats: AdminLessonCompletionStats,
  totalPlatformLearners: number
): AdminModuleDropOff[] {
  if (moduleDefs.length === 0) return []
  const indexed = moduleDefs.map((mod, i) => ({ mod, idx: i + 1 }))
  const sorted = [...indexed].sort((a, b) => a.mod.order - b.mod.order)
  let prevCompleted = totalPlatformLearners

  return sorted.map(({ mod, idx }, position) => {
    const lessonCount = new Set(mod.lessonIds).size
    const agg = stats.modules.get(idx) || { started: 0, completed: 0 }
    const startedCount = agg.started
    const completedCount = lessonCount > 0 ? agg.completed : 0

    const completionPct = startedCount > 0 ? Math.round((completedCount / startedCount) * 1000) / 10 : 0
    const dropOffBaseline = position === 0 ? Math.max(startedCount, 1) : Math.max(prevCompleted, 1)
    const dropOffPct = Math.max(0, Math.round(((dropOffBaseline - startedCount) / dropOffBaseline) * 1000) / 10)
    prevCompleted = completedCount

    return {
      slug: mod.slug,
      title: mod.title,
      order: mod.order,
      lessonCount,
      learnersStarted: startedCount,
      learnersCompleted: completedCount,
      completionPct,
      dropOffPct,
    }
  })
}

/** Users whose completed-lesson count reaches the published lesson total. */
export function courseCompletionsFromStats(stats: AdminLessonCompletionStats, totalLessonsCount: number): number {
  if (totalLessonsCount <= 0) return 0
  return stats.histogram.reduce((sum, h) => (h.lessons >= totalLessonsCount ? sum + h.users : sum), 0)
}

/* ─── #12 admin_capstone_stats ────────────────────────────────────────────── */

export interface AdminCapstoneStats {
  submitted: number
  reviewed: number
  /** submitted_at of in-range submissions that have a user, for the daily series. */
  submittedAt: string[]
}

export function parseCapstoneStats(data: Record<string, unknown>): AdminCapstoneStats | null {
  const submitted = num(data.submitted)
  const reviewed = num(data.reviewed)
  if (submitted === null || reviewed === null || !Array.isArray(data.submitted_at)) return null
  return {
    submitted,
    reviewed,
    submittedAt: data.submitted_at.filter((v): v is string => typeof v === 'string' && v.length > 0),
  }
}

export async function fetchCapstoneStats(
  supabase: unknown,
  fromIso: string,
  toIso: string
): Promise<AdminCapstoneStats | null> {
  return callParsed(supabase, 'admin_capstone_stats', parseCapstoneStats, { p_from: fromIso, p_to: toIso })
}

/* ─── #17 admin_flashcard_stats ───────────────────────────────────────────── */

export interface AdminFlashcardStats {
  total: number
  distinctUsers: number
}

export function parseFlashcardStats(data: Record<string, unknown>): AdminFlashcardStats | null {
  const total = num(data.total)
  const distinctUsers = num(data.distinct_users)
  if (total === null || distinctUsers === null) return null
  return { total, distinctUsers }
}

export async function fetchFlashcardStats(supabase: unknown): Promise<AdminFlashcardStats | null> {
  return callParsed(supabase, 'admin_flashcard_stats', parseFlashcardStats)
}

/* ─── admin_funnel_distinct_users ─────────────────────────────────────────── */
/* supabase/migrations/20261013000001_admin_funnel_distinct_users.sql */

/** Learners (not rows) who reached each activity step of the overview funnel. */
export interface AdminFunnelDistinctUsers {
  /** Users with at least one completed lesson. */
  firstLesson: number
  /** Users with at least one quiz attempt. */
  firstQuiz: number
  /** Users with at least one submitted capstone. */
  moduleCompletion: number
}

/**
 * Returns null when a count is missing or not a number: a funnel step silently showing
 * 0 learners is worse than the section reporting `failed`.
 */
export function parseFunnelDistinctUsers(data: Record<string, unknown>): AdminFunnelDistinctUsers | null {
  const counts = nums([data.first_lesson, data.first_quiz, data.module_completion])
  // A count is never negative.
  if (!counts || counts.some((n) => n < 0)) return null
  const [firstLesson, firstQuiz, moduleCompletion] = counts
  return { firstLesson, firstQuiz, moduleCompletion }
}

export async function fetchFunnelDistinctUsers(supabase: unknown): Promise<AdminFunnelDistinctUsers | null> {
  return callParsed(supabase, 'admin_funnel_distinct_users', parseFunnelDistinctUsers)
}
