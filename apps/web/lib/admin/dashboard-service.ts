import { createServiceRoleClient } from '../supabase'
import { fetchCurriculumData } from '../lesson-loader'
import {
  buildFunnel,
  buildLearnerSeries,
  buildLearningSeries,
  computeTrend,
  mergeSeries,
  resolveRange,
} from './dashboard-aggregation'
import { unstable_cache } from 'next/cache'
import { AdminConsoleService } from './service'
import { ADMIN_CACHE_TAGS } from './cache-tags'
import { fetchAllRows } from './fetch-all'
import type {
  AdminAttentionItem,
  AdminDashboardData,
  AdminDashboardKpis,
  AdminDashboardSummary,
  AdminDateRange,
  AdminDateRangeKey,
  AdminFunnelStage,
  AdminRecentActivityItem,
  AdminSystemSnapshotItem,
  AdminTimeSeriesPoint,
} from './types'

/**
 * Dashboard / Operations Center data service (Phase 2).
 * Optimized with SQL-side RPC aggregations, bounded range queries, and tagged caching.
 */
export class DashboardService {
  /**
   * Fetches up to limit rows matching a query, preventing runaway memory scans.
   */
  private static async fetchBoundedRows<T>(
    buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
    maxRows = 5000
  ): Promise<T[]> {
    const pageSize = 1000
    const rows: T[] = []
    let start = 0
    while (start < maxRows) {
      const { data, error } = await buildPage(start, start + pageSize - 1)
      if (error) throw new Error(error.message)
      if (!data || data.length === 0) break
      rows.push(...data)
      if (data.length < pageSize) break
      start += pageSize
    }
    return rows
  }

  /**
   * Aggregates real-time platform overview metrics for the summary API with SQL RPC.
   */
  public static async getDashboardSummary(): Promise<AdminDashboardSummary> {
    const fetcher = async (): Promise<AdminDashboardSummary> => {
      try {
        const supabase = createServiceRoleClient()

        // Attempt PostgreSQL RPC aggregation first
        try {
          const { data: rpcData, error: rpcError } = (await (supabase as unknown as {
            rpc: (fn: string) => Promise<{ data: Record<string, unknown> | null; error: unknown }>
          }).rpc('get_admin_dashboard_summary'))

          if (!rpcError && rpcData) {
            const systemHealth = await AdminConsoleService.getSystemHealth()
            return {
              totalUsers: Number(rpcData.totalUsers || 0),
              activeLearners7d: Number(rpcData.activeLearners7d || 0),
              newSignups24h: Number(rpcData.newSignups24h || 0),
              totalLessonsCompleted: Number(rpcData.totalLessonsCompleted || 0),
              totalCapstonesSubmitted: Number(rpcData.totalCapstonesSubmitted || 0),
              totalCertificatesIssued: Number(rpcData.totalCertificatesIssued || 0),
              totalPublicPortfolios: Number(rpcData.totalPublicPortfolios || 0),
              totalXpAwarded: Number(rpcData.totalXpAwarded || 0),
              notificationsSent24h: 0,
              queuePendingCount: systemHealth.queuePendingItemsCount,
              systemHealth,
            }
          }
        } catch {
          // Fall back to direct queries if RPC is not yet created
        }

        // Fast fallback using direct count queries and users table total_xp
        const now = new Date()
        const past24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        const past7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

        const [
          totalUsersRes,
          newSignups24hRes,
          lessonsRes,
          capstonesRes,
          certsRes,
          portfoliosRes,
          usersXpRes,
          active7dRows,
          systemHealth,
        ] = await Promise.all([
          supabase.from('users').select('id', { count: 'exact', head: true }),
          supabase.from('users').select('id', { count: 'exact', head: true }).gte('created_at', past24h.toISOString()),
          supabase.from('user_lesson_progress').select('user_id', { count: 'exact', head: true }).eq('status', 'completed'),
          supabase.from('capstone_submissions').select('id', { count: 'exact', head: true }),
          supabase.from('certificates').select('id', { count: 'exact', head: true }),
          supabase.from('users').select('id', { count: 'exact', head: true }).eq('is_portfolio_public', true),
          // Both of these feed an aggregate (a sum and a distinct count), so a
          // truncated page produces a confidently wrong number with no error. Paged to
          // completion rather than capped. F-COR-4.
          fetchAllRows<{ total_xp: number | null }>((from, to) =>
            supabase.from('users').select('total_xp').range(from, to)
          ).then((data) => ({ data })),
          fetchAllRows<{ user_id: string | null }>((from, to) =>
            supabase
              .from('xp_events')
              .select('user_id')
              .gte('created_at', past7d.toISOString())
              .range(from, to)
          ).then((data) => ({ data })),
          AdminConsoleService.getSystemHealth(),
        ])

        const totalUsers = totalUsersRes?.count ?? 0
        const newSignups24h = newSignups24hRes?.count ?? 0
        const totalXpAwarded = (usersXpRes.data || []).reduce(
          (acc: number, u: { total_xp?: number | null }) => acc + (u.total_xp || 0),
          0
        )

        const activeLearners7d = new Set(
          (active7dRows.data || []).map((r: { user_id: string | null }) => r.user_id).filter((id): id is string => Boolean(id))
        ).size

        return {
          totalUsers,
          activeLearners7d,
          newSignups24h,
          totalLessonsCompleted: lessonsRes?.count ?? 0,
          totalCapstonesSubmitted: capstonesRes?.count ?? 0,
          totalCertificatesIssued: certsRes?.count ?? 0,
          totalPublicPortfolios: portfoliosRes?.count ?? 0,
          totalXpAwarded,
          notificationsSent24h: 0,
          queuePendingCount: systemHealth.queuePendingItemsCount,
          systemHealth,
        }
      } catch (err) {
        console.warn('[DashboardService] getDashboardSummary failed:', err)
        const systemHealth = await AdminConsoleService.getSystemHealth().catch(() => ({
          status: 'down' as const,
          databaseLatencyMs: -1,
          activeCronJobsCount: 0,
          queuePendingItemsCount: 0,
          failedNotifications24h: 0,
          lastCheckedAt: new Date().toISOString(),
          environment: process.env.NODE_ENV || 'development',
          nextVersion: 'Next.js 16.2.12 (Turbopack)',
        }))
        return {
          totalUsers: 0,
          activeLearners7d: 0,
          newSignups24h: 0,
          totalLessonsCompleted: 0,
          totalCapstonesSubmitted: 0,
          totalCertificatesIssued: 0,
          totalPublicPortfolios: 0,
          totalXpAwarded: 0,
          notificationsSent24h: 0,
          queuePendingCount: systemHealth.queuePendingItemsCount,
          systemHealth,
        }
      }
    }

    return fetcher()
  }

