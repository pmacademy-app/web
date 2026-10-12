
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

import {
  buildCertificateSeries,
  buildDailyXpSeries,
  computeActiveUserMetrics,
  computeModuleCompletionPct,
  computeNewVsReturning,
  computeQuizPerformanceStats,
  computeXpBySource,
} from './analytics-aggregation'
import {
  courseCompletionsFromStats,
  fetchActiveUsers,
  fetchCapstoneStats,
  fetchFlashcardStats,
  fetchLessonCompletionStats,
  fetchUserStats,
  levelDistributionFromStats,
  moduleDropOffsFromStats,
  streakDistributionFromStats,
  type AdminModuleDef,
} from './analytics-rpc'
import { ADMIN_CACHE_TAGS } from './cache-tags'
import { cacheWithMaxAge } from './bounded-cache'
import { getOrderedModuleSlugs } from './curriculum-aggregation'
import { CURRICULUM_MODULE_META } from './curriculum-meta'
import { fetchAllRows } from './fetch-all'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '../supabase'
import type {
  AdminAnalyticsGrowthData,
  AdminAnalyticsTab,
  AdminAnalyticsWorkspaceData,
  AdminDateRange,
  AdminDateRangeKey,
  AdminExecutiveOverview,
  AdminLearnerDemographics,
  AdminLearningDeepAnalytics,
  AdminEngagementAnalytics,
  AdminOutcomesAnalytics,
} from './types'

/** How long a computed analytics workspace is served from the Next.js data cache. */
export const ANALYTICS_CACHE_SECONDS = 90

/**
 * idempotency_key prefixes of celebratable achievement notifications. Restated from
 * ACHIEVEMENT_CELEBRATION_KEY_PREFIXES (lib/notifications/in-app/achievement-celebrations.ts)
 * so analytics does not import the notification stack; analytics-growth.test.ts pins them.
 *
 * These count notification rows, not achievements. A capstone rejected and then published on
 * re-review has two rows (`capstone-reviewed-<id>` and `…-published`) and a re-granted Fellow has
 * one per grant: each counts as created, and the row retired when its sibling is claimed counts
 * as claimed too (same `celebrated_at`). So such an achievement is 2 created / 2 claimed, not 1 / 1.
 */
export const GROWTH_CELEBRATION_KEY_PREFIXES = [
  'certificate-generated-',
  'capstone-reviewed-',
  'fellow-granted-',
  'module-completed-',
] as const

const FELLOW_REQUEST_STATUSES = ['pending', 'approved', 'rejected'] as const

type HeadCountResult = { count: number | null; error: { message: string } | null }

/** All-zero growth payload, marked failed. */
export function emptyGrowthData(): AdminAnalyticsGrowthData {
  return {
    celebrations: { created: 0, claimed: 0 },
    referrals: { created: 0, signedUp: 0, activated: 0, rewarded: 0 },
    publicCapstonePages: 0,
    fellowRequests: { total: 0, pending: 0, approved: 0, rejected: 0 },
    failed: true,
  }
}

/**
 * Growth tab counts (C6). Head counts only (`count: 'exact', head: true`): no rows are
 * transferred. Bounded by [startIso, endIso] wherever the table has a timestamp; the public
 * capstone page count is current. Never throws: a failed count is 0 and `failed` is set.
 */
