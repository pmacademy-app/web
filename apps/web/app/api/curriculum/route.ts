/**
 * GET /api/curriculum
 *
 * The curriculum for a signed-in learner: every module in order with its title and study
 * time, and every lesson in it with the learner's access state. Built for the mobile app,
 * which cannot read content/dist from disk the way the web pages do, and safe for any
 * client to use.
 *
 * Lesson state comes from the same pure resolveLessonAccess the Academy list and the lesson
 * page gate use, so a lesson shown as locked here is locked on the lesson route too. The
 * response carries metadata only: no lesson body, quiz or answer.
 */

import { requireUserId } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { getLearnerDbForRequest } from '@/lib/auth'
import { isModuleEntryUnlockTreatment } from '@/lib/academy/module-entry-unlock'
import { buildCurriculumModuleIndex, resolveLessonAccess, type LessonAccessState } from '@/lib/curriculum-access'
import { MODULE_SLUGS, getModuleMeta } from '@/lib/curriculum/module-meta'
import { fetchCurriculumData } from '@/lib/lesson-loader'

export interface CurriculumLessonItem {
  id: string
  title: string
  /** 1-indexed position inside its module. */
  number: number
  /** 1-indexed position in the whole curriculum. */
  globalOrder: number
  inShort: string | null
  difficulty: number
  estimatedReadingTime: number
  estimatedCompletionTime: number
  state: LessonAccessState
  /** When locked, the lesson to complete first. */
  prerequisiteLessonId: string | null
}

export interface CurriculumModuleItem {
  slug: string
  number: number
  title: string
  shortTitle: string
  description: string
  readingMinutes: number
  estimatedMinutes: number
  lessonCount: number
  completedCount: number
  lessons: CurriculumLessonItem[]
}

export interface CurriculumResponse {
  success: true
  totals: { lessons: number; completed: number }
  modules: CurriculumModuleItem[]
}

export const GET = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'curriculum.read',
    summary: 'Unexpected failure reading the curriculum',
  },
  async ({ request, actor }) => {
    const userId = requireUserId(actor)

    const curriculum = await fetchCurriculumData()
    if (!curriculum || curriculum.lessons.length === 0) {
      throw new RouteError(404, 'NOT_FOUND', 'Curriculum not found.')
    }

    const supabase = await getLearnerDbForRequest(request)
    const [{ data: userRow }, { data: progressRows }] = await Promise.all([
      supabase.from('users').select('created_at, curriculum_access_override').eq('id', userId).maybeSingle(),
      supabase.from('user_lesson_progress').select('lesson_id, status').eq('user_id', userId),
    ])

    const completedIds = new Set<string>()
    const openedIds = new Set<string>()
    for (const r of (progressRows ?? []) as { lesson_id: string; status: string }[]) {
      openedIds.add(r.lesson_id)
      if (r.status === 'completed') completedIds.add(r.lesson_id)
    }

    const row = userRow as { created_at?: string; curriculum_access_override?: boolean } | null
    const treatment = isModuleEntryUnlockTreatment({ id: userId, createdAt: row?.created_at })
    const override = Boolean(row?.curriculum_access_override)
    const index = buildCurriculumModuleIndex(curriculum.lessons)

    const byModule = new Map<string, CurriculumLessonItem[]>()
    curriculum.lessons.forEach((lesson, i) => {
      const access = resolveLessonAccess(lesson.id, { index, completedIds, openedIds, treatment, override })
      const list = byModule.get(lesson.module) ?? []
      list.push({
        id: lesson.id,
        title: lesson.title,
        number: list.length + 1,
        globalOrder: i + 1,
        inShort: lesson.inShort ?? null,
        difficulty: lesson.difficulty,
        estimatedReadingTime: lesson.estimatedReadingTime,
        estimatedCompletionTime: lesson.estimatedCompletionTime,
        state: access.state,
        prerequisiteLessonId: access.isAccessible ? null : access.prerequisiteLessonId,
      })
      byModule.set(lesson.module, list)
    })

    // Module order is MODULE_SLUGS (curriculum.json order); a module the compiled content
    // has but the metadata does not know is appended so no lesson goes missing.
    const slugs = [...MODULE_SLUGS.filter((s) => byModule.has(s)), ...[...byModule.keys()].filter((s) => !(MODULE_SLUGS as readonly string[]).includes(s))]

    const modules: CurriculumModuleItem[] = slugs.map((slug, i) => {
      const lessons = byModule.get(slug) ?? []
      const meta = getModuleMeta(slug)
      return {
        slug,
        number: meta?.number ?? i + 1,
        title: meta?.title ?? slug,
        shortTitle: meta?.shortTitle ?? slug,
        description: meta?.description ?? '',
        readingMinutes: meta?.readingMinutes ?? lessons.reduce((n, l) => n + l.estimatedReadingTime, 0),
        estimatedMinutes: meta?.estimatedMinutes ?? lessons.reduce((n, l) => n + l.estimatedCompletionTime, 0),
        lessonCount: lessons.length,
        completedCount: lessons.filter((l) => l.state === 'completed').length,
        lessons,
      }
    })

    const body: CurriculumResponse = {
      success: true,
      totals: { lessons: curriculum.lessons.length, completed: curriculum.lessons.filter((l) => completedIds.has(l.id)).length },
      modules,
    }
    return Response.json(body, { headers: { 'Cache-Control': 'private, no-store' } })
  }
)