  /**
   * The complete dashboard payload for a date range, composed from the independent
   * section loaders below. Each section degrades on its own: a failing section comes back
   * empty and sets `failed`, and the rest of the page still renders live numbers.
   */
  public static async getDashboardData(
    rangeKey: AdminDateRangeKey = '30d',
    from?: string | null,
    to?: string | null
  ): Promise<AdminDashboardData> {
    const [kpis, series, funnel, attention, recentActivity, systemSnapshot] = await Promise.all([
      loadDashboardKpis(rangeKey, from, to),
      loadDashboardSeries(rangeKey, from, to),
      loadDashboardFunnel(),
      loadDashboardAttention(rangeKey, from, to),
      loadDashboardRecentActivity(),
      loadDashboardSystemSnapshot(),
    ])

    const failed = [kpis, series, funnel, attention, recentActivity, systemSnapshot].some((slice) => slice.failed)

    return {
      range: kpis.range,
      kpis: kpis.kpis,
      attention: attention.attention,
      series: series.series,
      funnel: funnel.funnel,
      recentActivity: recentActivity.recentActivity,
      systemSnapshot: systemSnapshot.systemSnapshot,
      ...(failed ? { failed: true } : {}),
    }
  }
}

/* ─── Independent dashboard section loaders ──────────────────────────────────
 *
 * Each loader fetches one section of the overview page, so the page can stream them
 * behind separate Suspense boundaries. Every loader:
 *   - uses the service-role client only (never cookies() or headers(), which
 *     unstable_cache forbids);
 *   - is cached for 90s under the `admin-dashboard` tag, keyed by the range inputs it
 *     actually depends on;
 *   - never throws: a failure returns that section's empty fallback with `failed: true`.
 *     The cached function throws on failure, and unstable_cache does not store a
 *     rejection, so a failed load is retried on the next request instead of being
 *     served for 90s.
 */

type ServiceClient = ReturnType<typeof createServiceRoleClient>