export async function fetchGrowthData(
  supabase: SupabaseClient<Database>,
  startIso: string,
  endIso: string
): Promise<AdminAnalyticsGrowthData> {
  const head = { count: 'exact' as const, head: true }
  const celebratableFilter = GROWTH_CELEBRATION_KEY_PREFIXES.map((p) => `idempotency_key.like.${p}%`).join(',')

  const queries: Array<PromiseLike<HeadCountResult>> = [
    // Celebratable achievement notifications created in range
    supabase
      .from('in_app_notifications')
      .select('id', head)
      .or(celebratableFilter)
      .gte('created_at', startIso)
      .lte('created_at', endIso),
    // Celebrations claimed in range
    supabase
      .from('in_app_notifications')
      .select('id', head)
      .gte('celebrated_at', startIso)
      .lte('celebrated_at', endIso),
    // Referrals created in range (referred_user_id is NOT NULL, so these are signups)
    supabase.from('referrals').select('id', head).gte('created_at', startIso).lte('created_at', endIso),
    // Referrals created in range that have since activated
    supabase
      .from('referrals')
      .select('id', head)
      .in('status', ['activated', 'rewarded'])
      .gte('created_at', startIso)
      .lte('created_at', endIso),
    // Referrals rewarded in range
    supabase.from('referrals').select('id', head).gte('rewarded_at', startIso).lte('rewarded_at', endIso),
    // Public capstone pages right now: reviewed + public, owner's portfolio public and
    // owner has a username (the public page URL needs one).
    supabase
      .from('capstone_submissions')
      .select('id, users!capstone_submissions_user_id_fkey!inner(id)', head)
      .eq('status', 'reviewed')
      .eq('is_public', true)
      .eq('users.is_portfolio_public', true)
      .not('users.username', 'is', null),
    // Fellow requests in range, one count per status
    ...FELLOW_REQUEST_STATUSES.map((status) =>
      supabase
        .from('fellow_requests')
        .select('id', head)
        .eq('status', status)
        .gte('requested_at', startIso)
        .lte('requested_at', endIso)
    ),
  ]

  let failed = false
  const counts = await Promise.all(
    queries.map(async (query) => {
      try {
        const { count, error } = await query
        if (error) {
          failed = true
          console.error('[AnalyticsService] growth count failed:', error.message)
          return 0
        }
        return count ?? 0
      } catch (err) {
        failed = true
        console.error('[AnalyticsService] growth count threw:', err)
        return 0
      }
    })
  )

  const [celebrationsCreated, celebrationsClaimed, referralsCreated, referralsActivated, referralsRewarded, publicCapstonePages, pending, approved, rejected] = counts

  return {
    celebrations: { created: celebrationsCreated, claimed: celebrationsClaimed },
    referrals: {
      created: referralsCreated,
      signedUp: referralsCreated,
      activated: referralsActivated,
      rewarded: referralsRewarded,
    },
    publicCapstonePages,
    fellowRequests: { total: pending + approved + rejected, pending, approved, rejected },
    ...(failed ? { failed: true } : {}),
  }
}

const ANALYTICS_RANGE_KEYS: ReadonlySet<string> = new Set<AdminDateRangeKey>(['today', '7d', '30d', '90d', 'custom'])
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

export interface AnalyticsRangeInput {
  rangeKey: AdminDateRangeKey
  from: string | null
  to: string | null
}

/**
 * Reduces caller-supplied range inputs to ones that resolve without throwing and give a
 * bounded cache key, as the dashboard does (`resolveDashboardRange` / `rangeKeyParts`):
 * a preset drops from/to, and an unknown key or a custom range whose bounds are missing
 * or not `YYYY-MM-DD` dates falls back to the default 30 days.
 */
export function normalizeAnalyticsRange(
  rangeKey?: string | null,
  from?: string | null,
  to?: string | null
): AnalyticsRangeInput {
  const fallback: AnalyticsRangeInput = { rangeKey: '30d', from: null, to: null }
  if (!rangeKey || !ANALYTICS_RANGE_KEYS.has(rangeKey)) return fallback
  if (rangeKey !== 'custom') return { rangeKey: rangeKey as AdminDateRangeKey, from: null, to: null }
  if (typeof from !== 'string' || typeof to !== 'string' || !DATE_KEY_RE.test(from) || !DATE_KEY_RE.test(to)) {
    return fallback
  }
  try {
    const range = resolveRange('custom', from, to)
    if (Number.isNaN(range.start.getTime()) || Number.isNaN(range.end.getTime())) return fallback
  } catch {
    return fallback
  }
  return { rangeKey: 'custom', from, to }
}

/**
 * Thrown inside the cached function when a computed workspace is marked `failed`.
 * unstable_cache does not store a rejection, so a partial result is never served for the
 * next 90s; the caller unwraps it and returns the uncached payload for this request.
 * `cacheWithMaxAge` delivers the rejection on a stale entry as well, where unstable_cache
 * alone would swallow it and keep serving the last healthy workspace.
 */
