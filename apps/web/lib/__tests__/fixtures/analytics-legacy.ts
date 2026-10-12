/**
 * The pre-R6 analytics reductions, kept as a test oracle.
 *
 * Before 20261012000001_admin_analytics_rpc.sql, AnalyticsService paged whole
 * tables into Node and reduced them here, in JS. Those reductions now run in
 * Postgres; admin-analytics-rpc-parity.test.ts seeds rows, runs this legacy
 * pipeline over them, and checks the RPC-backed service returns the same thing.
 *
 * `legacyAnalyticsWorkspace` is the old `getAnalyticsWorkspaceData` body with
 * each Supabase query replaced by the same filter over in-memory rows.
 * Do not "fix" anything here: its job is to stay what production used to do.
 */
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
} from '../../admin/analytics-aggregation'
import { getOrderedModuleSlugs } from '../../admin/curriculum-aggregation'
import { CURRICULUM_MODULE_META } from '../../admin/curriculum-meta'
import {
  buildFunnel,
  buildLearnerSeries,
  buildLearningSeries,
  computeTrend,
  mergeSeries,
} from '../../admin/dashboard-aggregation'

import type {
  AdminAnalyticsTab,
  AdminAnalyticsWorkspaceData,
  AdminDateRange,
  AdminLevelDistribution,
  AdminModuleDropOff,
  AdminStreakBucket,
} from '../../admin/types'
import type { CurriculumEntry } from '@/types'

export interface LegacyUserRow {
  id: string
  created_at: string
  level?: number | null
  current_streak?: number | null
  is_portfolio_public?: boolean | null
}
export interface LegacyXpRow {
  user_id: string | null
  xp_amount: number
  source_type: string
  created_at: string
}
export interface LegacyLessonRow {
  user_id: string
  lesson_id: string
  status: string
  completed_at: string | null
}
export interface LegacyQuizRow {
  user_id: string | null
  is_correct: boolean
  attempted_at: string
}
export interface LegacyCapstoneRow {
  id: string
  user_id: string | null
  status: string
  submitted_at: string
}
export interface LegacyCertificateRow {
  id: string
  user_id: string
  issued_at: string
}

export interface LegacyTables {
  users: LegacyUserRow[]
  xp_events: LegacyXpRow[]
  user_lesson_progress: LegacyLessonRow[]
  quiz_attempts: LegacyQuizRow[]
  capstone_submissions: LegacyCapstoneRow[]
  certificates: LegacyCertificateRow[]
  user_badges: Array<{ id: string }>
  user_flashcard_srs: Array<{ user_id: string; flashcard_id: string }>
}

export interface LegacyModuleDef {
  slug: string
  title: string
  order: number
  lessonIds: string[]
}

const t = (iso: string) => new Date(iso).getTime()
/** PostgREST `.gte(col, a).lte(col, b)` on a timestamptz column. */
const between = (value: string | null | undefined, fromIso: string, toIso: string) =>
  Boolean(value) && t(value!) >= t(fromIso) && t(value!) <= t(toIso)

/* ─── Per-scan reductions (one per RPC) ───────────────────────────────────── */

/** Scan #1: all users → totals and distributions. */
export function legacyUserStats(allUsersRows: LegacyUserRow[]): {
  totalUsers: number
  publicPortfolios: number
  levelDistribution: AdminLevelDistribution[]
  streakDistribution: AdminStreakBucket[]
} {
  return {
    totalUsers: allUsersRows.length,
    publicPortfolios: allUsersRows.filter((u) => u.is_portfolio_public).length,
    levelDistribution: computeLevelDistribution(allUsersRows),
    streakDistribution: buildStreakDistribution(allUsersRows),
  }
}

/** Scan #6: every xp_event before the range → the "active before" set. */
export function legacyActiveBeforeSet(xpEvents: LegacyXpRow[], rangeStartIso: string): Set<string> {
  const xpEventsBeforeRange = xpEvents.filter((e) => t(e.created_at) < t(rangeStartIso))
  return new Set(xpEventsBeforeRange.map((e) => e.user_id).filter((id): id is string => Boolean(id)))
}

/** Scan #10: every completed lesson → drop-offs, course completions, first-lesson users. */
export function legacyLessonStats(
  moduleDefs: LegacyModuleDef[],
  progress: LegacyLessonRow[],
  totalUsersCount: number,
  totalLessonsCount: number
): { moduleDropOffs: AdminModuleDropOff[]; courseCompletionsCount: number; usersWithAtLeastOneLesson: number } {
  const allCompletedLessons = progress
    .filter((p) => p.status === 'completed')
    .map((p) => ({ user_id: p.user_id, lesson_id: p.lesson_id }))
  const moduleDropOffs = computeModuleDropOffs(moduleDefs, allCompletedLessons, totalUsersCount)
  const userCompletionsMap = new Map<string, number>()
  for (const row of allCompletedLessons) {
    userCompletionsMap.set(row.user_id, (userCompletionsMap.get(row.user_id) || 0) + 1)
  }
  let courseCompletionsCount = 0
  for (const count of userCompletionsMap.values()) {
    if (totalLessonsCount > 0 && count >= totalLessonsCount) courseCompletionsCount++
  }
  return {
    moduleDropOffs,
    courseCompletionsCount,
    usersWithAtLeastOneLesson: new Set(allCompletedLessons.map((r) => r.user_id)).size,
  }
}