const DASHBOARD_CACHE_SECONDS = 90
const RECENT_ACTIVITY_LIMIT = 12
const RANGE_KEYS: ReadonlySet<AdminDateRangeKey> = new Set(['today', '7d', '30d', '90d', 'custom'])

export interface DashboardKpisSlice {
  range: AdminDateRange
  kpis: AdminDashboardKpis
  failed: boolean
}
export interface DashboardSeriesSlice {
  series: AdminTimeSeriesPoint[]
  failed: boolean
}
export interface DashboardFunnelSlice {
  funnel: AdminFunnelStage[]
  failed: boolean
}
export interface DashboardAttentionSlice {
  attention: AdminAttentionItem[]
  failed: boolean
}
export interface DashboardRecentActivitySlice {
  recentActivity: AdminRecentActivityItem[]
  failed: boolean
}
export interface DashboardSystemSnapshotSlice {
  systemSnapshot: AdminSystemSnapshotItem[]
  failed: boolean
}

/** Resolves the dashboard window, falling back to the last 30 days on bad input. Never throws. */
export function resolveDashboardRange(
  rangeKey: AdminDateRangeKey = '30d',
  from?: string | null,
  to?: string | null
): AdminDateRange {
  try {
    return resolveRange(rangeKey, from, to)
  } catch (rangeErr) {
    console.warn('[DashboardService] resolveRange fallback:', rangeErr)
    return resolveRange('30d')
  }
}

/**
 * unstable_cache JSON-serializes its result, so the range's Date fields come back as ISO
 * strings on a cache hit. Rebuild them so callers always get real Date instances.
 */
export function reviveDashboardRange(range: AdminDateRange): AdminDateRange {
  return { ...range, start: new Date(range.start), end: new Date(range.end) }
}

/**
 * Cache-key parts for a range. Presets ignore from/to, so they are dropped from the key
 * to share one entry; an unknown key resolves exactly like 'custom'.
 */
function rangeKeyParts(rangeKey: AdminDateRangeKey, from?: string | null, to?: string | null): string[] {
  const key: AdminDateRangeKey = RANGE_KEYS.has(rangeKey) ? rangeKey : 'custom'
  return key === 'custom' ? [key, from ?? '', to ?? ''] : [key]
}

async function loadSlice<T extends object>(
  name: string,
  keyParts: string[],
  compute: () => Promise<T>,
  fallback: () => T,
  revive: (value: T) => T = (value) => value
): Promise<T & { failed: boolean }> {
  try {
    const cached = unstable_cache(compute, ['admin-dashboard', name, ...keyParts], {
      revalidate: DASHBOARD_CACHE_SECONDS,
      tags: [ADMIN_CACHE_TAGS.dashboard],
    })
    return { ...revive(await cached()), failed: false }
  } catch (err) {
    console.warn(`[DashboardService] ${name} loader failed:`, err)
    return { ...fallback(), failed: true }
  }
}

/** Reads a head count, turning a PostgREST error into a thrown error so the section fails visibly. */
function countOf(res: { count: number | null; error: { message: string } | null }, label: string): number {
  if (res.error) throw new Error(`${label}: ${res.error.message}`)
  return res.count ?? 0
}

/** The previous window of equal length, ending 1ms before the current one starts. */
function rangeIsos(range: AdminDateRange) {
  const rangeMs = range.end.getTime() - range.start.getTime()
  const previousEnd = new Date(range.start.getTime() - 1)
  const previousStart = new Date(previousEnd.getTime() - rangeMs)
  return {
    startIso: range.start.toISOString(),
    endIso: range.end.toISOString(),
    prevStartIso: previousStart.toISOString(),
    prevEndIso: previousEnd.toISOString(),
  }
}

function distinctUserCount(rows: Array<{ user_id: string | null }>): number {
  return new Set(rows.map((r) => r.user_id).filter((id): id is string => Boolean(id))).size
}

const EMPTY_KPIS: AdminDashboardKpis = {
  totalUsers: 0,
  activeLearners: 0,
  newUsers: 0,
  verifiedUsers: 0,
  lessonsCompleted: 0,
  courseCompletionPct: 0,
  xpEarned: 0,
  certificatesIssued: 0,
  trends: {
    totalUsers: null,
    activeLearners: null,
    newUsers: null,
    verifiedUsers: null,
    lessonsCompleted: null,
    courseCompletionPct: null,
    xpEarned: null,
    certificatesIssued: null,
  },
}

