import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { EmailAutomationsService } from '@/lib/notifications/automations/service'
import { enqueueNotificationItem } from '@/lib/notifications/queue/processor'

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('Authorization')

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    const { logSystemError } = await import('@/lib/monitoring/logger')
    void logSystemError({
      severity: 'warning',
      category: 'cron',
      operation: 'cron_weekly_recap_auth',
      message: 'Unauthorized cron request: CRON_SECRET mismatch on /api/cron/weekly-recap',
    })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const isEnabled = await EmailAutomationsService.isAutomationEnabled('learning.weekly_recap')
  const isGlobalPause = await EmailAutomationsService.isGlobalPauseActive()

  if (!isEnabled || isGlobalPause) {
    return NextResponse.json({
      success: true,
      message: 'Weekly recap disabled via Admin Automations or Global Pause',
      isEnabled,
      isGlobalPause,
      recapsQueued: 0,
    })
  }

  const supabase = createServerSupabaseClient()
  let recapsQueued = 0

  try {
    // Fetch active users with email from users table
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rawUsers, error: queryErr } = await (supabase.from('users' as any) as any)
      .select('id, email, name, total_xp, current_streak')
      .not('email', 'is', null)
      .limit(100)

    if (queryErr) {
      const { logSystemError } = await import('@/lib/monitoring/logger')
      void logSystemError({
        severity: 'error',
        category: 'cron',
        operation: 'cron_weekly_recap_query',
        message: `Database query failure in /api/cron/weekly-recap: ${queryErr.message}`,
      })
    }

    const users = (rawUsers || []) as Array<{ id: string; email: string; name?: string; total_xp?: number; current_streak?: number }>

    if (users.length > 0) {
      const weekNumber = Math.ceil(new Date().getDate() / 7)
      for (const user of users) {
        if (!user.email) continue
        const result = await enqueueNotificationItem({
          userId: user.id,
          toEmail: user.email,
          toName: user.name || user.email.split('@')[0],
          channel: 'email',
          templateKey: 'learning.weekly_recap',
          templateVariables: {
            userName: user.name || user.email.split('@')[0],
            lessonsCompletedCount: Math.floor((user.total_xp || 0) / 50),
            xpEarnedThisWeek: Math.min(300, user.total_xp || 0),
            currentStreak: user.current_streak || 0,
            weekNumber,
          },
          eventId: `weekly-recap-${user.id}-${new Date().toISOString().slice(0, 10)}`,
          eventType: 'system.weekly_recap',
          category: 'learning',
          priorityLevel: 'medium',
        })
        if (result.success) recapsQueued++
      }
    }
  } catch (err) {
    console.error('[cron/weekly-recap] Failed to process weekly recaps:', err)
    const { logSystemError } = await import('@/lib/monitoring/logger')
    void logSystemError({
      severity: 'error',
      category: 'cron',
      operation: 'cron_weekly_recap_exception',
      message: `Unhandled exception in /api/cron/weekly-recap: ${err instanceof Error ? err.message : String(err)}`,
    })
  }

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    recapsQueued,
  })
}

export async function GET(request: Request) {
  return POST(request)
}