class UncachedAnalyticsFailure extends Error {
  constructor(readonly data: AdminAnalyticsWorkspaceData) {
    super('analytics workspace computed with failed sections; not cached')
    this.name = 'UncachedAnalyticsFailure'
  }
}

/**
 * unstable_cache JSON-serializes its result, so on a cache hit the range's Date fields come
 * back as ISO strings. Rebuild them so callers always get real Date instances.
 */
export function reviveAnalyticsWorkspaceData(data: AdminAnalyticsWorkspaceData): AdminAnalyticsWorkspaceData {
  return { ...data, range: { ...data.range, start: new Date(data.range.start), end: new Date(data.range.end) } }
}

export class AnalyticsService {
  /**
   * Returns the analytics workspace, cached for 90s under the `admin-analytics` tag. A
   * result with `failed: true` is never cached, and a stale entry is recomputed before it
   * is returned (see ./bounded-cache).
   *
   * The key is the normalized range plus growth vs every other tab: only the growth tab
   * changes what is computed, so the other five share one entry. The `tab` echoed in the
   * payload is set after the cache read, so it is always the tab that was asked for.
   *
   * The cached function uses the service-role client only; it must never read request
   * cookies or headers (next/headers), which unstable_cache forbids.
   */
  public static async getAnalyticsWorkspaceData(params?: {
    rangeKey?: AdminDateRangeKey
    from?: string | null
    to?: string | null
    tab?: AdminAnalyticsTab
  }): Promise<AdminAnalyticsWorkspaceData> {
    const { rangeKey, from, to } = normalizeAnalyticsRange(params?.rangeKey, params?.from, params?.to)
    const tab = params?.tab || 'overview'
    const compute = () => this.computeWorkspaceData({ rangeKey, from, to, tab })
    const rangeParts = rangeKey === 'custom' ? [rangeKey, from ?? '', to ?? ''] : [rangeKey]

    try {
      const cached = cacheWithMaxAge(
        async () => {
          const data = await compute()
          if (data.failed) throw new UncachedAnalyticsFailure(data)
          return data
        },
        ['admin-analytics', ...rangeParts, tab === 'growth' ? 'growth' : 'base'],
        { revalidate: ANALYTICS_CACHE_SECONDS, tags: [ADMIN_CACHE_TAGS.analytics] }
      )
      return { ...reviveAnalyticsWorkspaceData(await cached()), tab }
    } catch (err) {
      if (err instanceof UncachedAnalyticsFailure) return { ...err.data, tab }
      // The data cache itself failed (not the queries): serve this request uncached.
      console.warn('[AnalyticsService] analytics cache unavailable, computing uncached:', err)
      return compute()
    }
  }