/** KPI grid values and prior-period trends for the range. Also returns the resolved range. */
export function loadDashboardKpis(
  rangeKey: AdminDateRangeKey = '30d',
  from?: string | null,
  to?: string | null
): Promise<DashboardKpisSlice> {
  return loadSlice(
    'kpis',
    rangeKeyParts(rangeKey, from, to),
    () => computeKpis(rangeKey, from, to),
    () => ({ range: resolveDashboardRange(rangeKey, from, to), kpis: EMPTY_KPIS }),
    (value) => ({ ...value, range: reviveDashboardRange(value.range) })
  )
}

/** Daily learner and learning time series for the two dashboard charts. */
export function loadDashboardSeries(
  rangeKey: AdminDateRangeKey = '30d',
  from?: string | null,
  to?: string | null
): Promise<DashboardSeriesSlice> {
  return loadSlice('series', rangeKeyParts(rangeKey, from, to), () => computeSeries(rangeKey, from, to), () => ({
    series: [],
  }))
}

/** All-time learning funnel. Not range-scoped, so one cache entry serves every range. */
export function loadDashboardFunnel(): Promise<DashboardFunnelSlice> {
  return loadSlice('funnel', [], computeFunnel, () => ({ funnel: [] }))
}

/** Attention-center rows. Failed emails are range-scoped; the inbox counts are not. */
export function loadDashboardAttention(
  rangeKey: AdminDateRangeKey = '30d',
  from?: string | null,
  to?: string | null
): Promise<DashboardAttentionSlice> {
  return loadSlice('attention', rangeKeyParts(rangeKey, from, to), () => computeAttention(rangeKey, from, to), () => ({
    attention: [],
  }))
}

/** The latest activity across certificates, signups, lessons and capstones. Not range-scoped. */
export function loadDashboardRecentActivity(): Promise<DashboardRecentActivitySlice> {
  return loadSlice('recent-activity', [String(RECENT_ACTIVITY_LIMIT)], computeRecentActivity, () => ({
    recentActivity: [],
  }))
}

/** Service status tiles. Probes the Auth admin API itself to decide the auth tile. Not range-scoped. */
export function loadDashboardSystemSnapshot(): Promise<DashboardSystemSnapshotSlice> {
  return loadSlice('system-snapshot', [], computeSystemSnapshot, () => ({
    systemSnapshot: buildSystemSnapshot(null, null, false),
  }))
}

/* ─── Section computations (run inside unstable_cache; may throw) ──────────── */

