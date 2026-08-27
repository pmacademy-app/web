import { CURRICULUM_MODULE_META, type CurriculumModuleMeta } from '@/lib/admin/curriculum-meta'
import {
  DEFAULT_GOAL_OPTIONS,
  DEFAULT_EXPERIENCE_OPTIONS,
  DEFAULT_TOPIC_OPTIONS,
} from '@/lib/admin/settings-service'
import type { CurriculumEntry } from '@/types'

export interface LearnerPersonalizationInput {
  goal?: string | null
  career_role?: string | null
  onboarding_topics?: string[] | null
  onboarding_preference?: string | null
  learning_purpose?: string | null
}

export interface PersonalizedPath {
  /** True if the user has any explicit goal, career role, or topics configured. */
  isPersonalized: boolean
  goalId: string | null
  goalLabel: string
  goalBadge: string | null
  careerRoleId: string | null
  careerRoleLabel: string
  recommendedModuleSlug: string
  recommendedModule: CurriculumModuleMeta
  relevantTopics: string[]
  /** Clean header label: e.g. "Targeting: Transition into Product Management • Beginner" */
  headerSubtitle: string | null
  /** Motivational framing connecting learner's target to the curriculum */
  contextMessage: string
}

export interface RecommendedMilestone {
  /** The canonical next lesson to complete (never skips or reorders) */
  lesson: CurriculumEntry
  /** Lesson order (1-indexed across curriculum) */
  order: number
  /** Milestone connection to user's personalized goal */
  milestoneReason: string
  /** Whether this lesson is inside the user's primary recommended module */
  isTargetModuleLesson: boolean
}

/**
 * Intelligent recommendation and path resolver that connects onboarding choices
 * to contextual learning guidance while strictly preserving the universal 90-lesson sequence.
 */
export function resolvePersonalizedPath(
  input?: LearnerPersonalizationInput | null
): PersonalizedPath {
  const goalId = (input?.goal || '').trim()
  const roleId = (input?.career_role || '').trim()
  const topics = Array.isArray(input?.onboarding_topics) ? input.onboarding_topics : []

  const isPersonalized = Boolean(goalId || roleId || topics.length > 0)

  // 1. Resolve Goal metadata
  const matchedGoal = DEFAULT_GOAL_OPTIONS.find(
    (g) => g.id.toLowerCase() === goalId.toLowerCase()
  )
  const goalLabel = matchedGoal?.label || (goalId ? goalId.replace(/[_-]/g, ' ') : 'Product Management Mastery')
  const goalBadge = matchedGoal?.badge || (goalId ? 'Custom Goal' : null)

  // 2. Resolve Career Role metadata
  const matchedRole = DEFAULT_EXPERIENCE_OPTIONS.find(
    (e) => e.id.toLowerCase() === roleId.toLowerCase()
  )
  const careerRoleLabel = matchedRole?.label || (roleId ? roleId.replace(/[_-]/g, ' ') : 'Learner')

  // 3. Resolve Recommended Module
  let resolvedModuleSlug = 'foundations'

  if (matchedGoal?.recommendedModule && CURRICULUM_MODULE_META[matchedGoal.recommendedModule]) {
    // If learner is beginner/learning, recommend foundations first even if goal is advanced
    if (roleId === 'beginner' || roleId === 'learning') {
      resolvedModuleSlug = 'foundations'
    } else {
      resolvedModuleSlug = matchedGoal.recommendedModule
    }
  } else if (topics.length > 0) {
    // Check topic affinity
    if (topics.includes('discovery') || topics.includes('user_research')) {
      resolvedModuleSlug = 'discovery'
    } else if (
      topics.includes('strategy') ||
      topics.includes('roadmapping') ||
      topics.includes('prioritization')
    ) {
      resolvedModuleSlug = 'strategy'
    } else if (topics.includes('prds') || topics.includes('agile')) {
      resolvedModuleSlug = 'execution'
    } else if (topics.includes('metrics') || topics.includes('launch')) {
      resolvedModuleSlug = 'growth'
    } else if (topics.includes('stakeholders')) {
      resolvedModuleSlug = 'leadership'
    }
  }

  const recommendedModule =
    CURRICULUM_MODULE_META[resolvedModuleSlug] ||
    CURRICULUM_MODULE_META.foundations ||
    Object.values(CURRICULUM_MODULE_META)[0]

  // 4. Resolve Topic Display Names
  const relevantTopics = topics.map((t) => {
    const matched = DEFAULT_TOPIC_OPTIONS.find((opt) => opt.id === t)
    return matched?.label || t.replace(/[_-]/g, ' ')
  })

  // 5. Construct Personalized Context Messaging
  let headerSubtitle: string | null = null
  let contextMessage = 'Progress through the structured curriculum from foundations to advanced product leadership.'

  if (isPersonalized) {
    if (goalId && roleId) {
      headerSubtitle = `Targeting: ${goalLabel} • ${careerRoleLabel}`
    } else if (goalId) {
      headerSubtitle = `Targeting: ${goalLabel}`
    } else if (roleId) {
      headerSubtitle = `Track: ${careerRoleLabel}`
    }

    if (resolvedModuleSlug === 'foundations') {
      contextMessage = `Master the foundational mental models, user frameworks, and discovery techniques essential for ${goalLabel.toLowerCase()}.`
    } else {
      contextMessage = `Building core product capabilities with specialized emphasis on ${recommendedModule.name} to accelerate your goal: ${goalLabel}.`
    }
  }

  return {
    isPersonalized,
    goalId: goalId || null,
    goalLabel,
    goalBadge,
    careerRoleId: roleId || null,
    careerRoleLabel,
    recommendedModuleSlug: recommendedModule.slug,
    recommendedModule,
    relevantTopics,
    headerSubtitle,
    contextMessage,
  }
}

