import { LEVEL_TIERS, STREAK_BUCKETS } from './analytics-aggregation'
import { fetchAllRows } from './fetch-all'

import type { AdminLevelDistribution, AdminModuleDropOff, AdminStreakBucket } from './types'

/**
 * Typed callers and pure reducers for the admin analytics RPCs
 * (supabase/migrations/20261012000001_admin_analytics_rpc.sql).
 *
 * Each caller returns `null` when the RPC errors (missing function, timeout,
 * malformed payload) so the service can mark that section `failed` instead of
 * throwing. The reducers turn the SQL aggregates into the exact shapes the old
 * whole-table JS reductions produced; the parity test
 * (lib/__tests__/admin-analytics-rpc-parity.test.ts) holds them to that.
 */

type RpcError = { message: string } | null
type RpcResult<T> = { data: T | null; error: RpcError }
type RpcBuilder<T> = PromiseLike<RpcResult<T>> & {
  range: (from: number, to: number) => PromiseLike<RpcResult<T>>
}
/** `types/database.ts` is generated and does not know these functions yet. */
type RpcClient = { rpc: (fn: string, args?: object) => RpcBuilder<unknown> }

const asRpc = (supabase: unknown) => supabase as RpcClient

const num = (value: unknown): number => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

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

export function parseUserStats(data: Record<string, unknown>): AdminUserStats {
  const levels = isRecord(data.levels) ? data.levels : {}
  const streaks = Array.isArray(data.streaks) ? data.streaks : []
  return {
    total: num(data.total),
    publicPortfolios: num(data.public_portfolios),
    levels: LEVEL_TIERS.map((tier) => num(levels[String(tier.level)])),
    streaks: STREAK_BUCKETS.map((_, i) => num(streaks[i])),
  }
}

export async function fetchUserStats(supabase: unknown): Promise<AdminUserStats | null> {
  const data = await callJson(supabase, 'admin_user_stats')
  return data ? parseUserStats(data) : null
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
      asRpc(supabase)
        .rpc('admin_active_users', { p_from: fromIso, p_to: toIso })
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

export function parseLessonCompletionStats(data: Record<string, unknown>): AdminLessonCompletionStats {
  const histogram = (Array.isArray(data.completion_histogram) ? data.completion_histogram : [])
    .filter(isRecord)
    .map((h) => ({ lessons: num(h.lessons), users: num(h.users) }))
  const modules = new Map<number, { started: number; completed: number }>()
  for (const m of Array.isArray(data.modules) ? data.modules : []) {
    if (!isRecord(m)) continue
    modules.set(num(m.idx), { started: num(m.started), completed: num(m.completed) })
  }
  return { distinctUsers: num(data.distinct_users), histogram, modules }
}

export async function fetchLessonCompletionStats(
  supabase: unknown,
  moduleDefs: AdminModuleDef[]
): Promise<AdminLessonCompletionStats | null> {
  const p_modules = moduleDefs.map((m) => ({ slug: m.slug, lesson_ids: m.lessonIds }))
  const data = await callJson(supabase, 'admin_lesson_completion_stats', { p_modules })
  return data ? parseLessonCompletionStats(data) : null
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

export function parseCapstoneStats(data: Record<string, unknown>): AdminCapstoneStats {
  return {
    submitted: num(data.submitted),
    reviewed: num(data.reviewed),
    submittedAt: (Array.isArray(data.submitted_at) ? data.submitted_at : []).filter(
      (v): v is string => typeof v === 'string' && v.length > 0
    ),
  }
}

export async function fetchCapstoneStats(
  supabase: unknown,
  fromIso: string,
  toIso: string
): Promise<AdminCapstoneStats | null> {
  const data = await callJson(supabase, 'admin_capstone_stats', { p_from: fromIso, p_to: toIso })
  return data ? parseCapstoneStats(data) : null
}

/* ─── #17 admin_flashcard_stats ───────────────────────────────────────────── */

export interface AdminFlashcardStats {
  total: number
  distinctUsers: number
}

export function parseFlashcardStats(data: Record<string, unknown>): AdminFlashcardStats {
  return { total: num(data.total), distinctUsers: num(data.distinct_users) }
}

export async function fetchFlashcardStats(supabase: unknown): Promise<AdminFlashcardStats | null> {
  const data = await callJson(supabase, 'admin_flashcard_stats')
  return data ? parseFlashcardStats(data) : null
}