async function computeKpis(
  rangeKey: AdminDateRangeKey,
  from?: string | null,
  to?: string | null
): Promise<Omit<DashboardKpisSlice, 'failed'>> {
  const range = resolveDashboardRange(rangeKey, from, to)
  const { startIso, endIso, prevStartIso, prevEndIso } = rangeIsos(range)
  const supabase = createServiceRoleClient()

  const [
    totalUsersRes,
    newUsersRes,
    newUsersPreviousRes,
    xpCurrent,
    xpPrevious,
    lessonsRes,
    lessonsPreviousRes,
    certsRes,
    certsPreviousRes,
    courseCompletionUsers,
    verified,
  ] = await Promise.all([
    supabase.from('users').select('id', { count: 'exact', head: true }),
    supabase.from('users').select('id', { count: 'exact', head: true }).gte('created_at', startIso).lte('created_at', endIso),
    supabase.from('users').select('id', { count: 'exact', head: true }).gte('created_at', prevStartIso).lte('created_at', prevEndIso),
    // XP sums and distinct active-user sets: a capped page here would be confidently
    // wrong above the cap, so these page to completion. F-COR-4.
    fetchAllRows<{ user_id: string | null; xp_amount: number }>((f, t) =>
      supabase.from('xp_events').select('user_id, xp_amount').gte('created_at', startIso).lte('created_at', endIso).range(f, t)
    ),
    fetchAllRows<{ user_id: string | null; xp_amount: number }>((f, t) =>
      supabase.from('xp_events').select('user_id, xp_amount').gte('created_at', prevStartIso).lte('created_at', prevEndIso).range(f, t)
    ),
    supabase
      .from('user_lesson_progress')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('completed_at', startIso)
      .lte('completed_at', endIso),
    supabase
      .from('user_lesson_progress')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('completed_at', prevStartIso)
      .lte('completed_at', prevEndIso),
    supabase.from('certificates').select('id', { count: 'exact', head: true }).gte('issued_at', startIso).lte('issued_at', endIso),
    supabase.from('certificates').select('id', { count: 'exact', head: true }).gte('issued_at', prevStartIso).lte('issued_at', prevEndIso),
    countCourseCompletionUsers(supabase),
    countVerifiedUsers(supabase, startIso, endIso),
  ])

  const totalUsers = countOf(totalUsersRes, 'users total')
  const newUsers = countOf(newUsersRes, 'users in range')
  const newUsersPrevious = countOf(newUsersPreviousRes, 'users in previous range')
  const lessonsCompleted = countOf(lessonsRes, 'lessons in range')
  const lessonsPrevious = countOf(lessonsPreviousRes, 'lessons in previous range')
  const certificatesIssued = countOf(certsRes, 'certificates in range')
  const certificatesPrevious = countOf(certsPreviousRes, 'certificates in previous range')

  const activeLearners = distinctUserCount(xpCurrent)
  const activeLearnersPrevious = distinctUserCount(xpPrevious)
  const xpEarned = xpCurrent.reduce((sum, e) => sum + (e.xp_amount || 0), 0)
  const xpEarnedPrevious = xpPrevious.reduce((sum, e) => sum + (e.xp_amount || 0), 0)

  return {
    range,
    kpis: {
      totalUsers,
      activeLearners,
      newUsers,
      verifiedUsers: verified.total,
      lessonsCompleted,
      courseCompletionPct: totalUsers === 0 ? 0 : Math.round((courseCompletionUsers / totalUsers) * 1000) / 10,
      xpEarned,
      certificatesIssued,
      trends: {
        totalUsers: computeTrend(totalUsers, totalUsers - newUsers),
        activeLearners: computeTrend(activeLearners, activeLearnersPrevious),
        newUsers: computeTrend(newUsers, newUsersPrevious),
        verifiedUsers: computeTrend(verified.total, verified.total - verified.inRange),
        lessonsCompleted: computeTrend(lessonsCompleted, lessonsPrevious),
        courseCompletionPct: null,
        xpEarned: computeTrend(xpEarned, xpEarnedPrevious),
        certificatesIssued: computeTrend(certificatesIssued, certificatesPrevious),
      },
    },
  }
}

async function computeSeries(
  rangeKey: AdminDateRangeKey,
  from?: string | null,
  to?: string | null
): Promise<Omit<DashboardSeriesSlice, 'failed'>> {
  const range = resolveDashboardRange(rangeKey, from, to)
  const { startIso, endIso } = rangeIsos(range)
  const supabase = createServiceRoleClient()

  const [newUsers, xpCurrent, xpBefore, lessons, quizzes, capstones] = await Promise.all([
    fetchAllRows<{ id: string; created_at: string }>((f, t) =>
      supabase.from('users').select('id, created_at').gte('created_at', startIso).lte('created_at', endIso).range(f, t)
    ),
    fetchAllRows<{ user_id: string | null; xp_amount: number; created_at: string }>((f, t) =>
      supabase.from('xp_events').select('user_id, xp_amount, created_at').gte('created_at', startIso).lte('created_at', endIso).range(f, t)
    ),
    // Builds the "active before the window" set that splits new from returning learners.
    fetchAllRows<{ user_id: string | null }>((f, t) =>
      supabase.from('xp_events').select('user_id').lt('created_at', startIso).range(f, t)
    ),
    fetchAllRows<{ user_id: string; completed_at: string | null }>((f, t) =>
      supabase
        .from('user_lesson_progress')
        .select('user_id, completed_at')
        .eq('status', 'completed')
        .gte('completed_at', startIso)
        .lte('completed_at', endIso)
        .range(f, t)
    ),
    fetchAllRows<{ id: string; user_id: string | null; attempted_at: string }>((f, t) =>
      supabase.from('quiz_attempts').select('id, user_id, attempted_at').gte('attempted_at', startIso).lte('attempted_at', endIso).range(f, t)
    ),
    fetchAllRows<{ user_id: string | null; submitted_at: string | null }>((f, t) =>
      supabase
        .from('capstone_submissions')
        .select('user_id, submitted_at')
        .gte('submitted_at', startIso)
        .lte('submitted_at', endIso)
        .range(f, t)
    ),
  ])

  const learnerSeries = buildLearnerSeries({
    range,
    newUsers,
    xpEvents: xpCurrent.filter((e): e is { user_id: string; xp_amount: number; created_at: string } => e.user_id !== null),
    usersActiveBeforeWindow: new Set(xpBefore.map((e) => e.user_id).filter((id): id is string => Boolean(id))),
  })
  const learningSeries = buildLearningSeries({
    range,
    lessonsCompleted: lessons.filter((l): l is { user_id: string; completed_at: string } => l.completed_at !== null),
    quizAttempts: quizzes,
    capstonesSubmitted: capstones.filter((c): c is { user_id: string; submitted_at: string } => c.submitted_at !== null),
  })

  return { series: mergeSeries(learnerSeries, learningSeries) }
}