  /**
   * Fetches and aggregates complete analytics workspace data across all 5 domains.
   *
   * Whole-table reductions run in Postgres via the admin analytics RPCs
   * (supabase/migrations/20261012000001_admin_analytics_rpc.sql, see
   * ./analytics-rpc.ts). Every row fetch left here is bounded by a date range.
   * Never throws: a failed section is zeroed and the payload marked `failed`.
   */
  private static async computeWorkspaceData(params: {
    rangeKey: AdminDateRangeKey
    from: string | null
    to: string | null
    tab: AdminAnalyticsTab
  }): Promise<AdminAnalyticsWorkspaceData> {
    const { rangeKey, tab } = params
    const range = resolveRange(rangeKey, params.from, params.to)
    const rangeStartIso = range.start.toISOString()
    const rangeEndIso = range.end.toISOString()

    // Compute previous comparison window for trends
    const durationMs = range.end.getTime() - range.start.getTime()
    const prevEnd = new Date(range.start.getTime() - 1)
    const prevStart = new Date(prevEnd.getTime() - durationMs)
    const prevStartIso = prevStart.toISOString()
    const prevEndIso = prevEnd.toISOString()

    const now = new Date()
    const mauCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    try {
      const supabase = createServiceRoleClient()
      const curriculum = await fetchCurriculumData()
      const lessons = curriculum?.lessons || []
      const totalLessonsCount = lessons.length

      // Map module lessons in curriculum order. The curriculum is static JSON,
      // so the lesson stats RPC is told which lessons make up each module.
      const orderedSlugs = getOrderedModuleSlugs(lessons)
      const moduleDefs: AdminModuleDef[] = orderedSlugs.map((slug, idx) => {
        const meta = CURRICULUM_MODULE_META[slug]
        return {
          slug,
          title: meta?.name || slug,
          order: idx + 1,
          lessonIds: lessons.filter((l) => l.module === slug).map((l) => l.id),
        }
      })

      // ── Parallel batch queries ──────────────────────────────────────────────
      // An RPC that errors resolves to null: its section is zeroed and the
      // payload is marked `failed`, but the rest of the page still renders.
      const [
        userStats,
        usersInRange,
        usersInPrevRange,
        xpEventsInRange,
        xpEventsInPrevRange,
        activeUsers,
        xpEventsTrailing30d,
        lessonProgressInRange,
        lessonProgressInPrevRange,
        lessonStats,
        quizAttemptsInRange,
        capstoneStats,
        certificatesInRange,
        certificatesInPrevRange,
        certificatesTotalRes,
        badgesAwardedRes,
        flashcardStats,
        growth,
      ] = await Promise.all([
        // #1 Levels, streaks, total users, public portfolios
        fetchUserStats(supabase),
        // Every paged read below is ordered by its range column and then its primary key:
        // without a total order, pages past the 1000-row cap can overlap or skip rows.
        // Users joined in current range
        fetchAllRows<{ id: string; created_at: string }>((from, to) =>
          supabase
            .from('users')
            .select('id, created_at')
            .gte('created_at', rangeStartIso)
            .lte('created_at', rangeEndIso)
            .order('created_at')
            .order('id')
            .range(from, to)
        ),
        // Users joined in previous range
        fetchAllRows<{ id: string }>((from, to) =>
          supabase
            .from('users')
            .select('id')
            .gte('created_at', prevStartIso)
            .lte('created_at', prevEndIso)
            .order('created_at')
            .order('id')
            .range(from, to)
        ),
        // XP events in range
        fetchAllRows<{ user_id: string | null; xp_amount: number; source_type: string; created_at: string }>((from, to) =>
          supabase
            .from('xp_events')
            .select('user_id, xp_amount, source_type, created_at')
            .gte('created_at', rangeStartIso)
            .lte('created_at', rangeEndIso)
            .order('created_at')
            .order('id')
            .range(from, to)
        ),
        // XP events in previous range
        fetchAllRows<{ user_id: string | null; xp_amount: number }>((from, to) =>
          supabase
            .from('xp_events')
            .select('user_id, xp_amount')
            .gte('created_at', prevStartIso)
            .lte('created_at', prevEndIso)
            .order('created_at')
            .order('id')
            .range(from, to)
        ),
        // #6 Users active in range, and whether each was active before it
        fetchActiveUsers(supabase, rangeStartIso, rangeEndIso),
        // XP events trailing 30d (for DAU/WAU/MAU)
        fetchAllRows<{ user_id: string | null; created_at: string }>((from, to) =>
          supabase
            .from('xp_events')
            .select('user_id, created_at')
            .gte('created_at', mauCutoff.toISOString())
            .order('created_at')
            .order('id')
            .range(from, to)
        ),
        // Lesson completions in range
        fetchAllRows<{ user_id: string; lesson_id: string; completed_at: string | null }>((from, to) =>
          supabase
            .from('user_lesson_progress')
            .select('user_id, lesson_id, completed_at')
            .eq('status', 'completed')
            .gte('completed_at', rangeStartIso)
            .lte('completed_at', rangeEndIso)
            .order('completed_at')
            .order('user_id')
            .order('lesson_id')
            .range(from, to)
        ),
        // Lesson completions in previous range
        fetchAllRows<{ user_id: string }>((from, to) =>
          supabase
            .from('user_lesson_progress')
            .select('user_id')
            .eq('status', 'completed')
            .gte('completed_at', prevStartIso)
            .lte('completed_at', prevEndIso)
            .order('completed_at')
            .order('user_id')
            .order('lesson_id')
            .range(from, to)
        ),
        // #10 Module drop-offs, course completion, first-lesson funnel
        fetchLessonCompletionStats(supabase, moduleDefs),
        // Quiz attempts in range
        fetchAllRows<{ user_id: string | null; is_correct: boolean; attempted_at: string }>((from, to) =>
          supabase
            .from('quiz_attempts')
            .select('user_id, is_correct, attempted_at')
            .gte('attempted_at', rangeStartIso)
            .lte('attempted_at', rangeEndIso)
            .order('attempted_at')
            .order('id')
            .range(from, to)
        ),
        // #12 Capstone submissions in range
        fetchCapstoneStats(supabase, rangeStartIso, rangeEndIso),
        // Certificates in range
        fetchAllRows<{ id: string; user_id: string; issued_at: string }>((from, to) =>
          supabase
            .from('certificates')
            .select('id, user_id, issued_at')
            .gte('issued_at', rangeStartIso)
            .lte('issued_at', rangeEndIso)
            .order('issued_at')
            .order('id')
            .range(from, to)
        ),
        // Certificates in previous range
        fetchAllRows<{ id: string }>((from, to) =>
          supabase
            .from('certificates')
            .select('id')
            .gte('issued_at', prevStartIso)
            .lte('issued_at', prevEndIso)
            .order('issued_at')
            .order('id')
            .range(from, to)
        ),
        // #15 All certificates (count only, for the funnel)
        supabase.from('certificates').select('id', { count: 'exact', head: true }),
        // Badges count (user_badges has no `id` column; its key is user_id + badge_id)
        supabase.from('user_badges').select('user_id', { count: 'exact', head: true }),
        // #17 Flashcard SRS rows and distinct learners
        fetchFlashcardStats(supabase),
        // C6 growth head counts, only for the growth tab
        tab === 'growth' ? fetchGrowthData(supabase, rangeStartIso, rangeEndIso) : Promise.resolve(undefined),
      ])

      if (certificatesTotalRes.error) {
        console.error('[AnalyticsService] Certificate count failed:', certificatesTotalRes.error.message)
      }
      if (badgesAwardedRes.error) {
        console.error('[AnalyticsService] Badge count failed:', badgesAwardedRes.error.message)
      }
      const failed =
        !userStats ||
        !activeUsers ||
        !lessonStats ||
        !capstoneStats ||
        !flashcardStats ||
        Boolean(certificatesTotalRes.error) ||
        Boolean(badgesAwardedRes.error) ||
        Boolean(growth?.failed)

      // ── Process Learner Demographics ─────────────────────────────────────────
      const activeUserMetrics = computeActiveUserMetrics(
        xpEventsTrailing30d.filter((e): e is { user_id: string; created_at: string } => e.user_id !== null),
        now
      )
      // Only learners active in range are ever looked up in this set, so the
      // RPC flags exactly those learners rather than every earlier learner.
      const usersActiveBeforeSet = activeUsers?.activeBefore ?? new Set<string>()
      const activeUsersInRangeSet = new Set(xpEventsInRange.map((e) => e.user_id).filter((id): id is string => Boolean(id)))
      const newVsReturning = computeNewVsReturning({
        activeUserIds: activeUsersInRangeSet,
        usersActiveBeforeWindow: usersActiveBeforeSet,
      })

      const totalUsersCount = userStats?.total ?? 0
      const verifiedUsersCount = totalUsersCount
      const levelDistribution = userStats ? levelDistributionFromStats(userStats) : []
      const streakDistribution = userStats ? streakDistributionFromStats(userStats) : []

      // Time series: Learner Activity & Learning Activity
      const learnerSeries = buildLearnerSeries({
        range,
        newUsers: usersInRange,
        xpEvents: xpEventsInRange.filter((e): e is { user_id: string; xp_amount: number; source_type: string; created_at: string } => e.user_id !== null),
        usersActiveBeforeWindow: usersActiveBeforeSet,
      })

      const learningSeries = buildLearningSeries({
        range,
        lessonsCompleted: lessonProgressInRange.map((l) => ({ completed_at: l.completed_at || rangeStartIso })),
        quizAttempts: quizAttemptsInRange.filter((q): q is { user_id: string; is_correct: boolean; attempted_at: string } => q.user_id !== null),
        capstonesSubmitted: (capstoneStats?.submittedAt ?? []).map((submitted_at) => ({ submitted_at })),
      })

      const consolidatedSeries = mergeSeries(learnerSeries, learningSeries)

      const learners: AdminLearnerDemographics = {
        dau: activeUserMetrics.dau,
        wau: activeUserMetrics.wau,
        mau: activeUserMetrics.mau,
        newLearners: newVsReturning.newLearners,
        returningLearners: newVsReturning.returningLearners,
        activeLearners: activeUsersInRangeSet.size,
        totalUsers: totalUsersCount,
        verifiedUsers: verifiedUsersCount,
        levelDistribution,
        streakDistribution,
        growthSeries: consolidatedSeries,
      }

      // ── Process Learning Deep Analytics ──────────────────────────────────────
      const totalLessonsCompleted = lessonProgressInRange.length
      const quizStats = computeQuizPerformanceStats(quizAttemptsInRange)

      // Module drop-offs and completion
      const moduleDropOffs = lessonStats ? moduleDropOffsFromStats(moduleDefs, lessonStats, totalUsersCount) : []

      // Overall course completion: learners who completed all published lessons
      const courseCompletionsCount = lessonStats ? courseCompletionsFromStats(lessonStats, totalLessonsCount) : 0
      const courseCompletionPct =
        totalUsersCount > 0 ? Math.round((courseCompletionsCount / totalUsersCount) * 1000) / 10 : 0
      const moduleCompletionPct = computeModuleCompletionPct(
        moduleDropOffs.map((m) => ({ completedPct: m.completionPct }))
      )

      const learning: AdminLearningDeepAnalytics = {
        totalLessonsCompleted,
        courseCompletionPct,
        moduleCompletionPct,
        quizStats,
        moduleDropOffs,
        learningSeries: consolidatedSeries,
      }

      // ── Process Engagement Analytics ─────────────────────────────────────────
      const xpEarnedInRange = xpEventsInRange.reduce((sum, e) => sum + Math.max(0, e.xp_amount || 0), 0)
      const xpBySource = computeXpBySource(xpEventsInRange)
      const dailyXpSeries = buildDailyXpSeries(xpEventsInRange, range)

      const engagement: AdminEngagementAnalytics = {
        streakDistribution,
        xpEarned: xpEarnedInRange,
        xpBySource,
        srsReviews: flashcardStats?.total ?? 0,
        activeFlashcardLearners: flashcardStats?.distinctUsers ?? 0,
        dailyXpSeries,
      }

      // ── Process Outcomes & Achievements ──────────────────────────────────────
      const publicPortfoliosCount = userStats?.publicPortfolios ?? 0
      const badgesAwardedCount = badgesAwardedRes.count || 0
      const certificateSeries = buildCertificateSeries(certificatesInRange, range)

      const outcomes: AdminOutcomesAnalytics = {
        certificatesIssued: certificatesInRange.length,
        capstonesSubmitted: capstoneStats?.submitted ?? 0,
        capstonesReviewed: capstoneStats?.reviewed ?? 0,
        badgesAwarded: badgesAwardedCount,
        publicPortfolios: publicPortfoliosCount,
        certificateSeries,
      }

      // ── Process Executive Overview & Funnel ──────────────────────────────────
      const prevXpEarned = xpEventsInPrevRange.reduce((sum, e) => sum + Math.max(0, e.xp_amount || 0), 0)
      const prevActiveLearners = new Set(xpEventsInPrevRange.map((e) => e.user_id)).size

      // Funnel stages (Registered -> First Lesson -> First Quiz -> Module 1 Complete -> Course Complete -> Certificate)
      const usersWithAtLeastOneLesson = lessonStats?.distinctUsers ?? 0
      const usersWithAtLeastOneQuiz = new Set(quizAttemptsInRange.map((r) => r.user_id)).size
      const firstModuleCompletedCount = moduleDropOffs[0]?.learnersCompleted || 0

      const funnel = buildFunnel([
        { key: 'registered', label: 'Registered', count: totalUsersCount },
        { key: 'first_lesson', label: 'First Lesson', count: usersWithAtLeastOneLesson },
        { key: 'first_quiz', label: 'First Quiz', count: usersWithAtLeastOneQuiz },
        { key: 'module_complete', label: 'Module Complete', count: firstModuleCompletedCount },
        { key: 'course_complete', label: 'Course Complete', count: courseCompletionsCount },
        { key: 'certificate', label: 'Certificate Issued', count: certificatesTotalRes.count || 0 },
      ])

      const overview: AdminExecutiveOverview = {
        kpis: {
          totalUsers: totalUsersCount,
          activeLearners: activeUsersInRangeSet.size,
          newUsers: usersInRange.length,
          verifiedUsers: verifiedUsersCount,
          lessonsCompleted: totalLessonsCompleted,
          courseCompletionPct,
          xpEarned: xpEarnedInRange,
          certificatesIssued: certificatesInRange.length,
          trends: {
            totalUsers: computeTrend(totalUsersCount, totalUsersCount - usersInRange.length),
            activeLearners: computeTrend(activeUsersInRangeSet.size, prevActiveLearners),
            newUsers: computeTrend(usersInRange.length, usersInPrevRange.length),
            verifiedUsers: null,
            lessonsCompleted: computeTrend(totalLessonsCompleted, lessonProgressInPrevRange.length),
            courseCompletionPct: null,
            xpEarned: computeTrend(xpEarnedInRange, prevXpEarned),
            certificatesIssued: computeTrend(certificatesInRange.length, certificatesInPrevRange.length),
          },
        },
        funnel,
        consolidatedSeries,
      }

      return {
        range,
        tab,
        overview,
        learners,
        learning,
        engagement,
        outcomes,
        ...(growth ? { growth } : {}),
        ...(failed ? { failed: true } : {}),
      }
    } catch (err) {
      console.error('[AnalyticsService] Error aggregating analytics workspace data:', err)
      return this.getFallbackWorkspaceData(range, tab)
    }
  }