/** Scan #12: every capstone submission, filtered to the range in JS. */
export function legacyCapstoneStats(
  capstoneSubmissionsAll: LegacyCapstoneRow[],
  rangeStartIso: string,
  rangeEndIso: string
): { submitted: number; reviewed: number; seriesSubmittedAt: string[] } {
  const capstonesInRange = capstoneSubmissionsAll.filter(
    (c) => c.submitted_at && c.submitted_at >= rangeStartIso && c.submitted_at <= rangeEndIso
  )
  return {
    submitted: capstonesInRange.length,
    reviewed: capstonesInRange.filter((c) => c.status === 'reviewed').length,
    seriesSubmittedAt: capstoneSubmissionsAll
      .filter(
        (c) =>
          c.user_id !== null && Boolean(c.submitted_at) && c.submitted_at >= rangeStartIso && c.submitted_at <= rangeEndIso
      )
      .map((c) => c.submitted_at),
  }
}

/** Scan #17: every flashcard SRS row. */
export function legacyFlashcardStats(rows: Array<{ user_id: string }>): { total: number; distinctUsers: number } {
  return { total: rows.length, distinctUsers: new Set(rows.map((r) => r.user_id)).size }
}

/* ─── The whole old pipeline ──────────────────────────────────────────────── */

export function legacyModuleDefs(lessons: CurriculumEntry[]): LegacyModuleDef[] {
  return getOrderedModuleSlugs(lessons).map((slug, idx) => {
    const meta = CURRICULUM_MODULE_META[slug]
    return {
      slug,
      title: meta?.name || slug,
      order: idx + 1,
      lessonIds: lessons.filter((l) => l.module === slug).map((l) => l.id),
    }
  })
}