async function computeFunnel(): Promise<Omit<DashboardFunnelSlice, 'failed'>> {
  const supabase = createServiceRoleClient()

  const [totalUsersRes, usersWithGoalRes, firstLessonRes, firstQuizRes, moduleCompletionRes, certificateRes, courseCompletionUsers] =
    await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }),
      supabase.from('users').select('id', { count: 'exact', head: true }).not('goal', 'is', null),
      supabase.from('user_lesson_progress').select('user_id', { count: 'exact', head: true }).eq('status', 'completed'),
      supabase.from('quiz_attempts').select('user_id', { count: 'exact', head: true }),
      supabase.from('capstone_submissions').select('user_id', { count: 'exact', head: true }).not('submitted_at', 'is', null),
      supabase.from('certificates').select('user_id', { count: 'exact', head: true }),
      countCourseCompletionUsers(supabase),
    ])

  return {
    funnel: buildFunnel([
      { key: 'registered', label: 'Registered', count: countOf(totalUsersRes, 'funnel registered') },
      { key: 'onboarding', label: 'Onboarding', count: countOf(usersWithGoalRes, 'funnel onboarding') },
      { key: 'first_lesson', label: 'First Lesson', count: countOf(firstLessonRes, 'funnel first lesson') },
      { key: 'first_quiz', label: 'First Quiz', count: countOf(firstQuizRes, 'funnel first quiz') },
      { key: 'module_completion', label: 'Module Completion', count: countOf(moduleCompletionRes, 'funnel module completion') },
      { key: 'course_completion', label: 'Course Completion', count: courseCompletionUsers },
      { key: 'certificate', label: 'Certificate', count: countOf(certificateRes, 'funnel certificate') },
    ]),
  }
}

