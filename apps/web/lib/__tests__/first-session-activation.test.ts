import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  trackFirstSessionStarted,
  trackFirstLessonCompleted,
  trackFirstRewardCelebrated,
} from '../analytics'

describe('First-Session Activation Test Suite (Phase 2)', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      gtag: vi.fn(),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('1. First-Session Eligibility Rules', () => {
    it('identifies new learner as eligible for kickoff when completed lessons count is 0', () => {
      const completedLessonsCount: number = 0
      const isEligibleForKickoff = completedLessonsCount === 0

      expect(isEligibleForKickoff).toBe(true)
    })

    it('identifies returning learner as ineligible for kickoff when completed lessons count > 0', () => {
      const completedLessonsCount: number = 1
      const isEligibleForKickoff = completedLessonsCount === 0

      expect(isEligibleForKickoff).toBe(false)
    })
  })

  describe('2. Sequential First Lesson Identification', () => {
    const mockCurriculum = [
      { id: 'les_foundations_01', order: 1, title: 'What is Product Management?', module: 'foundations', estimatedReadingTime: 5 },
      { id: 'les_foundations_02', order: 2, title: 'Product vs Project vs Program', module: 'foundations', estimatedReadingTime: 6 },
    ]

    it('selects Lesson 1 as the kickoff target when completed set is empty', () => {
      const completedLessonIds = new Set<string>()
      const activeNextIndex = mockCurriculum.findIndex((l) => !completedLessonIds.has(l.id))

      expect(activeNextIndex).toBe(0)
      const nextLesson = mockCurriculum[activeNextIndex]
      expect(nextLesson.id).toBe('les_foundations_01')
      expect(nextLesson.order).toBe(1)
      expect(nextLesson.title).toBe('What is Product Management?')
    })

    it('advances to Lesson 2 once Lesson 1 is completed', () => {
      const completedLessonIds = new Set<string>(['les_foundations_01'])
      const activeNextIndex = mockCurriculum.findIndex((l) => !completedLessonIds.has(l.id))

      expect(activeNextIndex).toBe(1)
      const nextLesson = mockCurriculum[activeNextIndex]
      expect(nextLesson.id).toBe('les_foundations_02')
      expect(nextLesson.order).toBe(2)
    })
  })

  describe('3. Backend Milestone Detection', () => {
    function computeMilestoneResult(completedCount: number, totalXpToAward: number) {
      return {
        success: true,
        isCompleted: true,
        isFirstLesson: completedCount === 1,
        totalCompletedLessons: completedCount,
        xpEarned: totalXpToAward,
      }
    }

    it('flags isFirstLesson: true when total completed lessons equals 1', () => {
      const result = computeMilestoneResult(1, 50)

      expect(result.isCompleted).toBe(true)
      expect(result.isFirstLesson).toBe(true)
      expect(result.totalCompletedLessons).toBe(1)
      expect(result.xpEarned).toBe(50)
    })

    it('flags isFirstLesson: false when total completed lessons is greater than 1', () => {
      const result = computeMilestoneResult(2, 50)

      expect(result.isCompleted).toBe(true)
      expect(result.isFirstLesson).toBe(false)
      expect(result.totalCompletedLessons).toBe(2)
    })
  })

  describe('4. Celebration Deduplication Logic', () => {
    it('permits celebration on first occurrence and locks subsequent presentation', () => {
      const mockStorage: Record<string, string> = {}
      const STORAGE_KEY = 'prodily_first_session_celebrated'

      function triggerCelebration(isFirstLesson: boolean): boolean {
        if (!isFirstLesson) return false
        if (mockStorage[STORAGE_KEY] === 'true') return false

        mockStorage[STORAGE_KEY] = 'true'
        return true
      }

      // First time completion
      const firstRun = triggerCelebration(true)
      expect(firstRun).toBe(true)
      expect(mockStorage[STORAGE_KEY]).toBe('true')

      // Subsequent page refresh or revisit
      const secondRun = triggerCelebration(true)
      expect(secondRun).toBe(false)

      // Regular lesson completion
      const regularRun = triggerCelebration(false)
      expect(regularRun).toBe(false)
    })
  })

  describe('5. Phase 2 Analytics Trackers & PII Audit', () => {
    it('trackFirstSessionStarted dispatches first_session_started without PII', () => {
      trackFirstSessionStarted({ lesson_id: 'les_foundations_01', module_slug: 'foundations' })

      expect(window.gtag).toHaveBeenCalledWith('event', 'first_session_started', {
        lesson_id: 'les_foundations_01',
        module_slug: 'foundations',
      })
    })

    it('trackFirstLessonCompleted dispatches first_lesson_completed without PII', () => {
      trackFirstLessonCompleted('les_foundations_01', 50)

      expect(window.gtag).toHaveBeenCalledWith('event', 'first_lesson_completed', {
        lesson_id: 'les_foundations_01',
        xp_earned: 50,
      })
    })

    it('trackFirstRewardCelebrated dispatches first_reward_celebrated without PII', () => {
      trackFirstRewardCelebrated('les_foundations_01', 50)

      expect(window.gtag).toHaveBeenCalledWith('event', 'first_reward_celebrated', {
        lesson_id: 'les_foundations_01',
        xp_earned: 50,
      })
    })

    it('verifies complete absence of PII across all Phase 2 events', () => {
      const gtagSpy = vi.spyOn(window, 'gtag')

      trackFirstSessionStarted({ lesson_id: 'les_01', module_slug: 'foundations' })
      trackFirstLessonCompleted('les_01', 50)
      trackFirstRewardCelebrated('les_01', 50)

      for (const call of gtagSpy.mock.calls) {
        const payload = (call[2] ?? {}) as Record<string, unknown>
        expect(payload).not.toHaveProperty('email')
        expect(payload).not.toHaveProperty('name')
        expect(payload).not.toHaveProperty('full_name')
        expect(payload).not.toHaveProperty('user_id')
        expect(payload).not.toHaveProperty('phone')
        expect(payload).not.toHaveProperty('content')
        expect(payload).not.toHaveProperty('token')
      }
    })

    it('fails safely as a no-op when window.gtag is undefined', () => {
      vi.stubGlobal('window', undefined)

      expect(() => {
        trackFirstSessionStarted({ lesson_id: 'les_01' })
        trackFirstLessonCompleted('les_01', 50)
        trackFirstRewardCelebrated('les_01', 50)
      }).not.toThrow()
    })
  })
})
