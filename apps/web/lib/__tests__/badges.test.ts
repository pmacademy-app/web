import { describe, it, expect } from 'vitest'
import { BADGE_DEFINITIONS, getBadgeDefinition } from '../../config/badges'
import { calculateBadgeProgress, evaluateEligibleBadges } from '../badges'

describe('Badge & Achievement System Unit Test Suite', () => {
  describe('Badge Definitions Structure', () => {
    it('BADGE_DEFINITIONS contains unique keys and required metadata', () => {
      expect(BADGE_DEFINITIONS.length).toBeGreaterThanOrEqual(14)
      const keys = new Set<string>()

      for (const b of BADGE_DEFINITIONS) {
        expect(keys.has(b.key)).toBe(false)
        keys.add(b.key)
        expect(b.name.length).toBeGreaterThan(0)
        expect(b.description.length).toBeGreaterThan(0)
        expect(b.targetGoal).toBeGreaterThan(0)
      }
    })
  })

  describe('Progress Calculation', () => {
    it('calculateBadgeProgress computes percentage and earned status correctly', () => {
      const firstLessonBadge = getBadgeDefinition('first_lesson')!
      const streak7Badge = getBadgeDefinition('streak_7')!

      const unearnedStats = {
        lessonsCompletedCount: 0,
        modulesCompletedCount: 0,
        perfectFirstAttemptQuizCount: 0,
        perfectQuizCount: 0,
        totalXp: 0,
        level: 1,
        currentStreak: 3,
        longestStreak: 3,
        capstonesSubmittedCount: 0,
        isPortfolioPublic: false,
      }

      const progressUnearned = calculateBadgeProgress(firstLessonBadge, unearnedStats)
      expect(progressUnearned.isEarned).toBe(false)
      expect(progressUnearned.progressPercentage).toBe(0)

      const progressStreak = calculateBadgeProgress(streak7Badge, { ...unearnedStats, currentStreak: 5 })
      expect(progressStreak.isEarned).toBe(false)
      expect(progressStreak.currentValue).toBe(5)
      expect(progressStreak.progressPercentage).toBe(71)

      const progressEarned = calculateBadgeProgress(firstLessonBadge, { ...unearnedStats, lessonsCompletedCount: 1 })
      expect(progressEarned.isEarned).toBe(true)
      expect(progressEarned.progressPercentage).toBe(100)
    })
  })

  describe('Eligible Badges Evaluation', () => {
    it('evaluateEligibleBadges unlocks new badges and ignores already earned keys', () => {
      const stats = {
        lessonsCompletedCount: 10,
        modulesCompletedCount: 1,
        perfectFirstAttemptQuizCount: 1,
        perfectQuizCount: 1,
        totalXp: 1200,
        level: 3,
        currentStreak: 7,
        longestStreak: 7,
        capstonesSubmittedCount: 1,
        isPortfolioPublic: true,
      }

      const alreadyEarned = new Set<string>(['first_lesson', 'first_perfect_quiz'])
      const newlyEligible = evaluateEligibleBadges(stats, alreadyEarned)

      const newKeys = newlyEligible.map((b) => b.key)
      expect(newKeys.includes('first_lesson')).toBe(false)
      expect(newKeys.includes('first_perfect_quiz')).toBe(false)
      expect(newKeys.includes('module_complete')).toBe(true)
      expect(newKeys.includes('xp_1000')).toBe(true)
      expect(newKeys.includes('streak_7')).toBe(true)
      expect(newKeys.includes('first_capstone')).toBe(true)
      expect(newKeys.includes('portfolio_published')).toBe(true)
    })
  })
})