async function computeAttention(
  rangeKey: AdminDateRangeKey,
  from?: string | null,
  to?: string | null
): Promise<Omit<DashboardAttentionSlice, 'failed'>> {
  const { startIso, endIso } = rangeIsos(resolveDashboardRange(rangeKey, from, to))
  const supabase = createServiceRoleClient()

  const [failedEmailsRes, contactMessagesRes, testimonialsRes, alertsRes] = await Promise.all([
    supabase
      .from('email_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('failed_at', startIso)
      .lte('failed_at', endIso),
    supabase.from('contact_messages').select('id', { count: 'exact', head: true }).eq('status', 'new'),
    supabase.from('testimonials').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('system_errors').select('id', { count: 'exact', head: true }).eq('status', 'new'),
  ])

  const failedEmails = countOf(failedEmailsRes, 'failed emails')
  const contactMessages = countOf(contactMessagesRes, 'contact messages')
  const testimonials = countOf(testimonialsRes, 'pending testimonials')
  const alerts = countOf(alertsRes, 'system alerts')

  return {
    attention: [
      {
        id: 'failed-emails',
        label: 'Failed Emails',
        count: failedEmails,
        severity: failedEmails > 0 ? 'critical' : 'healthy',
        href: '/admin/communications?tab=queue',
        actionLabel: 'Review',
      },
      {
        id: 'contact-messages',
        label: 'New Contact Messages',
        count: contactMessages,
        severity: contactMessages > 0 ? 'warning' : 'healthy',
        href: '/admin/communications?tab=contact',
        actionLabel: 'Open Inbox',
      },
      {
        id: 'pending-testimonials',
        label: 'Pending Testimonials',
        count: testimonials,
        severity: testimonials > 0 ? 'warning' : 'healthy',
        href: '/admin/feedback',
        actionLabel: 'Review',
      },
      {
        id: 'system-alerts',
        label: 'Active System Alerts',
        count: alerts,
        severity: alerts > 0 ? 'warning' : 'healthy',
        href: '/admin/system',
        actionLabel: 'View',
      },
    ],
  }
}

async function computeSystemSnapshot(): Promise<Omit<DashboardSystemSnapshotSlice, 'failed'>> {
  const [authAvailable, health, queue] = await Promise.all([
    probeAuthAvailable(),
    AdminConsoleService.getSystemHealth(),
    AdminConsoleService.getEmailQueueOverview(),
  ])
  return { systemSnapshot: buildSystemSnapshot(health, queue, authAvailable) }
}

async function computeRecentActivity(): Promise<Omit<DashboardRecentActivitySlice, 'failed'>> {
  const supabase = createServiceRoleClient()
  const limit = RECENT_ACTIVITY_LIMIT
  const results: AdminRecentActivityItem[] = []

  const [certRes, regRes, lessonRes, capRes, curriculumData] = await Promise.all([
    supabase
      .from('certificates')
      .select('id, user_id, learner_name, issued_at, certificate_code')
      .order('issued_at', { ascending: false })
      .limit(limit),
    supabase.from('users').select('id, name, email, created_at').order('created_at', { ascending: false }).limit(limit),
    supabase
      .from('user_lesson_progress')
      .select('user_id, lesson_id, completed_at')
      .eq('status', 'completed')
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(limit),
    supabase
      .from('capstone_submissions')
      .select('id, user_id, module_slug, submitted_at')
      .order('submitted_at', { ascending: false })
      .limit(limit),
    fetchCurriculumData().catch(() => null),
  ])

  for (const [res, label] of [
    [certRes, 'recent certificates'],
    [regRes, 'recent signups'],
    [lessonRes, 'recent lessons'],
    [capRes, 'recent capstones'],
  ] as const) {
    if (res.error) throw new Error(`${label}: ${res.error.message}`)
  }

  const lessonTitleMap = new Map<string, string>()
  if (curriculumData?.lessons) {
    for (const lesson of curriculumData.lessons) {
      lessonTitleMap.set(lesson.id, lesson.title || lesson.slug || lesson.id)
    }
  }

  for (const row of (certRes.data || []) as unknown as Array<{ id: string; user_id: string; learner_name: string; issued_at: string; certificate_code: string }>) {
    results.push({
      id: `cert-${row.id}`,
      userId: row.user_id,
      userName: row.learner_name || 'Learner',
      activity: 'earned a certificate',
      entity: row.certificate_code,
      href: `/admin/certificates`,
      timestamp: row.issued_at,
    })
  }

  for (const row of (regRes.data || []) as unknown as Array<{ id: string; name: string | null; email: string; created_at: string }>) {
    results.push({
      id: `reg-${row.id}`,
      userId: row.id,
      userName: row.name || row.email.split('@')[0] || 'New learner',
      activity: 'registered',
      entity: 'new learner account',
      href: `/admin/users?userId=${row.id}`,
      timestamp: row.created_at,
    })
  }

  const lessonRowsTyped = (lessonRes.data || []) as unknown as Array<{ user_id: string; lesson_id: string; completed_at: string }>
  const activityUserIds = new Set(lessonRowsTyped.map((r) => r.user_id))
  const capRowsTyped = (capRes.data || []) as unknown as Array<{ id: string; user_id: string; module_slug: string; submitted_at: string }>
  for (const row of capRowsTyped) activityUserIds.add(row.user_id)

  // One batched name lookup for every lesson/capstone actor (no per-row query).
  const nameMap = new Map<string, string>()
  if (activityUserIds.size > 0) {
    const { data: nameRows } = await supabase.from('users').select('id, name, email').in('id', [...activityUserIds])
    for (const row of (nameRows || []) as unknown as Array<{ id: string; name: string | null; email: string }>) {
      nameMap.set(row.id, row.name || row.email.split('@')[0] || 'Learner')
    }
  }

  for (const row of lessonRowsTyped) {
    results.push({
      id: `lesson-${row.user_id}-${row.lesson_id}`,
      userId: row.user_id,
      userName: nameMap.get(row.user_id) || 'Learner',
      activity: 'completed a lesson',
      entity: lessonTitleMap.get(row.lesson_id) || row.lesson_id,
      href: `/admin/users?userId=${row.user_id}`,
      timestamp: row.completed_at,
    })
  }

  for (const row of capRowsTyped) {
    results.push({
      id: `cap-${row.id}`,
      userId: row.user_id,
      userName: nameMap.get(row.user_id) || 'Learner',
      activity: 'submitted a capstone',
      entity: row.module_slug,
      href: `/admin/users?userId=${row.user_id}`,
      timestamp: row.submitted_at,
    })
  }

  return {
    recentActivity: results
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit),
  }
}

