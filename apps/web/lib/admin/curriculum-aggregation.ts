import type {
  AdminCurriculumKpis,
  AdminLessonOverview,
  AdminLessonType,
  AdminModuleOverview,
} from './types'
import { clampPct } from './users-aggregation'
import type { CurriculumModuleMeta } from './curriculum-meta'
import type { CompiledBlock, CompiledLesson, CurriculumEntry } from '@/types'

/**
 * Pure aggregation helpers for the Phase 4 Curriculum Workspace.
 *
 * These functions contain NO database access — they transform raw row arrays
 * (curriculum entries, compiled lessons, completed-progress rows) into
 * curriculum-workspace-ready shapes so the math can be unit-tested in
 * isolation. The service layer (`CurriculumService`) is responsible for
 * fetching the raw rows; module bucketing, lesson-type detection, KPI counts
 * and completion math live here.
 */

/** Groups curriculum lessons by module, each group sorted by lesson order. */
export function groupLessonsByModule(lessons: CurriculumEntry[]): Map<string, CurriculumEntry[]> {
  const groups = new Map<string, CurriculumEntry[]>()
  for (const lesson of lessons) {
    const arr = groups.get(lesson.module) ?? []
    arr.push(lesson)
    groups.set(lesson.module, arr)
  }
  for (const arr of groups.values()) {
    arr.sort((a, b) => a.order - b.order)
  }
  return groups
}

/**
 * Module slugs in curriculum order (by each module's first lesson order).
 * This is the single source of truth for module numbering — it matches the
 * learner-facing `/academy` ordering exactly.
 */
export function getOrderedModuleSlugs(lessons: CurriculumEntry[]): string[] {
  const firstOrder = new Map<string, number>()
  for (const lesson of lessons) {
    const current = firstOrder.get(lesson.module)
    if (current === undefined || lesson.order < current) {
      firstOrder.set(lesson.module, lesson.order)
    }
  }
  return [...firstOrder.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([slug]) => slug)
}

/**
 * Content types a lesson contains, in canonical order.
 *
 * Mirrors the learner tab shell: everything that is not a quiz, flashcard deck
 * or reflection counts as theory content.
 */
export function detectLessonTypes(blocks: CompiledBlock[]): AdminLessonType[] {
  const found = new Set<AdminLessonType>()
  for (const block of blocks) {
    if (block.type === 'quiz') found.add('quiz')
    else if (block.type === 'flashcardDeck') found.add('flashcards')
    else if (block.type === 'reflection') found.add('reflection')
    else found.add('theory')
  }
  return (['theory', 'quiz', 'flashcards', 'reflection'] as AdminLessonType[]).filter((t) => found.has(t))
}

/** Total quiz questions across a lesson's blocks. */
export function countQuizQuestions(blocks: CompiledBlock[]): number {
  return blocks
    .filter((b) => b.type === 'quiz')
    .reduce((sum, b) => sum + (Array.isArray(b.questions) ? b.questions.length : 0), 0)
}

/** Total flashcards across a lesson's flashcard decks. */
export function countFlashcards(blocks: CompiledBlock[]): number {
  return blocks
    .filter((b) => b.type === 'flashcardDeck')
    .reduce((sum, b) => sum + (Array.isArray(b.cards) ? b.cards.length : 0), 0)
}

/**
 * Curriculum overview KPI values (spec §4.2).
 *
 * `quizzes` and `flashcards` are real counts derived from the compiled lesson
 * blocks (not hardcoded), so they stay accurate as content evolves.
 */
export function buildCurriculumKpis(params: {
  lessons: CurriculumEntry[]
  compiledLessons: CompiledLesson[]
  capstoneCount: number
}): AdminCurriculumKpis {
  const modules = new Set(params.lessons.map((l) => l.module)).size
  let quizzes = 0
  let flashcards = 0
  for (const lesson of params.compiledLessons) {
    quizzes += countQuizQuestions(lesson.blocks)
    flashcards += countFlashcards(lesson.blocks)
  }
  return {
    modules,
    lessons: params.lessons.length,
    quizzes,
    flashcards,
    capstones: params.capstoneCount,
  }
}

/** Per-module completion stats derived from completed-progress rows. */
export interface ModuleCompletionStats {
  /** Distinct learners who completed at least one lesson in the module. */
  learnersStarted: number
  /** lesson_id → distinct-learner completion count. */
  lessonCompletions: Map<string, number>
}

/**
 * Builds per-module completion stats from raw completed rows.
 *
 * `completedRows` is the full `user_lesson_progress` set with
 * `status = 'completed'`. Rows referencing lessons outside the curriculum are
 * ignored (defensive — stale ids after content edits).
 */
