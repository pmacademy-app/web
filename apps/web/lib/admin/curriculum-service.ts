import { createServiceRoleClient } from '../supabase'
import { fetchCompiledLesson, fetchCurriculumData } from '../lesson-loader'
import { getAllCapstoneDefinitions } from '@/config/capstones'
import {
  buildCurriculumKpis,
  buildLessonOverviews,
  buildModuleCompletionStats,
  buildModuleOverviews,
  computeLessonCompletionPct,
  detectLessonTypes,
  getOrderedModuleSlugs,
} from './curriculum-aggregation'
import { CURRICULUM_MODULE_META, getCurriculumModuleMeta } from './curriculum-meta'
import {
  buildStreakDistribution,
  computeActiveUserMetrics,
  computeModuleCompletionPct,
  computeNewVsReturning,
} from './analytics-aggregation'
import { buildModuleProgress, clampPct, computeQuizAvgScore } from './users-aggregation'
import { buildLearnerSeries, buildLearningSeries, mergeSeries, resolveRange } from './dashboard-aggregation'
import type {
  AdminCurriculumOverview,
  AdminDateRangeKey,
  AdminLearningAnalytics,
  AdminLessonDetail,
  AdminModuleDetail,
} from './types'
import type { CompiledLesson, CurriculumEntry } from '@/types'

/**
 * Curriculum / Learning Analytics data service (Phase 4).
 *
 * Follows the same split as the dashboard: raw row fetching lives here, while
 * the bucketing/conversion math lives in the pure helpers under
 * `curriculum-aggregation.ts` and `analytics-aggregation.ts` so it can be
 * unit-tested in isolation.
 *
 * Static content (curriculum.json + compiled lessons) is always available, so
 * only the live completion/engagement queries can fail. Those failures degrade
 * to zeroed stats with a `failed` flag rather than crashing the page — the
 * workspaces render an error state with a retry action (spec §63).
 */
export class CurriculumService {
  /** Fetches every row matching a builder, walking Supabase's 1,000-row page limit. */
  private static async fetchAllRows<T>(
    buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
  ): Promise<T[]> {
    const pageSize = 1000
    const rows: T[] = []
    let start = 0
    // Guard against runaway loops (1M rows is far beyond launch scale).
    while (start < 1_000_000) {
      const { data, error } = await buildPage(start, start + pageSize - 1)
      if (error) throw new Error(error.message)
      if (!data || data.length === 0) break
      rows.push(...data)
      if (data.length < pageSize) break
      start += pageSize
    }
    return rows
  }

  /** Loads every compiled lesson for a set of curriculum entries (deduped per render). */
  private static async fetchAllCompiledLessons(lessons: CurriculumEntry[]): Promise<CompiledLesson[]> {
    const results = await Promise.all(lessons.map((l) => fetchCompiledLesson(l.id)))
    return results.filter((l): l is CompiledLesson => l !== null)
  }

  /**
   * Fetches all completed-progress rows (optionally scoped to a set of lesson
   * ids). DB failures degrade to empty rows with `failed: true` so the static
   * curriculum content still renders.
   */
  private static async fetchCompletedRows(
    supabase: ReturnType<typeof createServiceRoleClient>,
    scope?: { lessonIds: string[] }
  ): Promise<{ rows: Array<{ lesson_id: string; user_id: string }>; failed: boolean }> {
    try {
      const builder = (from: number, to: number) => {
        let query = supabase
          .from('user_lesson_progress')
          .select('lesson_id, user_id')
          .eq('status', 'completed')
        if (scope?.lessonIds.length) {
          query = query.in('lesson_id', scope.lessonIds)
        }
        return query.range(from, to)
      }
      const rows = await this.fetchAllRows<{ lesson_id: string; user_id: string }>(builder)
      return { rows, failed: false }
    } catch (err) {
      console.warn('[CurriculumService] fetchCompletedRows failed:', err)
      return { rows: [], failed: true }
    }
  }

