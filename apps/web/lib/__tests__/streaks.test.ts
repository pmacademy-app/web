import { describe, it } from 'node:test'
import assert from 'node:assert'
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
      // 2026-08-05 01:30 UTC -> 2026-08-04 21:30 EDT (New York)
      const date = new Date('2026-08-05T01:30:00Z')
      const nyDate = getLocalDateString('America/New_York', date)
      const utcDate = getLocalDateString('UTC', date)

      assert.strictEqual(nyDate, '2026-08-04')
      assert.strictEqual(utcDate, '2026-08-05')
    })

    it('handles fallback safely on invalid timezone', () => {
      const date = new Date('2026-08-05T12:00:00Z')
      const dateStr = getLocalDateString('Invalid/Timezone', date)
      assert.strictEqual(dateStr, '2026-08-05')
    })

    it('calculates days difference across month boundaries correctly', () => {
      assert.strictEqual(getDaysDifference('2026-07-31', '2026-08-01'), 1)
      assert.strictEqual(isConsecutiveDay('2026-07-31', '2026-08-01'), true)
      assert.strictEqual(getDaysDifference('2026-08-01', '2026-08-04'), 3)
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

      assert.strictEqual(result.currentStreak, 1)
      assert.strictEqual(result.longestStreak, 1)
      assert.strictEqual(result.streakIncremented, true)
      assert.strictEqual(result.freezeUsed, false)
      assert.strictEqual(result.lastActivityDate, '2026-08-05')
    })

    it('prevents double streak increments on the same day', () => {
      const currentData: StreakData = {
        currentStreak: 5,
        longestStreak: 5,
        streakFreezesAvailable: 0,
        lastActivityDate: '2026-08-05',
      }

      const result = recordActivityStreak(currentData, 'UTC', new Date('2026-08-05T18:00:00Z'))

      assert.strictEqual(result.currentStreak, 5)
      assert.strictEqual(result.streakIncremented, false)
      assert.strictEqual(result.freezeUsed, false)
    })

    it('increments streak on consecutive day activity', () => {
      const currentData: StreakData = {
        currentStreak: 3,
        longestStreak: 5,
        streakFreezesAvailable: 0,
        lastActivityDate: '2026-08-04',
      }

      const result = recordActivityStreak(currentData, 'UTC', new Date('2026-08-05T10:00:00Z'))

      assert.strictEqual(result.currentStreak, 4)
      assert.strictEqual(result.longestStreak, 5)
      assert.strictEqual(result.streakIncremented, true)
      assert.strictEqual(result.freezeUsed, false)
    })

    it('updates longest streak when current streak exceeds previous record', () => {
      const currentData: StreakData = {
        currentStreak: 5,
        longestStreak: 5,
        streakFreezesAvailable: 0,
        lastActivityDate: '2026-08-04',
      }

      const result = recordActivityStreak(currentData, 'UTC', new Date('2026-08-05T10:00:00Z'))

      assert.strictEqual(result.currentStreak, 6)
      assert.strictEqual(result.longestStreak, 6)
    })
  })

  describe('Earned Streak Freeze Mechanics', () => {
    it('earns 1 freeze upon reaching 7 consecutive days', () => {
      assert.strictEqual(checkEarnedFreezeEligibility(7, 0), true)
      assert.strictEqual(checkEarnedFreezeEligibility(14, 0), true)
      assert.strictEqual(checkEarnedFreezeEligibility(6, 0), false)
    })

    it('caps available freezes at maximum of 2', () => {
      assert.strictEqual(checkEarnedFreezeEligibility(7, 2, 2), false)
    })

    it('automatically awards freeze on day 7 activity', () => {
      const currentData: StreakData = {
        currentStreak: 6,
        longestStreak: 6,
        streakFreezesAvailable: 0,
        lastActivityDate: '2026-08-04',
      }

      const result = recordActivityStreak(currentData, 'UTC', new Date('2026-08-05T10:00:00Z'))

      assert.strictEqual(result.currentStreak, 7)
      assert.strictEqual(result.freezeEarned, true)
      assert.strictEqual(result.streakFreezesAvailable, 1)
    })
  })

  describe('Missed Day Recovery & Freeze Consumption', () => {
    it('consumes available freeze when 1 day is missed (diff === 2)', () => {
      const currentData: StreakData = {
        currentStreak: 10,
        longestStreak: 10,
        streakFreezesAvailable: 1,
        lastActivityDate: '2026-08-03', // Missed Aug 4, activity on Aug 5
      }

      const result = recordActivityStreak(currentData, 'UTC', new Date('2026-08-05T10:00:00Z'))

      assert.strictEqual(result.currentStreak, 11)
      assert.strictEqual(result.longestStreak, 11)
      assert.strictEqual(result.freezeUsed, true)
      assert.strictEqual(result.streakFreezesAvailable, 0)
      assert.strictEqual(result.streakBroken, false)
    })

    it('resets streak to 1 when 1 day is missed WITHOUT freeze available', () => {
      const currentData: StreakData = {
        currentStreak: 10,
        longestStreak: 10,
        streakFreezesAvailable: 0,
        lastActivityDate: '2026-08-03', // Missed Aug 4
      }

      const result = recordActivityStreak(currentData, 'UTC', new Date('2026-08-05T10:00:00Z'))

      assert.strictEqual(result.currentStreak, 1)
      assert.strictEqual(result.longestStreak, 10) // Preserved
      assert.strictEqual(result.freezeUsed, false)
      assert.strictEqual(result.streakBroken, true)
    })

    it('resets streak to 1 when multiple days are missed (diff >= 3) even with freezes', () => {
      const currentData: StreakData = {
        currentStreak: 15,
        longestStreak: 15,
        streakFreezesAvailable: 2,
        lastActivityDate: '2026-08-01', // Missed Aug 2, 3, 4
      }

      const result = recordActivityStreak(currentData, 'UTC', new Date('2026-08-05T10:00:00Z'))

      assert.strictEqual(result.currentStreak, 1)
      assert.strictEqual(result.longestStreak, 15)
      assert.strictEqual(result.freezeUsed, false)
      assert.strictEqual(result.streakBroken, true)
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

      assert.strictEqual(status.status, 'active')
      assert.strictEqual(status.isTodayCompleted, true)
      assert.strictEqual(status.effectiveCurrentStreak, 4)
    })

    it('returns at_risk status when activity is due today', () => {
      const data: StreakData = {
        currentStreak: 4,
        longestStreak: 4,
        streakFreezesAvailable: 0,
        lastActivityDate: '2026-08-04',
      }

      const status = getStreakStatusSummary(data, 'UTC', new Date('2026-08-05T12:00:00Z'))

      assert.strictEqual(status.status, 'at_risk')
      assert.strictEqual(status.isTodayCompleted, false)
      assert.strictEqual(status.effectiveCurrentStreak, 4)
    })

    it('returns broken status when streak has expired without freeze', () => {
      const data: StreakData = {
        currentStreak: 4,
        longestStreak: 4,
        streakFreezesAvailable: 0,
        lastActivityDate: '2026-08-02',
      }

      const status = getStreakStatusSummary(data, 'UTC', new Date('2026-08-05T12:00:00Z'))

      assert.strictEqual(status.status, 'broken')
      assert.strictEqual(status.effectiveCurrentStreak, 0)
    })
  })
})
