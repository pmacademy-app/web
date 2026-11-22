/**
 * GET /api/lessons/[lessonId]
 *
 * One lesson for a signed-in learner, as the web lesson page builds it, for clients that
 * render lessons themselves (the mobile app). It applies the same rules as
 * app/(app)/academy/[moduleSlug]/[lessonId]/page.tsx:
 *
 * - Access: the lesson gate (resolveLessonAccess). A locked lesson is a 403 LESSON_LOCKED
 *   naming the lesson to complete first, and no body.
 * - Recut experiment: under `treatment` the theory is the Core blocks, the Deep-dive comes
 *   separately, and the quiz is the learner's seeded 5-question sample of the bank.
 * - Answers stay on the server: every block passes through toClientLesson, so quiz
 *   questions carry no `correctAnswer` or `explanation` (the check route reveals one at a
 *   time) and Mermaid blocks carry only their pre-rendered `svg`.
 *
 * Progress, quiz checks and submits keep using the existing /api/v2/lessons/[lessonId]/*
 * routes; this route only reads.
 */

import { requireUserId } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { getLearnerDbForRequest } from '@/lib/auth'
import { toClientLesson } from '@/lib/academy/client-lesson'
import { getRecutVariant, type RecutVariant } from '@/lib/academy/experiment'
import { isLessonIdFormat } from '@/lib/academy/lesson-ids'
import {
  getCoreReadingMinutes,
  getDeepDiveBlocks,
  getDeepDiveReadingMinutes,
  withSampledQuiz,
} from '@/lib/academy/lesson-structure'
import { isModuleEntryUnlockTreatment } from '@/lib/academy/module-entry-unlock'
import { resolveLessonAccess } from '@/lib/curriculum-access'
import { getLessonPosition, type LessonPosition } from '@/lib/curriculum/lesson-position'
import { fetchCompiledLesson, fetchCurriculumData, getAdjacentLessons } from '@/lib/lesson-loader'
import { getBlocksForTab, withInteractiveBlocksOnly } from '@/app/(app)/academy/[moduleSlug]/[lessonId]/lesson-tabs'
import type { CompiledBlock, CompiledLesson } from '@/types'

type ProgressRow = {
  status: 'not_started' | 'in_progress' | 'completed'
  theory_read_at: string | null
  quiz_score: number | null
  quiz_attempts: number
  xp_earned: number
  completed_at: string | null
}

const NOT_STARTED: ProgressRow = {
  status: 'not_started',
  theory_read_at: null,
  quiz_score: null,
  quiz_attempts: 0,
  xp_earned: 0,
  completed_at: null,
}

type LessonLink = { id: string; title: string; module: string } | null

export interface LessonResponse {
  success: true
  lesson: {
    id: string
    title: string
    module: string
    inShort: string | null
    difficulty: number
    estimatedReadingTime: number
    estimatedCompletionTime: number
  }
  position: LessonPosition
  variant: RecutVariant
  readingMinutes: { core: number; deepDive: number }
  /** Theory blocks: all non-tab blocks under control, the Core blocks under treatment. */
  theoryBlocks: CompiledBlock[]
  /** Deep-dive blocks (treatment only; empty under control). */
  deepDiveBlocks: CompiledBlock[]
  /** quiz (sampled, no answers), flashcardDeck and reflection blocks. */
  interactiveBlocks: CompiledBlock[]
  progress: ProgressRow
  previous: LessonLink
  next: LessonLink
}

/** Strips server-only fields (quiz answers, Mermaid source) from a list of blocks. */
function clientBlocks(lesson: CompiledLesson, blocks: CompiledBlock[]): CompiledBlock[] {
  return toClientLesson({ ...lesson, blocks }).blocks
}

