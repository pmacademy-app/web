import { NextResponse } from 'next/server'
import { z } from 'zod'

import { withRoute } from '@/lib/api/with-route'
import { EmailAutomationsService } from '@/lib/notifications/automations/service'
import { enqueueNotificationItem } from '@/lib/notifications/queue/processor'
import { createServiceRoleClient } from '@/lib/supabase'

/**
 * `force=true` bypasses the schedule-window check. Every value is accepted, as
 * before migration — only the literal string 'true' has an effect — so declaring
 * the schema moves the parsing into the contract without changing behaviour.
 */
const forceQuerySchema = z.object({ force: z.string().optional() })

export const POST = withRoute(
  {
    actor: { allow: ['cron', 'admin'] },
    operation: 'cron.daily_reminder',
    domain: 'cron',
    summary: 'Unhandled exception in /api/cron/daily-reminder',
    query: forceQuerySchema,
    onDenied: async () => {
      const { logSystemError } = await import('@/lib/monitoring/logger')
      await logSystemError({
        severity: 'warning',
        category: 'cron',
        operation: 'cron_daily_reminder_auth',
        message: 'Unauthorized cron request: CRON_SECRET or Admin session required on /api/cron/daily-reminder',
      })
    },
  },
  async ({ query }) => {
    const isEnabled = await EmailAutomationsService.isAutomationEnabled('learning.daily_reminder')
    const isGlobalPause = await EmailAutomationsService.isGlobalPauseActive()
    const schedules = await EmailAutomationsService.getDigestSchedules()
    const dailySched = schedules.dailyReminder

    if (!isEnabled || isGlobalPause || !dailySched.enabled) {
      return NextResponse.json({
        success: true,
        message: 'Daily reminder disabled via Admin Automations or Global Pause',
        isEnabled,
        isGlobalPause,
        scheduleEnabled: dailySched.enabled,
        remindersQueued: 0,
      })
    }

    const isForced = query.force === 'true'

    if (!isForced) {
      const now = new Date()
      const currentHour = now.getUTCHours()

      if (currentHour !== dailySched.hourUtc) {
        return NextResponse.json({
          success: true,
          message: 'Skipped: Current time does not match configured daily schedule window.',
          configured: { hourUtc: dailySched.hourUtc },
          current: { hourUtc: currentHour },
          remindersQueued: 0,
        })
      }
    }

    const supabase = createServiceRoleClient()
    let remindersQueued = 0

    try {
      const { data: rawUsers, error: queryErr } = await supabase
        .from('users')
        .select('id, email, name, current_streak')
        .gt('current_streak', 0)
        .not('email', 'is', null)
        .limit(100)

      if (queryErr) {
        const { logSystemError } = await import('@/lib/monitoring/logger')
        void logSystemError({
          severity: 'error',
          category: 'cron',
          operation: 'cron_daily_reminder_query',
          message: `Database query failure in /api/cron/daily-reminder: ${queryErr.message}`,
        })
      }

      const users = (rawUsers || []) as Array<{ id: string; email: string; name?: string; current_streak?: number }>

      if (users.length > 0) {
        const todayDate = new Date().toISOString().slice(0, 10)
        for (const user of users) {
          if (!user.email) continue
          const result = await enqueueNotificationItem({
            userId: user.id,
            toEmail: user.email,
            toName: user.name || user.email.split('@')[0],
            channel: 'email',
            templateKey: 'learning.daily_reminder',
            templateVariables: {
              userName: user.name || user.email.split('@')[0],
              currentStreak: user.current_streak || 1,
              dueCount: 5,
            },
            eventId: `daily-reminder-${user.id}-${todayDate}`,
            eventType: 'learning.daily_reminder',
            category: 'learning',
            priorityLevel: 'medium',
          })
          if (result.success) remindersQueued++
        }
        await EmailAutomationsService.recordDigestRun('dailyReminder')
      }
    } catch (err) {
      console.error('[cron/daily-reminder] Failed to queue daily reminders:', err)
      const { logSystemError } = await import('@/lib/monitoring/logger')
      void logSystemError({
        severity: 'error',
        category: 'cron',
        operation: 'cron_daily_reminder_exception',
        message: `Unhandled exception in /api/cron/daily-reminder: ${err instanceof Error ? err.message : String(err)}`,
      })
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      remindersQueued,
    })
  }
)

export const GET = POST