  /**
   * Curriculum overview payload (spec §4.2): KPI cards + module cards.
   *
   * KPI counts (modules/lessons/quizzes/flashcards/capstones) come from static
   * content and are always accurate; completion stats degrade to zero when the
   * database is unreachable (`failed` lets the workspace render an error state).
   */
  public static async getCurriculumOverview(): Promise<{
    overview: AdminCurriculumOverview
    failed: boolean
  }> {
    const curriculum = await fetchCurriculumData()
    const lessons = curriculum?.lessons || []
    const supabase = createServiceRoleClient()

    const [compiledLessons, completed] = await Promise.all([
      this.fetchAllCompiledLessons(lessons),
      this.fetchCompletedRows(supabase),
    ])
    const { rows: completedRows, failed } = completed

    const stats = buildModuleCompletionStats(lessons, completedRows)
    const modules = buildModuleOverviews(lessons, stats, CURRICULUM_MODULE_META)
    const kpis = buildCurriculumKpis({
      lessons,
      compiledLessons,
      capstoneCount: getAllCapstoneDefinitions().length,
    })

    return {
      overview: {
        kpis,
        modules,
        totalLearners: new Set(completedRows.map((r) => r.user_id)).size,
        totalLessonsCompleted: completedRows.length,
      },
      failed,
    }
  }

  /**
   * Module detail payload (spec §4.3–4.4): module header + lesson table.
   *
   * Returns `module: null` when the slug does not exist in the curriculum
   * (the page renders notFound). Completion stats degrade to zero on DB failure.
   */
  public static async getModuleDetail(moduleSlug: string): Promise<{
    module: AdminModuleDetail | null
    failed: boolean
  }> {
    const curriculum = await fetchCurriculumData()
    const lessons = curriculum?.lessons || []
    const moduleLessons = lessons
      .filter((l) => l.module === moduleSlug)
      .sort((a, b) => a.order - b.order)
    if (moduleLessons.length === 0) return { module: null, failed: false }

    const supabase = createServiceRoleClient()
    const [compiledLessons, completed] = await Promise.all([
      this.fetchAllCompiledLessons(moduleLessons),
      this.fetchCompletedRows(supabase, { lessonIds: moduleLessons.map((l) => l.id) }),
    ])
    const { rows: completedRows, failed } = completed

    const stats = buildModuleCompletionStats(moduleLessons, completedRows)
    const compiledMap = new Map(compiledLessons.map((l) => [l.id, l]))
    const lessonOverviews = buildLessonOverviews(moduleLessons, stats, compiledMap)
    const learnersStarted = stats.get(moduleSlug)?.learnersStarted || 0
    const avgCompletionPct =
      lessonOverviews.length > 0
        ? Math.round(
            (lessonOverviews.reduce((sum, l) => sum + l.completionPct, 0) / lessonOverviews.length) * 10
          ) / 10
        : 0
    const meta = getCurriculumModuleMeta(moduleSlug)
    const moduleNumber = getOrderedModuleSlugs(lessons).indexOf(moduleSlug) + 1

    return {
      module: {
        slug: moduleSlug,
        number: moduleNumber,
        name: meta?.name || moduleSlug,
        description: meta?.description || '',
        icon: meta?.icon || '📘',
        lessonCount: moduleLessons.length,
        learnersStarted,
        avgCompletionPct,
        status: 'published',
        lessons: lessonOverviews,
      },
      failed,
    }
  }

