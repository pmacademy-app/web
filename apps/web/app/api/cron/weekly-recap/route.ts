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
      const userIds = users.map((u) => u.id)
      const weekStartDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

      // Fetch weekly XP events
      const { data: xpRows } = await (supabase
        .from('xp_events') as any)
        .select('user_id, amount')
        .in('user_id', userIds)
        .gte('created_at', weekStartDate)

      // Fetch weekly completed lessons
      const { data: lessonRows } = await (supabase
        .from('user_lesson_progress') as any)
        .select('user_id')
        .in('user_id', userIds)
        .eq('status', 'completed')
        .gte('completed_at', weekStartDate)

      const xpMap = new Map<string, number>()
      for (const row of xpRows || []) {
        xpMap.set(row.user_id, (xpMap.get(row.user_id) || 0) + (row.amount || 0))
      }

      const lessonMap = new Map<string, number>()
      for (const row of lessonRows || []) {
        lessonMap.set(row.user_id, (lessonMap.get(row.user_id) || 0) + 1)
      }

      const weekNumber = Math.ceil(new Date().getDate() / 7)
      for (const user of users) {
        if (!user.email) continue
        const xpEarnedThisWeek = xpMap.get(user.id) || 0
        const lessonsCompletedCount = lessonMap.get(user.id) || 0

        const result = await enqueueNotificationItem({
          userId: user.id,
          toEmail: user.email,
          toName: user.name || user.email.split('@')[0],
          channel: 'email',
          templateKey: 'learning.weekly_recap',
          templateVariables: {
            userName: user.name || user.email.split('@')[0],
            lessonsCompletedCount,
            xpEarnedThisWeek,
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
