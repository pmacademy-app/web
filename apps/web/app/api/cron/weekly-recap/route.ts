import { NextResponse } from 'next/server'
import { globalFeatureFlagService } from '@/lib/notifications/feature-flags/service'

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('Authorization')

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const enabled = globalFeatureFlagService.isEnabled('WEEKLY_RECAP_ENABLED')
  if (!enabled) {
    return NextResponse.json({ success: true, message: 'Weekly recap disabled via Feature Flags' })
  }

  // Weekly recap cron processor placeholder
  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    recapsQueued: 0,
  })
}

export async function GET(request: Request) {
  return POST(request)
}