  /**
   * Lesson detail payload (spec §4.5–4.6): metadata panel + learner preview.
   *
   * Returns `lesson: null` when the lesson id does not exist in the curriculum
   * (the page renders notFound). Completion/quiz stats degrade to zero on DB
   * failure — the preview itself is static content and always renders.
   */
  public static async getLessonDetail(lessonId: string): Promise<{
    lesson: AdminLessonDetail | null
    failed: boolean
  }> {
    const [curriculum, compiled] = await Promise.all([fetchCurriculumData(), fetchCompiledLesson(lessonId)])
    const lessons = curriculum?.lessons || []
    const meta = lessons.find((l) => l.id === lessonId)
    if (!compiled || !meta) return { lesson: null, failed: false }

    const moduleLessons = lessons.filter((l) => l.module === meta.module)
    const supabase = createServiceRoleClient()

    let quizFailed = false
    const [completed, quizRows] = await Promise.all([
      this.fetchCompletedRows(supabase, { lessonIds: moduleLessons.map((l) => l.id) }),
      this.fetchAllRows<{ is_correct: boolean }>((from, to) =>
        supabase.from('quiz_attempts').select('is_correct').eq('lesson_id', lessonId).range(from, to)
      ).catch(() => {
        quizFailed = true
        return [] as Array<{ is_correct: boolean }>
      }),
    ])
    const { rows: completedRows, failed } = completed

    const stats = buildModuleCompletionStats(moduleLessons, completedRows)
    const learnersStarted = stats.get(meta.module)?.learnersStarted || 0
    const completions = stats.get(meta.module)?.lessonCompletions.get(lessonId) || 0

    const moduleMeta = getCurriculumModuleMeta(meta.module)
    const moduleNumber = getOrderedModuleSlugs(lessons).indexOf(meta.module) + 1
    const globalOrder = lessons.findIndex((l) => l.id === lessonId) + 1
    const titleById = new Map(lessons.map((l) => [l.id, l.title]))
    const prerequisites = meta.prerequisites
      .map((id) => titleById.get(id))
      .filter((t): t is string => Boolean(t))

    return {
      lesson: {
        id: lessonId,
        slug: meta.slug,
        title: compiled.title || meta.title,
        module: meta.module,
        moduleName: moduleMeta?.name || meta.module,
        moduleNumber,
        order: meta.order,
        globalOrder,
        difficulty: meta.difficulty,
        estimatedReadingTime: meta.estimatedReadingTime,
        estimatedCompletionTime: meta.estimatedCompletionTime,
        prerequisites,
        types: detectLessonTypes(compiled.blocks),
        completions,
        completionPct: computeLessonCompletionPct(completions, learnersStarted),
        quizAttempts: quizRows.length,
        quizAvgScore: computeQuizAvgScore(quizRows),
        status: 'published',
        blocks: compiled.blocks as Array<Record<string, unknown>>,
      },
      failed: failed || quizFailed,
    }
  }