/**
 * Resolves the next recommended milestone lesson for the learner.
 *
 * HARD ARCHITECTURAL INVARIANT:
 * This function NEVER skips, reorders, or bypasses any lesson in the 90-lesson curriculum.
 * The lesson returned is ALWAYS the canonical lowest uncompleted lesson (activeNextIndex).
 * Only the explanatory milestoneReason is personalized.
 */
export function resolveNextRecommendedMilestone(
  personalizedPath: PersonalizedPath,
  completedLessonIds: Set<string>,
  curriculumLessons: CurriculumEntry[]
): RecommendedMilestone | null {
  if (!curriculumLessons || curriculumLessons.length === 0) {
    return null
  }

  // Find lowest uncompleted lesson index
  const nextIndex = curriculumLessons.findIndex((l) => !completedLessonIds.has(l.id))
  if (nextIndex === -1) {
    return null // All lessons completed
  }

  const nextLesson = curriculumLessons[nextIndex]
  const isTargetModuleLesson = nextLesson.module === personalizedPath.recommendedModuleSlug

  let milestoneReason = `Continue your sequential journey with Lesson ${nextIndex + 1}: ${nextLesson.title}.`

  if (personalizedPath.isPersonalized) {
    if (isTargetModuleLesson) {
      milestoneReason = `Directly aligned with your goal: You are currently advancing through your primary focus module (${personalizedPath.recommendedModule.name}).`
    } else {
      // Find where target module is located relative to current lesson
      const targetModuleLessons = curriculumLessons.filter(
        (l) => l.module === personalizedPath.recommendedModuleSlug
      )
      const allTargetCompleted =
        targetModuleLessons.length > 0 &&
        targetModuleLessons.every((l) => completedLessonIds.has(l.id))

      if (allTargetCompleted) {
        milestoneReason = `You have completed your primary target module! Continue mastering full-cycle product craft toward ${personalizedPath.goalLabel}.`
      } else {
        milestoneReason = `Essential foundational step: Completing "${nextLesson.title}" builds prerequisite mastery for your target module (${personalizedPath.recommendedModule.name}).`
      }
    }
  }

  return {
    lesson: nextLesson,
    order: nextIndex + 1,
    milestoneReason,
    isTargetModuleLesson,
  }
}
