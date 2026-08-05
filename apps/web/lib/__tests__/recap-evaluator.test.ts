import assert from 'node:assert'
import { isUserEligibleForWeeklyRecap } from '../notifications/recap/evaluator'
import { createDefaultNotificationPreferences } from '../notifications/preferences/defaults'
import { globalFeatureFlagService } from '../notifications/feature-flags/service'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✕ ${name}`)
    console.error(err)
    process.exit(1)
  }
}

console.log('🧪 Running Timezone-Aware Recap & Scheduler Abstraction Unit Tests...\n')

runTest('Feature flag SCHEDULER_ENABLED is active by default and provider-agnostic', () => {
  assert.strictEqual(globalFeatureFlagService.isEnabled('SCHEDULER_ENABLED'), true)
  // Ensure legacy provider-specific name is removed
  assert.strictEqual((globalFeatureFlagService.getAll().find(f => f.key === 'GITHUB_ACTIONS_SCHEDULER_ENABLED')), undefined)
})

runTest('isUserEligibleForWeeklyRecap calculates timezone and day/hour eligibility accurately', () => {
  const prefs = createDefaultNotificationPreferences('user-tz-1')
  prefs.timezone = 'America/New_York'
  prefs.preferredRecapDay = 0 // Sunday
  prefs.preferredRecapHour = 18 // 6 PM local New York time

  // Sunday, 2026-08-09 at 22:00 UTC = Sunday 18:00 (6 PM) EDT
  const sunday6pmNyInUtc = new Date('2026-08-09T22:00:00Z')

  const res1 = isUserEligibleForWeeklyRecap({
    userPreferences: prefs,
    nowUtc: sunday6pmNyInUtc,
  })

  assert.strictEqual(res1.isEligible, true)
  assert.strictEqual(res1.reason, 'eligible')
  assert.strictEqual(res1.userLocalDay, 0)
  assert.strictEqual(res1.userLocalHour, 18)

  // Sunday 14:00 UTC = Sunday 10:00 AM EDT (outside 3-hour tolerance window)
  const sunday10amNyInUtc = new Date('2026-08-09T14:00:00Z')
  const res2 = isUserEligibleForWeeklyRecap({
    userPreferences: prefs,
    nowUtc: sunday10amNyInUtc,
  })

  assert.strictEqual(res2.isEligible, false)
  assert.strictEqual(res2.reason, 'hour_mismatch')

  // Monday 22:00 UTC = Monday 18:00 EDT (day mismatch)
  const monday6pmNyInUtc = new Date('2026-08-10T22:00:00Z')
  const res3 = isUserEligibleForWeeklyRecap({
    userPreferences: prefs,
    nowUtc: monday6pmNyInUtc,
  })

  assert.strictEqual(res3.isEligible, false)
  assert.strictEqual(res3.reason, 'day_mismatch')
})

runTest('isUserEligibleForWeeklyRecap respects disabled notification preferences', () => {
  const prefs = createDefaultNotificationPreferences('user-tz-2')
  prefs.allNotifications = false

  const res = isUserEligibleForWeeklyRecap({
    userPreferences: prefs,
    nowUtc: new Date('2026-08-09T22:00:00Z'),
  })

  assert.strictEqual(res.isEligible, false)
  assert.strictEqual(res.reason, 'notifications_disabled')
})

console.log('\n✅ All Timezone-Aware Weekly Recap Unit Tests Passed Successfully!\n')