/* ─── Shared helpers ───────────────────────────────────────────────────────── */

/** Users holding a full-curriculum completion badge. Swallows errors to 0, as before. */
async function countCourseCompletionUsers(supabase: ServiceClient): Promise<number> {
  try {
    const { data } = await supabase.from('badges').select('id').eq('key', 'cpo_completion')
    const badgeIds = ((data || []) as unknown as Array<{ id: string }>).map((b) => b.id)
    if (badgeIds.length === 0) return 0
    const { count } = await supabase.from('user_badges').select('user_id', { count: 'exact', head: true }).in('badge_id', badgeIds)
    return count || 0
  } catch {
    return 0
  }
}

/**
 * Verified-account totals from the Auth admin API (first 1000 users, as before). An
 * unreachable Auth API reads as zero here; the system snapshot reports it separately.
 */
async function countVerifiedUsers(
  supabase: ServiceClient,
  startIso: string,
  endIso: string
): Promise<{ total: number; inRange: number }> {
  try {
    const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const authUsers = data?.users || []
    return {
      total: authUsers.filter((u) => Boolean(u.email_confirmed_at)).length,
      inRange: authUsers.filter((u) => u.email_confirmed_at && u.email_confirmed_at >= startIso && u.email_confirmed_at <= endIso).length,
    }
  } catch {
    return { total: 0, inRange: 0 }
  }
}

/** A one-row Auth admin call: true when the Auth API answers without an error. */
async function probeAuthAvailable(): Promise<boolean> {
  try {
    const { error } = await createServiceRoleClient().auth.admin.listUsers({ page: 1, perPage: 1 })
    return !error
  } catch {
    return false
  }
}

type SystemHealth = Awaited<ReturnType<typeof AdminConsoleService.getSystemHealth>>
type EmailQueueOverview = Awaited<ReturnType<typeof AdminConsoleService.getEmailQueueOverview>>

/** Builds the status tiles. A null health/queue (loader failed) renders those tiles as unknown. */
function buildSystemSnapshot(
  health: SystemHealth | null,
  queue: EmailQueueOverview | null,
  authAvailable: boolean
): AdminSystemSnapshotItem[] {
  const lastChecked = health?.lastCheckedAt ?? new Date().toISOString()
  const queueKnown = queue !== null && !queue.failed

  return [
    {
      id: 'database',
      label: 'Database',
      status: health ? health.status : 'unknown',
      lastChecked,
      summary: health ? `${health.databaseLatencyMs} ms latency` : 'Status unavailable',
      href: '/admin/system',
    },
    {
      id: 'auth',
      label: 'Authentication',
      status: authAvailable ? 'healthy' : 'degraded',
      lastChecked,
      summary: authAvailable ? 'Supabase Auth & RLS enforced' : 'Auth API unreachable',
      href: '/admin/system',
    },
    {
      id: 'email',
      label: 'Email',
      status: !queueKnown ? 'unknown' : queue.failedCount > 0 ? 'degraded' : 'healthy',
      lastChecked,
      summary: !queueKnown ? 'Status unavailable' : queue.failedCount > 0 ? `${queue.failedCount} failed` : 'Operational',
      href: '/admin/communications?tab=queue',
    },
    {
      id: 'queue',
      label: 'Queue',
      status: !queueKnown ? 'unknown' : queue.pendingCount > 0 ? 'degraded' : 'healthy',
      lastChecked,
      summary: !queueKnown ? 'Status unavailable' : `${queue.pendingCount} pending`,
      href: '/admin/communications?tab=queue',
    },
    { id: 'notifications', label: 'Notifications', status: 'unknown', lastChecked, summary: 'No telemetry yet', href: '/admin/notifications' },
    { id: 'scheduler', label: 'Scheduler', status: 'unknown', lastChecked, summary: 'No telemetry yet', href: '/admin/system' },
  ]
}