  /**
   * Learning analytics payload (spec §4.7): learners, engagement, learning,
   * outcomes and daily series for a date range.
   *
   * DAU/WAU/MAU are trailing-window snapshots (last 24h/7d/30d) so they stay
   * meaningful regardless of the selected range preset; everything else is
   * scoped to the resolved range.
   */
  public static async getLearningAnalytics(
    rangeKey: AdminDateRangeKey = '30d',
    from?: string | null,
    to?: string | null
  ): Promise<AdminLearningAnalytics> {
    const supabase = createServiceRoleClient()
    const range = resolveRange(rangeKey, from, to)
    const rangeStartIso = range.start.toISOString()
    const rangeEndIso = range.end.toISOString()

    const now = new Date()
    const mauCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const curriculum = await fetchCurriculumData()
    const lessons = curriculum?.lessons || []

    // ── Parallel data fetches ─────────────────────────────────────────────────
    const [
      usersInRange,
      xpInRange,
      xpBeforeRange,
      xpTrailing30d,
      lessonsInRange,
      completedRowsAll,
      quizRows,
      capstonesInRange,
      usersRows,
      srsRows,
      certsRes,
      portfoliosRes,
      totalUsersRes,
    ] = await Promise.all([
      this.fetchAllRows<{ id: string; created_at: string }>((from, to) =>
        supabase
          .from('users')
          .select('id, created_at')
          .gte('created_at', rangeStartIso)
          .lte('created_at', rangeEndIso)
          .range(from, to)
      ),
      this.fetchAllRows<{ user_id: string; xp_amount: number; created_at: string }>((from, to) =>
        supabase
          .from('xp_events')
          .select('user_id, xp_amount, created_at')
          .gte('created_at', rangeStartIso)
          .lte('created_at', rangeEndIso)
          .range(from, to)
      ),
      this.fetchAllRows<{ user_id: string }>((from, to) =>
        supabase.from('xp_events').select('user_id').lt('created_at', rangeStartIso).range(from, to)
      ),
      this.fetchAllRows<{ user_id: string; created_at: string }>((from, to) =>
        supabase
          .from('xp_events')
          .select('user_id, created_at')
          .gte('created_at', mauCutoff.toISOString())
          .range(from, to)
      ),
      this.fetchAllRows<{ user_id: string; completed_at: string | null }>((from, to) =>
        supabase
          .from('user_lesson_progress')
          .select('user_id, completed_at')
          .eq('status', 'completed')
          .gte('completed_at', rangeStartIso)
          .lte('completed_at', rangeEndIso)
          .range(from, to)
      ),
      this.fetchAllRows<{ lesson_id: string; user_id: string }>((from, to) =>
        supabase.from('user_lesson_progress').select('lesson_id, user_id').eq('status', 'completed').range(from, to)
      ),
      this.fetchAllRows<{ user_id: string; is_correct: boolean; attempted_at: string }>((from, to) =>
        supabase
          .from('quiz_attempts')
          .select('user_id, is_correct, attempted_at')
          .gte('attempted_at', rangeStartIso)
          .lte('attempted_at', rangeEndIso)
          .range(from, to)
      ),
      this.fetchAllRows<{ user_id: string; submitted_at: string | null }>((from, to) =>
        supabase
          .from('capstone_submissions')
          .select('user_id, submitted_at')
          .gte('submitted_at', rangeStartIso)
          .lte('submitted_at', rangeEndIso)
          .range(from, to)
      ),
      this.fetchAllRows<{ current_streak?: number | null }>((from, to) =>
        supabase.from('users').select('current_streak').range(from, to)
      ),
      this.fetchAllRows<{ user_id: string }>((from, to) =>
        supabase.from('user_flashcard_srs').select('user_id').range(from, to)
      ),
      supabase
        .from('certificates')
        .select('id', { count: 'exact', head: true })
        .gte('issued_at', rangeStartIso)
        .lte('issued_at', rangeEndIso),
      supabase.from('users').select('id', { count: 'exact', head: true }).eq('is_portfolio_public', true),
      supabase.from('users').select('id', { count: 'exact', head: true }),
    ])

    // ── Learners ──────────────────────────────────────────────────────────────
    const activeUserIds = new Set(xpInRange.map((e) => e.user_id))
    const usersActiveBeforeWindow = new Set(xpBeforeRange.map((r) => r.user_id))
    const { newLearners, returningLearners } = computeNewVsReturning({
      activeUserIds,
      usersActiveBeforeWindow,
    })
    const { dau, wau, mau } = computeActiveUserMetrics(xpTrailing30d, now)

    // ── Learning ──────────────────────────────────────────────────────────────
    const lessonsCompleted = lessonsInRange.filter((l) => l.completed_at).length
    const quizAttempts = quizRows.length
    const quizAvgScore = computeQuizAvgScore(quizRows)

    // Per-user completed lesson sets (all-time) drive module + course completion.
    const byUser = new Map<string, Set<string>>()
    for (const row of completedRowsAll) {
      let set = byUser.get(row.user_id)
      if (!set) {
        set = new Set()
        byUser.set(row.user_id, set)
      }
      set.add(row.lesson_id)
    }

    // Average module completion % across learners with any progress.
    let moduleCompletionSum = 0
    let moduleCompletionCount = 0
    const moduleTotals = new Map<string, { sum: number; count: number }>()
    for (const ids of byUser.values()) {
      const modules = buildModuleProgress(ids, lessons)
      moduleCompletionSum += computeModuleCompletionPct(modules)
      moduleCompletionCount++
      for (const m of modules) {
        const entry = moduleTotals.get(m.slug) || { sum: 0, count: 0 }
        entry.sum += m.completedPct
        entry.count += 1
        moduleTotals.set(m.slug, entry)
      }
    }
    const moduleCompletionPct =
      moduleCompletionCount > 0 ? clampPct(moduleCompletionSum / moduleCompletionCount) : 0
    // Order modules by curriculum position (matches the curriculum page), not
    // alphabetically — unknown slugs sort after the known curriculum modules.
    const orderedSlugs = getOrderedModuleSlugs(lessons)
    const modules = [...moduleTotals.entries()]
      .map(([slug, { sum, count }]) => ({
        slug,
        title: getCurriculumModuleMeta(slug)?.name || slug,
        completedPct: count > 0 ? clampPct(sum / count) : 0,
      }))
      .sort((a, b) => {
        const aIdx = orderedSlugs.indexOf(a.slug)
        const bIdx = orderedSlugs.indexOf(b.slug)
        return (aIdx === -1 ? orderedSlugs.length : aIdx) - (bIdx === -1 ? orderedSlugs.length : bIdx)
      })

    // Course completion: learners holding the cpo_completion badge.
    let courseCompletionUsers = 0
    try {
      const { data: badgeRows } = await supabase.from('badges').select('id').eq('key', 'cpo_completion')
      const badgeIds = ((badgeRows || []) as unknown as Array<{ id: string }>).map((b) => b.id)
      if (badgeIds.length > 0) {
        const badgeUserRows = await this.fetchAllRows<{ user_id: string }>((from, to) =>
          supabase.from('user_badges').select('user_id').in('badge_id', badgeIds).range(from, to)
        )
        courseCompletionUsers = new Set(badgeUserRows.map((r) => r.user_id)).size
      }
    } catch {
      courseCompletionUsers = 0
    }
    const totalUsers = totalUsersRes?.count ?? 0
    const courseCompletionPct =
      totalUsers === 0 ? 0 : Math.round((courseCompletionUsers / totalUsers) * 1000) / 10

    // ── Engagement ────────────────────────────────────────────────────────────
    const streakDistribution = buildStreakDistribution(usersRows)
    const xpEarned = xpInRange.reduce((sum, e) => sum + (e.xp_amount || 0), 0)
    const srsReviews = srsRows.length
    const activeFlashcardLearners = new Set(srsRows.map((r) => r.user_id)).size

    // ── Outcomes ──────────────────────────────────────────────────────────────
    const certificatesIssued = certsRes?.count ?? 0
    const capstonesSubmitted = capstonesInRange.length
    const publicPortfolios = portfoliosRes?.count ?? 0

    // ── Series ────────────────────────────────────────────────────────────────
    const learnerSeries = buildLearnerSeries({
      range,
      newUsers: usersInRange,
      xpEvents: xpInRange,
      usersActiveBeforeWindow,
    })
    const learningSeries = buildLearningSeries({
      range,
      lessonsCompleted: lessonsInRange.filter(
        (l): l is { user_id: string; completed_at: string } => l.completed_at !== null
      ),
      quizAttempts: quizRows,
      capstonesSubmitted: capstonesInRange.filter(
        (c): c is { user_id: string; submitted_at: string } => c.submitted_at !== null
      ),
    })
    const series = mergeSeries(learnerSeries, learningSeries)

    return {
      range,
      learners: {
        dau,
        wau,
        mau,
        newLearners,
        returningLearners,
        activeLearners: activeUserIds.size,
      },
      learning: {
        lessonsCompleted,
        moduleCompletionPct,
        courseCompletionPct,
        quizAttempts,
        quizAvgScore,
        modules,
      },
      engagement: {
        streakDistribution,
        xpEarned,
        srsReviews,
        activeFlashcardLearners,
      },
      outcomes: {
        certificatesIssued,
        capstonesSubmitted,
        publicPortfolios,
      },
      series,
    }
  }
}