export const GET = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'lessons.read',
    summary: 'Unexpected failure reading a lesson',
  },
  async ({ request, actor, params }) => {
    const userId = requireUserId(actor)
    const lessonId = params.lessonId
    if (!isLessonIdFormat(lessonId)) {
      throw new RouteError(404, 'NOT_FOUND', 'Lesson not found.')
    }

    const [lesson, curriculum] = await Promise.all([fetchCompiledLesson(lessonId), fetchCurriculumData()])
    if (!lesson) {
      throw new RouteError(404, 'NOT_FOUND', 'Lesson not found.')
    }
    const curriculumLessons = curriculum?.lessons ?? []

    const supabase = await getLearnerDbForRequest(request)
    const [{ data: userRow }, { data: progressRows }] = await Promise.all([
      supabase.from('users').select('created_at, curriculum_access_override').eq('id', userId).maybeSingle(),
      supabase
        .from('user_lesson_progress')
        .select('lesson_id, status, theory_read_at, quiz_score, quiz_attempts, xp_earned, completed_at')
        .eq('user_id', userId),
    ])

    const rows = (progressRows ?? []) as ({ lesson_id: string } & ProgressRow)[]
    const completedIds = new Set(rows.filter((r) => r.status === 'completed').map((r) => r.lesson_id))
    const openedIds = new Set(rows.map((r) => r.lesson_id))
    const user = userRow as { created_at?: string; curriculum_access_override?: boolean } | null

    const access = resolveLessonAccess(lessonId, {
      curriculum: curriculumLessons,
      completedIds,
      openedIds,
      treatment: isModuleEntryUnlockTreatment({ id: userId, createdAt: user?.created_at }),
      override: Boolean(user?.curriculum_access_override),
    })

    if (!access.isAccessible) {
      const prereq = curriculumLessons.find((l) => l.id === access.prerequisiteLessonId)
      throw new RouteError(403, 'LESSON_LOCKED', 'Complete the previous lesson to unlock this one.', {
        prerequisiteLessonId: prereq?.id ?? null,
        prerequisiteTitle: prereq?.title ?? null,
      })
    }

    const own = rows.find((r) => r.lesson_id === lessonId)
    const progress: ProgressRow = own
      ? {
          status: own.status,
          theory_read_at: own.theory_read_at,
          quiz_score: own.quiz_score,
          quiz_attempts: own.quiz_attempts,
          xp_earned: own.xp_earned,
          completed_at: own.completed_at,
        }
      : NOT_STARTED

    const variant = getRecutVariant(userId)
    const sampled = variant === 'treatment' ? withSampledQuiz(lesson, `${userId}:${lessonId}`) : lesson

    const { prevId, nextId } = await getAdjacentLessons(lessonId)
    const link = (id: string | null): LessonLink => {
      const entry = id ? curriculumLessons.find((l) => l.id === id) : undefined
      return entry ? { id: entry.id, title: entry.title, module: entry.module } : null
    }

    const body: LessonResponse = {
      success: true,
      lesson: {
        id: lesson.id,
        title: lesson.title,
        module: lesson.module,
        inShort: lesson.inShort ?? null,
        difficulty: lesson.difficulty,
        estimatedReadingTime: lesson.estimatedReadingTime,
        estimatedCompletionTime: lesson.estimatedCompletionTime,
      },
      position: getLessonPosition(lesson, curriculum),
      variant,
      readingMinutes: { core: getCoreReadingMinutes(lesson), deepDive: getDeepDiveReadingMinutes(lesson) },
      theoryBlocks: clientBlocks(lesson, getBlocksForTab(lesson.blocks, 'theory', variant)),
      deepDiveBlocks: variant === 'treatment' ? clientBlocks(lesson, getDeepDiveBlocks(lesson.blocks)) : [],
      interactiveBlocks: clientBlocks(lesson, withInteractiveBlocksOnly(sampled).blocks),
      progress,
      previous: link(prevId),
      next: link(nextId),
    }
    return Response.json(body, { headers: { 'Cache-Control': 'private, no-store' } })
  }
)