  /** Safe empty fallback structure if DB queries fail. */
  private static getFallbackWorkspaceData(
    range: AdminDateRange,
    tab: AdminAnalyticsTab
  ): AdminAnalyticsWorkspaceData {
    return {
      range,
      tab,
      failed: true,
      overview: {
        kpis: {
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
        },
        funnel: [],
        consolidatedSeries: [],
      },
      learners: {
        dau: 0,
        wau: 0,
        mau: 0,
        newLearners: 0,
        returningLearners: 0,
        activeLearners: 0,
        totalUsers: 0,
        verifiedUsers: 0,
        levelDistribution: [],
        streakDistribution: [],
        growthSeries: [],
      },
      learning: {
        totalLessonsCompleted: 0,
        courseCompletionPct: 0,
        moduleCompletionPct: 0,
        quizStats: {
          totalAttempts: 0,
          passedAttempts: 0,
          passRatePct: 0,
          avgScorePct: null,
          scoreDistribution: [],
        },
        moduleDropOffs: [],
        learningSeries: [],
      },
      engagement: {
        streakDistribution: [],
        xpEarned: 0,
        xpBySource: [],
        srsReviews: 0,
        activeFlashcardLearners: 0,
        dailyXpSeries: [],
      },
      outcomes: {
        certificatesIssued: 0,
        capstonesSubmitted: 0,
        capstonesReviewed: 0,
        badgesAwarded: 0,
        publicPortfolios: 0,
        certificateSeries: [],
      },
      ...(tab === 'growth' ? { growth: emptyGrowthData() } : {}),
    }
  }
}
