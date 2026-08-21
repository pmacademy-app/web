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
  buildStreakDistribution,
  computeActiveUserMetrics,
  computeLevelDistribution,
  computeModuleCompletionPct,
  computeModuleDropOffs,
  computeNewVsReturning,
  computeQuizPerformanceStats,
  computeXpBySource,
} from './analytics-aggregation'
import { getOrderedModuleSlugs } from './curriculum-aggregation'
import { CURRICULUM_MODULE_META } from './curriculum-meta'
import { fetchAllRows } from './fetch-all'

import type {
  AdminAnalyticsTab,
  AdminAnalyticsWorkspaceData,
  AdminDateRangeKey,
  AdminExecutiveOverview,
  AdminLearnerDemographics,
  AdminLearningDeepAnalytics,
  AdminEngagementAnalytics,
  AdminOutcomesAnalytics,
} from './types'

export class AnalyticsService {
  /**
   * Fetches and aggregates complete analytics workspace data across all 5 domains.
   */
  public static async getAnalyticsWorkspaceData(params?: {
    rangeKey?: AdminDateRangeKey
    from?: string | null
    to?: string | null
    tab?: AdminAnalyticsTab
  }): Promise<AdminAnalyticsWorkspaceData> {
    const rangeKey = params?.rangeKey || '30d'
    const tab = params?.tab || 'overview'
    const range = resolveRange(rangeKey, params?.from, params?.to)
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


      // ── Parallel batch queries ──────────────────────────────────────────────
      const [
        allUsersRows,
        usersInRange,
        usersInPrevRange,
        xpEventsInRange,
        xpEventsInPrevRange,
        xpEventsBeforeRange,
        xpEventsTrailing30d,
        lessonProgressInRange,
        lessonProgressInPrevRange,
        allCompletedLessons,
        quizAttemptsInRange,
        capstoneSubmissionsAll,

        certificatesInRange,
        certificatesInPrevRange,
        allCertificates,
        badgesAwardedRes,
        flashcardSrsRows,
      ] = await Promise.all([
        // All users (for levels, streaks, total, portfolios)
        fetchAllRows<{
          id: string
          created_at: string
          level?: number | null
          current_streak?: number | null
          is_portfolio_public?: boolean | null
        }>((from, to) =>
          supabase
            .from('users')
            .select('id, created_at, level, current_streak, is_portfolio_public')
            .range(from, to)
        ),
        // Users joined in current range
        fetchAllRows<{ id: string; created_at: string }>((from, to) =>
          supabase
            .from('users')
            .select('id, created_at')
            .gte('created_at', rangeStartIso)
            .lte('created_at', rangeEndIso)
            .range(from, to)
        ),
        // Users joined in previous range
        fetchAllRows<{ id: string }>((from, to) =>
          supabase
            .from('users')
            .select('id')
            .gte('created_at', prevStartIso)
            .lte('created_at', prevEndIso)
            .range(from, to)
        ),
        // XP events in range
        fetchAllRows<{ user_id: string | null; xp_amount: number; source_type: string; created_at: string }>((from, to) =>
          supabase
            .from('xp_events')
            .select('user_id, xp_amount, source_type, created_at')
            .gte('created_at', rangeStartIso)
            .lte('created_at', rangeEndIso)
            .range(from, to)
        ),
        // XP events in previous range
        fetchAllRows<{ user_id: string | null; xp_amount: number }>((from, to) =>
          supabase
            .from('xp_events')
            .select('user_id, xp_amount')
            .gte('created_at', prevStartIso)
            .lte('created_at', prevEndIso)
            .range(from, to)
        ),
        // XP users before range (for returning learners)
        fetchAllRows<{ user_id: string | null }>((from, to) =>
          supabase.from('xp_events').select('user_id').lt('created_at', rangeStartIso).range(from, to)
        ),
        // XP events trailing 30d (for DAU/WAU/MAU)
        fetchAllRows<{ user_id: string | null; created_at: string }>((from, to) =>
          supabase
            .from('xp_events')
            .select('user_id, created_at')
            .gte('created_at', mauCutoff.toISOString())
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
            .range(from, to)
        ),
        // All lesson completions
        fetchAllRows<{ user_id: string; lesson_id: string }>((from, to) =>
          supabase.from('user_lesson_progress').select('user_id, lesson_id').eq('status', 'completed').range(from, to)
        ),
        // Quiz attempts in range
        fetchAllRows<{ user_id: string | null; is_correct: boolean; attempted_at: string }>((from, to) =>
          supabase
            .from('quiz_attempts')
            .select('user_id, is_correct, attempted_at')
            .gte('attempted_at', rangeStartIso)
            .lte('attempted_at', rangeEndIso)
            .range(from, to)
        ),
        // Capstone submissions

        fetchAllRows<{ id: string; user_id: string | null; status: string; submitted_at: string }>((from, to) =>
          supabase.from('capstone_submissions').select('id, user_id, status, submitted_at').range(from, to)
        ),
        // Certificates in range
        fetchAllRows<{ id: string; user_id: string; issued_at: string }>((from, to) =>
          supabase
            .from('certificates')
            .select('id, user_id, issued_at')
            .gte('issued_at', rangeStartIso)
            .lte('issued_at', rangeEndIso)
            .range(from, to)
        ),
        // Certificates in previous range
        fetchAllRows<{ id: string }>((from, to) =>
          supabase
            .from('certificates')
            .select('id')
            .gte('issued_at', prevStartIso)
            .lte('issued_at', prevEndIso)
            .range(from, to)
        ),
        // All certificates
        fetchAllRows<{ id: string; user_id: string; issued_at: string }>((from, to) =>
          supabase.from('certificates').select('id, user_id, issued_at').range(from, to)
        ),
        // Badges count
        supabase.from('user_badges').select('id', { count: 'exact', head: true }),
        // Flashcard SRS rows
        fetchAllRows<{ user_id: string }>((from, to) =>
          supabase.from('user_flashcard_srs').select('user_id').range(from, to)
        ),
      ])

      // ── Process Learner Demographics ─────────────────────────────────────────
      const activeUserMetrics = computeActiveUserMetrics(
        xpEventsTrailing30d.filter((e): e is { user_id: string; created_at: string } => e.user_id !== null),
        now
      )
      const usersActiveBeforeSet = new Set(xpEventsBeforeRange.map((e) => e.user_id).filter((id): id is string => Boolean(id)))
      const activeUsersInRangeSet = new Set(xpEventsInRange.map((e) => e.user_id).filter((id): id is string => Boolean(id)))
      const newVsReturning = computeNewVsReturning({
        activeUserIds: activeUsersInRangeSet,
        usersActiveBeforeWindow: usersActiveBeforeSet,
      })

      const totalUsersCount = allUsersRows.length
      const verifiedUsersCount = totalUsersCount
      const levelDistribution = computeLevelDistribution(allUsersRows)
      const streakDistribution = buildStreakDistribution(allUsersRows)

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
        capstonesSubmitted: capstoneSubmissionsAll
          .filter((c): c is { id: string; user_id: string; status: string; submitted_at: string } => c.user_id !== null && Boolean(c.submitted_at) && c.submitted_at! >= rangeStartIso && c.submitted_at! <= rangeEndIso)
          .map((c) => ({ submitted_at: c.submitted_at! })),
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

      // Map module lessons in curriculum order
      const orderedSlugs = getOrderedModuleSlugs(lessons)
      const moduleDefs = orderedSlugs.map((slug, idx) => {
        const meta = CURRICULUM_MODULE_META[slug]
        return {
          slug,
          title: meta?.name || slug,
          order: idx + 1,
          lessonIds: lessons.filter((l) => l.module === slug).map((l) => l.id),
        }
      })


      // Module drop-offs and completion
      const moduleDropOffs = computeModuleDropOffs(moduleDefs, allCompletedLessons, totalUsersCount)

      // Overall course completion: learners who completed all published lessons
      const userCompletionsMap = new Map<string, number>()
      for (const row of allCompletedLessons) {
        userCompletionsMap.set(row.user_id, (userCompletionsMap.get(row.user_id) || 0) + 1)
      }
      let courseCompletionsCount = 0
      for (const count of userCompletionsMap.values()) {
        if (totalLessonsCount > 0 && count >= totalLessonsCount) courseCompletionsCount++
      }
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

      const distinctFlashcardLearners = new Set(flashcardSrsRows.map((r) => r.user_id)).size
      const engagement: AdminEngagementAnalytics = {
        streakDistribution,
        xpEarned: xpEarnedInRange,
        xpBySource,
        srsReviews: flashcardSrsRows.length,
        activeFlashcardLearners: distinctFlashcardLearners,
        dailyXpSeries,
      }

      // ── Process Outcomes & Achievements ──────────────────────────────────────
      const capstonesInRange = capstoneSubmissionsAll.filter(
        (c) => c.submitted_at && c.submitted_at >= rangeStartIso && c.submitted_at <= rangeEndIso
      )
      const capstonesReviewedInRange = capstonesInRange.filter((c) => c.status === 'reviewed').length
      const publicPortfoliosCount = allUsersRows.filter((u) => u.is_portfolio_public).length
      const badgesAwardedCount = badgesAwardedRes.count || 0
      const certificateSeries = buildCertificateSeries(certificatesInRange, range)

      const outcomes: AdminOutcomesAnalytics = {
        certificatesIssued: certificatesInRange.length,
        capstonesSubmitted: capstonesInRange.length,
        capstonesReviewed: capstonesReviewedInRange,
        badgesAwarded: badgesAwardedCount,
        publicPortfolios: publicPortfoliosCount,
        certificateSeries,
      }

      // ── Process Executive Overview & Funnel ──────────────────────────────────
      const prevXpEarned = xpEventsInPrevRange.reduce((sum, e) => sum + Math.max(0, e.xp_amount || 0), 0)
      const prevActiveLearners = new Set(xpEventsInPrevRange.map((e) => e.user_id)).size

      // Funnel stages (Registered -> First Lesson -> First Quiz -> Module 1 Complete -> Course Complete -> Certificate)
      const usersWithAtLeastOneLesson = new Set(allCompletedLessons.map((r) => r.user_id)).size
      const usersWithAtLeastOneQuiz = new Set(quizAttemptsInRange.map((r) => r.user_id)).size
      const firstModuleCompletedCount = moduleDropOffs[0]?.learnersCompleted || 0

      const funnel = buildFunnel([
        { key: 'registered', label: 'Registered', count: totalUsersCount },
        { key: 'first_lesson', label: 'First Lesson', count: usersWithAtLeastOneLesson },
        { key: 'first_quiz', label: 'First Quiz', count: usersWithAtLeastOneQuiz },
        { key: 'module_complete', label: 'Module Complete', count: firstModuleCompletedCount },
        { key: 'course_complete', label: 'Course Complete', count: courseCompletionsCount },
        { key: 'certificate', label: 'Certificate Issued', count: allCertificates.length },
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
      }
    } catch (err) {
      console.error('[AnalyticsService] Error aggregating analytics workspace data:', err)
      return this.getFallbackWorkspaceData(range, tab)
    }
  }

  /** Safe empty fallback structure if DB queries fail. */
  private static getFallbackWorkspaceData(
    range: import('./types').AdminDateRange,
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
    }
  }
}