export function legacyAnalyticsWorkspace(params: {
  tables: LegacyTables
  lessons: CurriculumEntry[]
  range: AdminDateRange
  now: Date
  tab: AdminAnalyticsTab
}): AdminAnalyticsWorkspaceData {
  const { tables, lessons, range, now, tab } = params
  const rangeStartIso = range.start.toISOString()
  const rangeEndIso = range.end.toISOString()
  const durationMs = range.end.getTime() - range.start.getTime()
  const prevEnd = new Date(range.start.getTime() - 1)
  const prevStart = new Date(prevEnd.getTime() - durationMs)
  const prevStartIso = prevStart.toISOString()
  const prevEndIso = prevEnd.toISOString()
  const mauCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const totalLessonsCount = lessons.length

  const allUsersRows = tables.users
  const usersInRange = tables.users.filter((u) => between(u.created_at, rangeStartIso, rangeEndIso))
  const usersInPrevRange = tables.users.filter((u) => between(u.created_at, prevStartIso, prevEndIso))
  const xpEventsInRange = tables.xp_events.filter((e) => between(e.created_at, rangeStartIso, rangeEndIso))
  const xpEventsInPrevRange = tables.xp_events.filter((e) => between(e.created_at, prevStartIso, prevEndIso))
  const xpEventsTrailing30d = tables.xp_events.filter((e) => t(e.created_at) >= mauCutoff.getTime())
  const completed = tables.user_lesson_progress.filter((p) => p.status === 'completed')
  const lessonProgressInRange = completed.filter((p) => between(p.completed_at, rangeStartIso, rangeEndIso))
  const lessonProgressInPrevRange = completed.filter((p) => between(p.completed_at, prevStartIso, prevEndIso))
  const quizAttemptsInRange = tables.quiz_attempts.filter((q) => between(q.attempted_at, rangeStartIso, rangeEndIso))
  const certificatesInRange = tables.certificates.filter((c) => between(c.issued_at, rangeStartIso, rangeEndIso))
  const certificatesInPrevRange = tables.certificates.filter((c) => between(c.issued_at, prevStartIso, prevEndIso))
  const allCertificates = tables.certificates

  const userStats = legacyUserStats(allUsersRows)
  const usersActiveBeforeSet = legacyActiveBeforeSet(tables.xp_events, rangeStartIso)
  const moduleDefs = legacyModuleDefs(lessons)
  const lessonStats = legacyLessonStats(moduleDefs, tables.user_lesson_progress, userStats.totalUsers, totalLessonsCount)
  const capstones = legacyCapstoneStats(tables.capstone_submissions, rangeStartIso, rangeEndIso)
  const flashcards = legacyFlashcardStats(tables.user_flashcard_srs)

  const activeUserMetrics = computeActiveUserMetrics(
    xpEventsTrailing30d.filter((e): e is LegacyXpRow & { user_id: string } => e.user_id !== null),
    now
  )
  const activeUsersInRangeSet = new Set(xpEventsInRange.map((e) => e.user_id).filter((id): id is string => Boolean(id)))
  const newVsReturning = computeNewVsReturning({
    activeUserIds: activeUsersInRangeSet,
    usersActiveBeforeWindow: usersActiveBeforeSet,
  })
  const totalUsersCount = userStats.totalUsers

  const learnerSeries = buildLearnerSeries({
    range,
    newUsers: usersInRange,
    xpEvents: xpEventsInRange.filter((e): e is LegacyXpRow & { user_id: string } => e.user_id !== null),
    usersActiveBeforeWindow: usersActiveBeforeSet,
  })
  const learningSeries = buildLearningSeries({
    range,
    lessonsCompleted: lessonProgressInRange.map((l) => ({ completed_at: l.completed_at || rangeStartIso })),
    quizAttempts: quizAttemptsInRange.filter((q): q is LegacyQuizRow & { user_id: string } => q.user_id !== null),
    capstonesSubmitted: capstones.seriesSubmittedAt.map((submitted_at) => ({ submitted_at })),
  })
  const consolidatedSeries = mergeSeries(learnerSeries, learningSeries)

  const courseCompletionPct =
    totalUsersCount > 0 ? Math.round((lessonStats.courseCompletionsCount / totalUsersCount) * 1000) / 10 : 0
  const moduleCompletionPct = computeModuleCompletionPct(
    lessonStats.moduleDropOffs.map((m) => ({ completedPct: m.completionPct }))
  )
  const xpEarnedInRange = xpEventsInRange.reduce((sum, e) => sum + Math.max(0, e.xp_amount || 0), 0)
  const prevXpEarned = xpEventsInPrevRange.reduce((sum, e) => sum + Math.max(0, e.xp_amount || 0), 0)
  const prevActiveLearners = new Set(xpEventsInPrevRange.map((e) => e.user_id)).size
  const usersWithAtLeastOneQuiz = new Set(quizAttemptsInRange.map((r) => r.user_id)).size
  const totalLessonsCompleted = lessonProgressInRange.length

  return {
    range,
    tab,
    overview: {
      kpis: {
        totalUsers: totalUsersCount,
        activeLearners: activeUsersInRangeSet.size,
        newUsers: usersInRange.length,
        verifiedUsers: totalUsersCount,
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
      funnel: buildFunnel([
        { key: 'registered', label: 'Registered', count: totalUsersCount },
        { key: 'first_lesson', label: 'First Lesson', count: lessonStats.usersWithAtLeastOneLesson },
        { key: 'first_quiz', label: 'First Quiz', count: usersWithAtLeastOneQuiz },
        { key: 'module_complete', label: 'Module Complete', count: lessonStats.moduleDropOffs[0]?.learnersCompleted || 0 },
        { key: 'course_complete', label: 'Course Complete', count: lessonStats.courseCompletionsCount },
        { key: 'certificate', label: 'Certificate Issued', count: allCertificates.length },
      ]),
      consolidatedSeries,
    },
    learners: {
      dau: activeUserMetrics.dau,
      wau: activeUserMetrics.wau,
      mau: activeUserMetrics.mau,
      newLearners: newVsReturning.newLearners,
      returningLearners: newVsReturning.returningLearners,
      activeLearners: activeUsersInRangeSet.size,
      totalUsers: totalUsersCount,
      verifiedUsers: totalUsersCount,
      levelDistribution: userStats.levelDistribution,
      streakDistribution: userStats.streakDistribution,
      growthSeries: consolidatedSeries,
    },
    learning: {
      totalLessonsCompleted,
      courseCompletionPct,
      moduleCompletionPct,
      quizStats: computeQuizPerformanceStats(quizAttemptsInRange),
      moduleDropOffs: lessonStats.moduleDropOffs,
      learningSeries: consolidatedSeries,
    },
    engagement: {
      streakDistribution: userStats.streakDistribution,
      xpEarned: xpEarnedInRange,
      xpBySource: computeXpBySource(xpEventsInRange),
      srsReviews: flashcards.total,
      activeFlashcardLearners: flashcards.distinctUsers,
      dailyXpSeries: buildDailyXpSeries(xpEventsInRange, range),
    },
    outcomes: {
      certificatesIssued: certificatesInRange.length,
      capstonesSubmitted: capstones.submitted,
      capstonesReviewed: capstones.reviewed,
      badgesAwarded: tables.user_badges.length,
      publicPortfolios: userStats.publicPortfolios,
      certificateSeries: buildCertificateSeries(certificatesInRange, range),
    },
  }
}
