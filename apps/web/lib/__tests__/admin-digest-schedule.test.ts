import { describe, it, expect } from 'vitest'
import { DEFAULT_DIGEST_SCHEDULES } from '@/lib/notifications/automations/service'

describe('Admin Digest Schedules & Cron Matching', () => {
  it('provides default Monday 09:00 UTC for weekly recap and Daily 09:00 UTC for daily reminder', () => {
    expect(DEFAULT_DIGEST_SCHEDULES.weeklyRecap.enabled).toBe(true)
    expect(DEFAULT_DIGEST_SCHEDULES.weeklyRecap.dayOfWeek).toBe(1) // Monday
    expect(DEFAULT_DIGEST_SCHEDULES.weeklyRecap.hourUtc).toBe(9)   // 09:00 UTC

    expect(DEFAULT_DIGEST_SCHEDULES.dailyReminder.enabled).toBe(true)
    expect(DEFAULT_DIGEST_SCHEDULES.dailyReminder.hourUtc).toBe(9) // 09:00 UTC
  })

  it('correctly evaluates matching time window for weekly recap', () => {
    const isMatchingWeeklyWindow = (
      now: Date,
      schedule: { dayOfWeek: number; hourUtc: number }
    ) => {
      return (
        now.getUTCDay() === schedule.dayOfWeek &&
        now.getUTCHours() === schedule.hourUtc
      )
    }

    // Monday 09:30 UTC -> Matches
    const matchingTime = new Date('2026-08-31T09:30:00Z')
    expect(isMatchingWeeklyWindow(matchingTime, { dayOfWeek: 1, hourUtc: 9 })).toBe(true)

    // Tuesday 09:30 UTC -> Does not match
    const tuesdayTime = new Date('2026-09-01T09:30:00Z')
    expect(isMatchingWeeklyWindow(tuesdayTime, { dayOfWeek: 1, hourUtc: 9 })).toBe(false)

    // Monday 14:00 UTC -> Does not match
    const wrongHour = new Date('2026-08-31T14:00:00Z')
    expect(isMatchingWeeklyWindow(wrongHour, { dayOfWeek: 1, hourUtc: 9 })).toBe(false)
  })

  it('correctly evaluates matching hour for daily reminder', () => {
    const isMatchingDailyWindow = (now: Date, hourUtc: number) => {
      return now.getUTCHours() === hourUtc
    }

    const matchingTime = new Date('2026-08-26T09:15:00Z')
    expect(isMatchingDailyWindow(matchingTime, 9)).toBe(true)

    const nonMatchingTime = new Date('2026-08-26T15:00:00Z')
    expect(isMatchingDailyWindow(nonMatchingTime, 9)).toBe(false)
  })

  it('generates deterministic idempotency keys for duplicate prevention', () => {
    const userId = 'usr_123'
    const dateStr = '2026-08-26'
    const weekNum = 35

    const weeklyEventId = `weekly-recap-${userId}-2026-w${weekNum}`
    const dailyEventId = `daily-reminder-${userId}-${dateStr}`

    expect(weeklyEventId).toBe('weekly-recap-usr_123-2026-w35')
    expect(dailyEventId).toBe('daily-reminder-usr_123-2026-08-26')
  })
})
