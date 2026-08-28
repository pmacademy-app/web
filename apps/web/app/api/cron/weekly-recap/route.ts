import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase'
import { EmailAutomationsService } from '@/lib/notifications/automations/service'
import { enqueueNotificationItem } from '@/lib/notifications/queue/processor'

import { requireAdminUser } from '@/lib/admin/guard'

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('Authorization') || request.headers.get('authorization')
  const isCronAuthorized = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`)

  if (!isCronAuthorized) {
    const adminCheck = await requireAdminUser(request)
    if (!adminCheck.authorized) {
      const { logSystemError } = await import('@/lib/monitoring/logger')
      void logSystemError({
        severity: 'warning',
        category: 'cron',
        operation: 'cron_weekly_recap_auth',
        message: 'Unauthorized cron request: CRON_SECRET or Admin session required on /api/cron/weekly-recap',
      })
      return NextResponse.json({ error: 'Unauthorized: Valid CRON_SECRET or Admin session required.' }, { status: 401 })
    }
  }

  const isEnabled = await EmailAutomationsService.isAutomationEnabled('learning.weekly_recap')
  const isGlobalPause = await EmailAutomationsService.isGlobalPauseActive()
  const schedules = await EmailAutomationsService.getDigestSchedules()
  const weeklySched = schedules.weeklyRecap

  if (!isEnabled || isGlobalPause || !weeklySched.enabled) {
    return NextResponse.json({
      success: true,
      message: 'Weekly recap disabled via Admin Automations or Global Pause',
      isEnabled,
      isGlobalPause,
      scheduleEnabled: weeklySched.enabled,
      recapsQueued: 0,
    })
  }

  const url = new URL(request.url)
  const isForced = url.searchParams.get('force') === 'true'

  if (!isForced) {
    const now = new Date()
    const currentDay = now.getUTCDay()
    const currentHour = now.getUTCHours()

    if (currentDay !== weeklySched.dayOfWeek || currentHour !== weeklySched.hourUtc) {
      return NextResponse.json({
        success: true,
        message: 'Skipped: Current time does not match configured schedule window.',
        configured: { dayOfWeek: weeklySched.dayOfWeek, hourUtc: weeklySched.hourUtc },
        current: { dayOfWeek: currentDay, hourUtc: currentHour },
        recapsQueued: 0,
      })
    }
  }

  const supabase = createServiceRoleClient()
  let recapsQueued = 0

  try {
    // Fetch active users with email from users table
    const { data: rawUsers, error: queryErr } = await supabase
      .from('users')
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
      await EmailAutomationsService.recordDigestRun('weeklyRecap')
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
