import { describe, it, expect } from 'vitest'
import {
  getLocalDateString,
  getDaysDifference,
  isConsecutiveDay,
  checkEarnedFreezeEligibility,
  recordActivityStreak,
  getStreakStatusSummary,
  StreakData,
} from '../streaks'

describe('PM Academy Streak Engine Test Suite', () => {
  describe('Timezone Date Utilities & Boundary Math', () => {
    it('formats date to YYYY-MM-DD in local timezones correctly', () => {
      const date = new Date('2026-08-05T01:30:00Z')
      const nyDate = getLocalDateString('America/New_York', date)
      const utcDate = getLocalDateString('UTC', date)

      expect(nyDate).toBe('2026-08-04')
      expect(utcDate).toBe('2026-08-05')
    })

    it('handles fallback safely on invalid timezone', () => {
      const date = new Date('2026-08-05T12:00:00Z')
      const dateStr = getLocalDateString('Invalid/Timezone', date)
      expect(dateStr).toBe('2026-08-05')
    })

    it('calculates days difference across month boundaries correctly', () => {
      expect(getDaysDifference('2026-07-31', '2026-08-01')).toBe(1)
      expect(isConsecutiveDay('2026-07-31', '2026-08-01')).toBe(true)
      expect(getDaysDifference('2026-08-01', '2026-08-04')).toBe(3)
    })
  })

  describe('Daily Streak Tracking & Progression', () => {
    it('initializes streak to 1 on first activity ever', () => {
      const initialData: StreakData = {
        currentStreak: 0,
        longestStreak: 0,
        streakFreezesAvailable: 0,
        lastActivityDate: '',
      }

      const result = recordActivityStreak(initialData, 'UTC', new Date('2026-08-05T10:00:00Z'))

      expect(result.currentStreak).toBe(1)
      expect(result.longestStreak).toBe(1)
      expect(result.streakIncremented).toBe(true)
      expect(result.freezeUsed).toBe(false)
      expect(result.lastActivityDate).toBe('2026-08-05')
    })

    it('prevents double streak increments on the same day', () => {
      const currentData: StreakData = {
        currentStreak: 5,
        longestStreak: 5,
        streakFreezesAvailable: 0,
        lastActivityDate: '2026-08-05',
      }

      const result = recordActivityStreak(currentData, 'UTC', new Date('2026-08-05T18:00:00Z'))

      expect(result.currentStreak).toBe(5)
      expect(result.streakIncremented).toBe(false)
      expect(result.freezeUsed).toBe(false)
    })

    it('increments streak on consecutive day activity', () => {
      const currentData: StreakData = {
        currentStreak: 3,
        longestStreak: 5,
        streakFreezesAvailable: 0,
        lastActivityDate: '2026-08-04',
      }

      const result = recordActivityStreak(currentData, 'UTC', new Date('2026-08-05T10:00:00Z'))

      expect(result.currentStreak).toBe(4)
      expect(result.longestStreak).toBe(5)
      expect(result.streakIncremented).toBe(true)
      expect(result.freezeUsed).toBe(false)
    })

    it('updates longest streak when current streak exceeds previous record', () => {
      const currentData: StreakData = {
        currentStreak: 5,
        longestStreak: 5,
        streakFreezesAvailable: 0,
        lastActivityDate: '2026-08-04',
      }

      const result = recordActivityStreak(currentData, 'UTC', new Date('2026-08-05T10:00:00Z'))

      expect(result.currentStreak).toBe(6)
      expect(result.longestStreak).toBe(6)
    })
  })

  describe('Earned Streak Freeze Mechanics', () => {
    it('earns 1 freeze upon reaching 7 consecutive days', () => {
      expect(checkEarnedFreezeEligibility(7, 0)).toBe(true)
      expect(checkEarnedFreezeEligibility(14, 0)).toBe(true)
      expect(checkEarnedFreezeEligibility(6, 0)).toBe(false)
    })

    it('caps available freezes at maximum of 2', () => {
      expect(checkEarnedFreezeEligibility(7, 2, 2)).toBe(false)
    })

    it('automatically awards freeze on day 7 activity', () => {
      const currentData: StreakData = {
        currentStreak: 6,
        longestStreak: 6,
        streakFreezesAvailable: 0,
        lastActivityDate: '2026-08-04',
      }

      const result = recordActivityStreak(currentData, 'UTC', new Date('2026-08-05T10:00:00Z'))

      expect(result.currentStreak).toBe(7)
      expect(result.freezeEarned).toBe(true)
      expect(result.streakFreezesAvailable).toBe(1)
    })
  })

  describe('Missed Day Recovery & Freeze Consumption', () => {
    it('consumes available freeze when 1 day is missed (diff === 2)', () => {
      const currentData: StreakData = {
        currentStreak: 10,
        longestStreak: 10,
        streakFreezesAvailable: 1,
        lastActivityDate: '2026-08-03',
      }

      const result = recordActivityStreak(currentData, 'UTC', new Date('2026-08-05T10:00:00Z'))

      expect(result.currentStreak).toBe(11)
      expect(result.longestStreak).toBe(11)
      expect(result.freezeUsed).toBe(true)
      expect(result.streakFreezesAvailable).toBe(0)
      expect(result.streakBroken).toBe(false)
    })

    it('resets streak to 1 when 1 day is missed WITHOUT freeze available', () => {
      const currentData: StreakData = {
        currentStreak: 10,
        longestStreak: 10,
        streakFreezesAvailable: 0,
        lastActivityDate: '2026-08-03',
      }

      const result = recordActivityStreak(currentData, 'UTC', new Date('2026-08-05T10:00:00Z'))

      expect(result.currentStreak).toBe(1)
      expect(result.longestStreak).toBe(10)
      expect(result.freezeUsed).toBe(false)
      expect(result.streakBroken).toBe(true)
    })

    it('resets streak to 1 when multiple days are missed (diff >= 3) even with freezes', () => {
      const currentData: StreakData = {
        currentStreak: 15,
        longestStreak: 15,
        streakFreezesAvailable: 2,
        lastActivityDate: '2026-08-01',
      }

      const result = recordActivityStreak(currentData, 'UTC', new Date('2026-08-05T10:00:00Z'))

      expect(result.currentStreak).toBe(1)
      expect(result.longestStreak).toBe(15)
      expect(result.freezeUsed).toBe(false)
      expect(result.streakBroken).toBe(true)
    })
  })

  describe('Passive Streak Status Summary', () => {
    it('returns active status when activity is completed today', () => {
      const data: StreakData = {
        currentStreak: 4,
        longestStreak: 4,
        streakFreezesAvailable: 0,
        lastActivityDate: '2026-08-05',
      }

      const status = getStreakStatusSummary(data, 'UTC', new Date('2026-08-05T12:00:00Z'))

      expect(status.status).toBe('active')
      expect(status.isTodayCompleted).toBe(true)
      expect(status.effectiveCurrentStreak).toBe(4)
    })

    it('returns at_risk status when activity is due today', () => {
      const data: StreakData = {
        currentStreak: 4,
        longestStreak: 4,
        streakFreezesAvailable: 0,
        lastActivityDate: '2026-08-04',
      }

      const status = getStreakStatusSummary(data, 'UTC', new Date('2026-08-05T12:00:00Z'))

      expect(status.status).toBe('at_risk')
      expect(status.isTodayCompleted).toBe(false)
      expect(status.effectiveCurrentStreak).toBe(4)
    })

    it('returns broken status when streak has expired without freeze', () => {
      const data: StreakData = {
        currentStreak: 4,
        longestStreak: 4,
        streakFreezesAvailable: 0,
        lastActivityDate: '2026-08-02',
      }

      const status = getStreakStatusSummary(data, 'UTC', new Date('2026-08-05T12:00:00Z'))

      expect(status.status).toBe('broken')
      expect(status.effectiveCurrentStreak).toBe(0)
    })
  })
})
