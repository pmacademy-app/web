/**
 * GET /api/progress
 *
 * The learner's progress summary beyond XP and streaks (which /api/xp and /api/streaks
 * already serve): lesson completion across the curriculum and the goal-aware next
 * milestone. It is the data behind the web's /progress/metrics completion ring and
 * /progress/milestones page, as JSON, for the mobile app.
 *
 * The milestone uses the same resolvePersonalizedPath and resolveNextRecommendedMilestone
 * as the web page, so both surfaces recommend the same next lesson. Module styling fields
 * (Tailwind classes) are left out: they mean nothing outside the web app.
 */

import { requireUserId } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { getLearnerDbForRequest } from '@/lib/auth'
import { fetchCurriculumData } from '@/lib/lesson-loader'
import { resolveNextRecommendedMilestone, resolvePersonalizedPath } from '@/lib/personalization/path-resolver'

export interface ProgressResponse {
  success: true
  completion: { completed: number; inProgress: number; total: number; percentage: number }
  path: {
    isPersonalized: boolean
    goalLabel: string
    careerRoleLabel: string
    headerSubtitle: string | null
    contextMessage: string
    relevantTopics: string[]
    recommendedModule: { slug: string; name: string; description: string }
  }
  /** Null when every lesson is complete. */
  milestone: {
    lessonId: string
    title: string
    module: string
    order: number
    reason: string
    isTargetModuleLesson: boolean
  } | null
}

export const GET = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'progress.read',
    summary: 'Unexpected failure reading learner progress',
  },
  async ({ request, actor }) => {
    const userId = requireUserId(actor)
    const supabase = await getLearnerDbForRequest(request)

    const [{ data: progressRows }, { data: userRow }, curriculum] = await Promise.all([
      supabase.from('user_lesson_progress').select('lesson_id, status').eq('user_id', userId),
      supabase
        .from('users')
        .select('goal, career_role, onboarding_topics, onboarding_preference, learning_purpose')
        .eq('id', userId)
        .maybeSingle(),
      fetchCurriculumData().catch(() => null),
    ])

    const lessons = curriculum?.lessons ?? []
    const known = new Set(lessons.map((l) => l.id))
    const rows = ((progressRows ?? []) as { lesson_id: string; status: string }[]).filter((r) => known.has(r.lesson_id))
    const completedIds = new Set(rows.filter((r) => r.status === 'completed').map((r) => r.lesson_id))
    const inProgress = rows.filter((r) => r.status === 'in_progress').length
    const total = lessons.length

    const path = resolvePersonalizedPath(userRow)
    const milestone = resolveNextRecommendedMilestone(path, completedIds, lessons)

    const body: ProgressResponse = {
      success: true,
      completion: {
        completed: completedIds.size,
        inProgress,
        total,
        percentage: total ? Math.round((completedIds.size / total) * 100) : 0,
      },
      path: {
        isPersonalized: path.isPersonalized,
        goalLabel: path.goalLabel,
        careerRoleLabel: path.careerRoleLabel,
        headerSubtitle: path.headerSubtitle,
        contextMessage: path.contextMessage,
        relevantTopics: path.relevantTopics,
        recommendedModule: {
          slug: path.recommendedModule.slug,
          name: path.recommendedModule.name,
          description: path.recommendedModule.description,
        },
      },
      milestone: milestone
        ? {
            lessonId: milestone.lesson.id,
            title: milestone.lesson.title,
            module: milestone.lesson.module,
            order: milestone.order,
            reason: milestone.milestoneReason,
            isTargetModuleLesson: milestone.isTargetModuleLesson,
          }
        : null,
    }
    return Response.json(body, { headers: { 'Cache-Control': 'private, no-store' } })
  }
)
