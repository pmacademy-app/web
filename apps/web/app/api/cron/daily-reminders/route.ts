import { NextResponse } from 'next/server'
import { globalFeatureFlagService } from '@/lib/notifications/feature-flags/service'

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('Authorization')

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const enabled = globalFeatureFlagService.isEnabled('DAILY_REMINDERS_ENABLED')
  if (!enabled) {
    return NextResponse.json({ success: true, message: 'Daily reminders paused via Feature Flags' })
  }

  // Daily reminder timezone check logic placeholder
  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    remindersQueued: 0,
  })
}

export async function GET(request: Request) {
  return POST(request)
}
