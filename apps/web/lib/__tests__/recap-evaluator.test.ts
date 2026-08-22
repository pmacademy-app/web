import { describe, it, expect } from 'vitest'
import { isUserEligibleForWeeklyRecap } from '../notifications/recap/evaluator'
import { createDefaultNotificationPreferences } from '../notifications/preferences/defaults'
import { globalFeatureFlagService } from '../notifications/feature-flags/service'

describe('Timezone-Aware Recap & Scheduler Abstraction Unit Tests', () => {
  it('Feature flag SCHEDULER_ENABLED is active by default and provider-agnostic', () => {
    expect(globalFeatureFlagService.isEnabled('SCHEDULER_ENABLED')).toBe(true)
    expect(globalFeatureFlagService.getAll().find(f => f.key === 'GITHUB_ACTIONS_SCHEDULER_ENABLED')).toBeUndefined()
  })

  it('isUserEligibleForWeeklyRecap calculates timezone and day/hour eligibility accurately', () => {
    const prefs = createDefaultNotificationPreferences('user-tz-1')
    prefs.timezone = 'America/New_York'
    prefs.preferredRecapDay = 0
    prefs.preferredRecapHour = 18

    const sunday6pmNyInUtc = new Date('2026-08-09T22:00:00Z')

    const res1 = isUserEligibleForWeeklyRecap({
      userPreferences: prefs,
      nowUtc: sunday6pmNyInUtc,
    })

    expect(res1.isEligible).toBe(true)
    expect(res1.reason).toBe('eligible')
    expect(res1.userLocalDay).toBe(0)
    expect(res1.userLocalHour).toBe(18)

    const sunday10amNyInUtc = new Date('2026-08-09T14:00:00Z')
    const res2 = isUserEligibleForWeeklyRecap({
      userPreferences: prefs,
      nowUtc: sunday10amNyInUtc,
    })

    expect(res2.isEligible).toBe(false)
    expect(res2.reason).toBe('hour_mismatch')

    const monday6pmNyInUtc = new Date('2026-08-10T22:00:00Z')
    const res3 = isUserEligibleForWeeklyRecap({
      userPreferences: prefs,
      nowUtc: monday6pmNyInUtc,
    })

    expect(res3.isEligible).toBe(false)
    expect(res3.reason).toBe('day_mismatch')
  })

  it('isUserEligibleForWeeklyRecap respects disabled notification preferences', () => {
    const prefs = createDefaultNotificationPreferences('user-tz-2')
    prefs.allNotifications = false

    const res = isUserEligibleForWeeklyRecap({
      userPreferences: prefs,
      nowUtc: new Date('2026-08-09T22:00:00Z'),
    })

    expect(res.isEligible).toBe(false)
    expect(res.reason).toBe('notifications_disabled')
  })
})
