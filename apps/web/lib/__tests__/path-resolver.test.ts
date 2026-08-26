import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  resolvePersonalizedPath,
  resolveNextRecommendedMilestone,
} from '../personalization/path-resolver'
import { trackGoalContextViewed } from '../analytics'
import type { CurriculumEntry } from '@/types'

describe('Phase 3 — Goal-Driven Personalization & Curriculum Invariance', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      gtag: vi.fn(),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ─── 1. CRITICAL PRODUCT INVARIANT TESTS ──────────────────────────────────
  describe('1. Curriculum Invariance Invariant (Non-branching)', () => {
    // Generate a mock sequential 90-lesson curriculum across 9 modules
    const mock90Lessons: CurriculumEntry[] = Array.from({ length: 90 }, (_, i) => {
      const moduleIndex = Math.floor(i / 10) + 1
      const moduleSlug = ['foundations', 'discovery', 'strategy', 'execution', 'growth', 'leadership', 'technical', 'design', 'capstone'][moduleIndex - 1]
      return {
        id: `les_mod_${moduleIndex}_${(i % 10) + 1}`,
        order: i + 1,
        title: `Lesson ${i + 1}`,
        module: moduleSlug,
        estimatedReadingTime: 5,
      } as CurriculumEntry
    })

    it('guarantees Goal A (become_pm) and Goal B (grow_career) produce the EXACT same sequential curriculum progression', () => {
      const userA = { goal: 'become_pm', career_role: 'beginner' }
      const userB = { goal: 'grow_career', career_role: 'experienced' }
      const userLegacy = { goal: null, career_role: null }

      const pathA = resolvePersonalizedPath(userA)
      const pathB = resolvePersonalizedPath(userB)
      const pathLegacy = resolvePersonalizedPath(userLegacy)

      // Both start with 0 completed lessons
      const completedSet0 = new Set<string>()

      const milestoneA0 = resolveNextRecommendedMilestone(pathA, completedSet0, mock90Lessons)
      const milestoneB0 = resolveNextRecommendedMilestone(pathB, completedSet0, mock90Lessons)
      const milestoneLegacy0 = resolveNextRecommendedMilestone(pathLegacy, completedSet0, mock90Lessons)

      // All 3 learners must get Lesson 1
      expect(milestoneA0?.lesson.id).toBe('les_mod_1_1')
      expect(milestoneB0?.lesson.id).toBe('les_mod_1_1')
      expect(milestoneLegacy0?.lesson.id).toBe('les_mod_1_1')

      // Contextual reason can be tailored, but the lesson itself is identical
      expect(milestoneA0?.lesson.id).toBe(milestoneB0?.lesson.id)

      // Step forward 5 lessons
      const completedSet5 = new Set<string>(mock90Lessons.slice(0, 5).map((l) => l.id))
      const milestoneA5 = resolveNextRecommendedMilestone(pathA, completedSet5, mock90Lessons)
      const milestoneB5 = resolveNextRecommendedMilestone(pathB, completedSet5, mock90Lessons)

      // Both must get Lesson 6
      expect(milestoneA5?.lesson.id).toBe('les_mod_1_6')
      expect(milestoneB5?.lesson.id).toBe('les_mod_1_6')
      expect(milestoneA5?.order).toBe(6)
      expect(milestoneB5?.order).toBe(6)

      // Step forward 25 lessons (into module 3: strategy)
      const completedSet25 = new Set<string>(mock90Lessons.slice(0, 25).map((l) => l.id))
      const milestoneA25 = resolveNextRecommendedMilestone(pathA, completedSet25, mock90Lessons)
      const milestoneB25 = resolveNextRecommendedMilestone(pathB, completedSet25, mock90Lessons)

      // Both must get Lesson 26
      expect(milestoneA25?.lesson.id).toBe('les_mod_3_6')
      expect(milestoneB25?.lesson.id).toBe('les_mod_3_6')
    })

    it('verifies that no goal ever skips prerequisite lessons', () => {
      const advancedUser = {
        goal: 'grow_career',
        career_role: 'experienced',
        onboarding_topics: ['strategy'],
      }
      const path = resolvePersonalizedPath(advancedUser)
      expect(path.recommendedModuleSlug).toBe('strategy')

      // User has only completed Lesson 1
      const completedSet = new Set<string>(['les_mod_1_1'])
      const nextMilestone = resolveNextRecommendedMilestone(path, completedSet, mock90Lessons)

      // Must be Lesson 2, NOT a strategy lesson in module 3
      expect(nextMilestone?.lesson.id).toBe('les_mod_1_2')
      expect(nextMilestone?.lesson.module).toBe('foundations')
      expect(nextMilestone?.isTargetModuleLesson).toBe(false)
      expect(nextMilestone?.milestoneReason).toContain('Completing "Lesson 2" builds prerequisite mastery')
    })
  })

  // ─── 2. GOAL & EXPERIENCE RESOLUTION ─────────────────────────────────────
  describe('2. Goal and Persona Mapping', () => {
    it('resolves become_pm to foundations module with Aspiring PM badge', () => {
      const path = resolvePersonalizedPath({ goal: 'become_pm', career_role: 'beginner' })

      expect(path.isPersonalized).toBe(true)
      expect(path.goalLabel).toBe('Become a Product Manager')
      expect(path.goalBadge).toBe('Aspiring PM')
      expect(path.careerRoleLabel).toBe('Beginner')
      expect(path.recommendedModuleSlug).toBe('foundations')
      expect(path.headerSubtitle).toBe('Targeting: Become a Product Manager • Beginner')
    })

    it('resolves grow_career with experienced role to strategy module', () => {
      const path = resolvePersonalizedPath({ goal: 'grow_career', career_role: 'experienced' })

      expect(path.isPersonalized).toBe(true)
      expect(path.goalLabel).toBe('Grow in my PM career')
      expect(path.goalBadge).toBe('Skill Growth')
      expect(path.careerRoleLabel).toBe('Experienced Product Manager')
      expect(path.recommendedModuleSlug).toBe('strategy')
      expect(path.headerSubtitle).toBe('Targeting: Grow in my PM career • Experienced Product Manager')
    })

    it('resolves build_skills with topic discovery to discovery module', () => {
      const path = resolvePersonalizedPath({
        goal: 'build_skills',
        career_role: 'working',
        onboarding_topics: ['discovery', 'user_research'],
      })

      expect(path.isPersonalized).toBe(true)
      expect(path.recommendedModuleSlug).toBe('discovery')
      expect(path.relevantTopics).toContain('Product Discovery')
      expect(path.relevantTopics).toContain('User Research')
    })

    it('prioritizes foundations for beginner even if goal recommends advanced module', () => {
      const path = resolvePersonalizedPath({
        goal: 'grow_career',
        career_role: 'beginner',
      })

      // Beginner needs foundations before diving into strategy
      expect(path.recommendedModuleSlug).toBe('foundations')
    })
  })

  // ─── 3. LEGACY AND NULL PREFERENCE HANDLING ──────────────────────────────
  describe('3. Legacy User & Null Fallbacks', () => {
    it('handles null user gracefully with clean fallback and isPersonalized: false', () => {
      const path = resolvePersonalizedPath(null)

      expect(path.isPersonalized).toBe(false)
      expect(path.goalId).toBeNull()
      expect(path.careerRoleId).toBeNull()
      expect(path.headerSubtitle).toBeNull()
      expect(path.recommendedModuleSlug).toBe('foundations')
      expect(path.relevantTopics).toEqual([])
    })

    it('handles user with empty strings without errors', () => {
      const path = resolvePersonalizedPath({
        goal: '',
        career_role: '',
        onboarding_topics: [],
        onboarding_preference: '',
      })

      expect(path.isPersonalized).toBe(false)
      expect(path.headerSubtitle).toBeNull()
    })

    it('handles custom unlisted goal string cleanly', () => {
      const path = resolvePersonalizedPath({
        goal: 'Build an AI product from scratch',
        career_role: 'working',
      })

      expect(path.isPersonalized).toBe(true)
      expect(path.goalLabel).toBe('Build an AI product from scratch')
      expect(path.goalBadge).toBe('Custom Goal')
    })
  })

  // ─── 4. CONTEXTUAL MILESTONE REASONING ───────────────────────────────────
  describe('4. Contextual Milestone Reasoning', () => {
    const miniCurriculum: CurriculumEntry[] = [
      { id: 'les_1', order: 1, title: 'What is PM?', module: 'foundations', estimatedReadingTime: 5 } as CurriculumEntry,
      { id: 'les_2', order: 2, title: 'Discovery Principles', module: 'discovery', estimatedReadingTime: 5 } as CurriculumEntry,
    ]

    it('informs learner when they are actively inside their target module', () => {
      const path = resolvePersonalizedPath({ goal: 'build_skills', career_role: 'working' })
      expect(path.recommendedModuleSlug).toBe('discovery')

      // Lesson 1 is completed, currently on Lesson 2 (which is in discovery)
      const completedSet = new Set<string>(['les_1'])
      const milestone = resolveNextRecommendedMilestone(path, completedSet, miniCurriculum)

      expect(milestone?.lesson.id).toBe('les_2')
      expect(milestone?.isTargetModuleLesson).toBe(true)
      expect(milestone?.milestoneReason).toContain('Directly aligned with your goal')
    })

    it('returns null when all lessons in curriculum are completed', () => {
      const path = resolvePersonalizedPath({ goal: 'become_pm' })
      const completedSet = new Set<string>(['les_1', 'les_2'])
      const milestone = resolveNextRecommendedMilestone(path, completedSet, miniCurriculum)

      expect(milestone).toBeNull()
    })
  })

  // ─── 5. ANALYTICS & ZERO PII ─────────────────────────────────────────────
  describe('5. Phase 3 Analytics & Privacy Audit', () => {
    it('trackGoalContextViewed dispatches goal_context_viewed without PII', () => {
      trackGoalContextViewed('become_pm', 'foundations')

      expect(window.gtag).toHaveBeenCalledWith('event', 'goal_context_viewed', {
        goal_id: 'become_pm',
        recommended_module: 'foundations',
      })
    })

    it('verifies zero PII in goal_context_viewed payload', () => {
      const gtagSpy = vi.spyOn(window, 'gtag')
      trackGoalContextViewed('grow_career', 'strategy')

      const lastCall = gtagSpy.mock.calls[gtagSpy.mock.calls.length - 1]
      const payload = (lastCall[2] ?? {}) as Record<string, unknown>

      expect(payload).not.toHaveProperty('email')
      expect(payload).not.toHaveProperty('name')
      expect(payload).not.toHaveProperty('user_id')
      expect(payload).not.toHaveProperty('token')
    })

    it('fails gracefully as a no-op when window.gtag is undefined', () => {
      vi.stubGlobal('window', undefined)

      expect(() => {
        trackGoalContextViewed('become_pm', 'foundations')
      }).not.toThrow()
    })
  })
})
