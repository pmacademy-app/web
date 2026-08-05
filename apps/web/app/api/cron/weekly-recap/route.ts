import { NextResponse } from 'next/server'
import { globalFeatureFlagService } from '@/lib/notifications/feature-flags/service'
import { isUserEligibleForWeeklyRecap } from '@/lib/notifications/recap/evaluator'
import { createDefaultNotificationPreferences } from '@/lib/notifications/preferences/defaults'

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('Authorization')

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Feature flag check: SCHEDULER_ENABLED & WEEKLY_RECAP_ENABLED
  const schedulerActive = globalFeatureFlagService.isEnabled('SCHEDULER_ENABLED')
  const recapActive = globalFeatureFlagService.isEnabled('WEEKLY_RECAP_ENABLED')

  if (!schedulerActive || !recapActive) {
    return NextResponse.json({
      success: true,
      message: 'Weekly recap disabled via Feature Flags',
      schedulerActive,
      recapActive,
    })
  }

  // Timezone-aware batch filter placeholder
  // In production, queries active users and filters using `isUserEligibleForWeeklyRecap`
  const sampleNow = new Date()
  const sampleUserPrefs = createDefaultNotificationPreferences('sample-user')
  const eligibility = isUserEligibleForWeeklyRecap({
    userPreferences: sampleUserPrefs,
    nowUtc: sampleNow,
  })

  return NextResponse.json({
    success: true,
    timestamp: sampleNow.toISOString(),
    evaluationMode: 'timezone_aware',
    sampleUserEligible: eligibility.isEligible,
    eligibilityReason: eligibility.reason,
    recapsQueued: 0,
  })
}

export async function GET(request: Request) {
  return POST(request)
}