export function buildModuleCompletionStats(
  lessons: CurriculumEntry[],
  completedRows: Array<{ lesson_id: string; user_id: string }>
): Map<string, ModuleCompletionStats> {
  const lessonModule = new Map(lessons.map((l) => [l.id, l.module]))
  const byModule = new Map<string, ModuleCompletionStats>()
  const startedByModule = new Map<string, Set<string>>()

  for (const row of completedRows) {
    const moduleSlug = lessonModule.get(row.lesson_id)
    if (!moduleSlug) continue

    let stats = byModule.get(moduleSlug)
    if (!stats) {
      stats = { learnersStarted: 0, lessonCompletions: new Map() }
      byModule.set(moduleSlug, stats)
    }
    stats.lessonCompletions.set(row.lesson_id, (stats.lessonCompletions.get(row.lesson_id) || 0) + 1)

    let started = startedByModule.get(moduleSlug)
    if (!started) {
      started = new Set()
      startedByModule.set(moduleSlug, started)
    }
    started.add(row.user_id)
  }

  for (const [moduleSlug, started] of startedByModule) {
    const stats = byModule.get(moduleSlug)
    if (stats) stats.learnersStarted = started.size
  }

  return byModule
}

/** Completion % of a lesson among the module's started learners (0–100). */
export function computeLessonCompletionPct(completions: number, learnersStarted: number): number {
  if (learnersStarted <= 0) return 0
  return clampPct((completions / learnersStarted) * 100)
}

/**
 * Builds the ordered module overview list for the curriculum page.
 *
 * `avgCompletionPct` is the average per-lesson completion % among learners who
 * started the module — the same denominator the Users workspace uses for
 * "Avg Course Progress", so the two views agree.
 */
export function buildModuleOverviews(
  lessons: CurriculumEntry[],
  stats: Map<string, ModuleCompletionStats>,
  meta: Record<string, CurriculumModuleMeta>
): AdminModuleOverview[] {
  const byModule = groupLessonsByModule(lessons)
  const ordered = getOrderedModuleSlugs(lessons)

  return ordered.map((slug, idx) => {
    const moduleLessons = byModule.get(slug) || []
    const moduleStats = stats.get(slug)
    const learnersStarted = moduleStats?.learnersStarted || 0
    const pcts = moduleLessons.map((l) =>
      computeLessonCompletionPct(moduleStats?.lessonCompletions.get(l.id) || 0, learnersStarted)
    )
    const avgCompletionPct =
      pcts.length > 0 ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10 : 0
    const m = meta[slug]

    return {
      slug,
      number: idx + 1,
      name: m?.name || slug,
      description: m?.description || '',
      icon: m?.icon || '📘',
      lessonCount: moduleLessons.length,
      learnersStarted,
      avgCompletionPct,
      status: 'published',
    }
  })
}

/**
 * Builds the lesson overview rows for a module's lesson table.
 *
 * `compiledLessons` maps lesson id → compiled lesson (used for type detection).
 * Lessons without a compiled file fall back to `['theory']` rather than
 * crashing the table. Each lesson resolves its own module's stats, so the
 * helper is safe even if `lessons` spans multiple modules.
 */
export function buildLessonOverviews(
  lessons: CurriculumEntry[],
  stats: Map<string, ModuleCompletionStats>,
  compiledLessons: Map<string, CompiledLesson>,
  qualityMetrics?: Map<string, { averageClarityScore: number | null; clarityPct: number | null; totalFeedback: number; flaggedIssuesCount: number; needsReview: boolean }>
): AdminLessonOverview[] {
  return lessons.map((lesson) => {
    const moduleStats = stats.get(lesson.module)
    const learnersStarted = moduleStats?.learnersStarted || 0
    const completions = moduleStats?.lessonCompletions.get(lesson.id) || 0
    const compiled = compiledLessons.get(lesson.id)
    const quality = qualityMetrics?.get(lesson.id)

    return {
      id: lesson.id,
      slug: lesson.slug,
      title: lesson.title,
      order: lesson.order,
      difficulty: lesson.difficulty,
      estimatedReadingTime: lesson.estimatedReadingTime,
      estimatedCompletionTime: lesson.estimatedCompletionTime,
      types: compiled ? detectLessonTypes(compiled.blocks) : ['theory'],
      completions,
      completionPct: computeLessonCompletionPct(completions, learnersStarted),
      status: 'published',
      clarityScore: quality ? quality.averageClarityScore : null,
      clarityPct: quality ? quality.clarityPct : null,
      feedbackCount: quality ? quality.totalFeedback : 0,
      flaggedIssuesCount: quality ? quality.flaggedIssuesCount : 0,
      needsReview: quality ? quality.needsReview : false,
    }
  })
}