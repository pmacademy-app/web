import { NextResponse } from 'next/server'
import { z } from 'zod'

import { withRoute } from '@/lib/api/with-route'
import { EmailAutomationsService } from '@/lib/notifications/automations/service'
import { getBatchUserNotificationPreferences } from '@/lib/notifications/preferences/defaults'
import { enqueueNotificationItem } from '@/lib/notifications/queue/processor'
import { createServiceRoleClient } from '@/lib/supabase'

/** Keyset pagination batch size for weekly recap processing */
const BATCH_SIZE = 100
/** Safety bound on total pages processed per cron invocation */
const MAX_PAGES = 50
/** Maximum execution duration per cron run to respect serverless function deadlines (50s) */
const MAX_EXECUTION_MS = 50_000

/**
 * `force=true` bypasses the schedule-window check. Every value is accepted, as
 * before migration — only the literal string 'true' has an effect — so declaring
 * the schema moves the parsing into the contract without changing behaviour.
 */
const forceQuerySchema = z.object({ force: z.string().optional() })

export const POST = withRoute(
  {
    actor: { allow: ['cron', 'admin'] },
    operation: 'cron.weekly_recap',
    domain: 'cron',
    summary: 'Unhandled exception in /api/cron/weekly-recap',
    query: forceQuerySchema,
    onDenied: async () => {
      const { logSystemError } = await import('@/lib/monitoring/logger')
      await logSystemError({
        severity: 'warning',
        category: 'cron',
        operation: 'cron_weekly_recap_auth',
        message: 'Unauthorized cron request: CRON_SECRET or Admin session required on /api/cron/weekly-recap',
      })
    },
  },
  async ({ query }) => {
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

    const isForced = query.force === 'true'

    const supabase = createServiceRoleClient()
    let recapsQueued = 0
    let recapsSkippedTimezone = 0

    const startTime = Date.now()
    const weekStartDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const weekNumber = Math.ceil(new Date().getDate() / 7)

    try {
      let lastSeenId: string | null = null

      for (let page = 0; page < MAX_PAGES; page++) {
        // Enforce execution budget to guarantee return before serverless deadline
        if (Date.now() - startTime > MAX_EXECUTION_MS) {
          console.warn('[cron/weekly-recap] Reached execution deadline, stopping pagination')
          break
        }

        let queryBuilder = supabase
          .from('users')
          .select('id, email, name, total_xp, current_streak')
          .not('email', 'is', null)

        if (lastSeenId) {
          queryBuilder = queryBuilder.gt('id', lastSeenId)
        }

        const { data: rawUsers, error: queryErr } = await queryBuilder
          .order('id', { ascending: true })
          .limit(BATCH_SIZE)

        if (queryErr) {
          const { logSystemError } = await import('@/lib/monitoring/logger')
          void logSystemError({
            severity: 'error',
            category: 'cron',
            operation: 'cron_weekly_recap_query',
            message: `Database query failure in /api/cron/weekly-recap: ${queryErr.message}`,
          })
          break
        }

        const users = (rawUsers || []) as Array<{ id: string; email: string; name?: string; total_xp?: number; current_streak?: number }>
        if (users.length === 0) break

        const userIds = users.map((u) => u.id)

        // Batch fetch in parallel: weekly XP events, weekly completed lessons, and notification preferences
        const [xpRes, lessonRes, prefMap] = await Promise.all([
          supabase
            .from('xp_events')
            .select('user_id, xp_amount')
            .in('user_id', userIds)
            .gte('created_at', weekStartDate),
          supabase
            .from('user_lesson_progress')
            .select('user_id')
            .in('user_id', userIds)
            .eq('status', 'completed')
            .gte('completed_at', weekStartDate),
          getBatchUserNotificationPreferences(supabase, userIds),
        ])

        const xpMap = new Map<string, number>()
        for (const row of (xpRes.data || []) as Array<{ user_id: string; xp_amount: number }>) {
          if (!row.user_id) continue
          xpMap.set(row.user_id, (xpMap.get(row.user_id) || 0) + (row.xp_amount || 0))
        }

        const lessonMap = new Map<string, number>()
        for (const row of (lessonRes.data || []) as Array<{ user_id: string }>) {
          lessonMap.set(row.user_id, (lessonMap.get(row.user_id) || 0) + 1)
        }

        const { getUserLocalTime } = await import('@/lib/notifications/timezone')

        for (const user of users) {
          if (!user.email) continue

          const userPref = prefMap.get(user.id)
          const userLocalTime = getUserLocalTime(userPref?.timezone)
          const targetDay = userPref?.preferredRecapDay ?? weeklySched.dayOfWeek ?? 0
          const targetHour = userPref?.preferredRecapHour ?? weeklySched.hourUtc ?? 18

          // Timezone-aware delivery window evaluation:
          // Dispatches only when user's local day of week and local hour match the recap window (bypassed with force=true)
          if (!isForced && (userLocalTime.localDayOfWeek !== targetDay || userLocalTime.localHour !== targetHour)) {
            recapsSkippedTimezone++
            continue
          }

          const xpEarnedThisWeek = xpMap.get(user.id) || 0
          const lessonsCompletedCount = lessonMap.get(user.id) || 0
          const idempotencyKey = `weekly-recap-${user.id}-${userLocalTime.localDate}`

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
            eventId: idempotencyKey,
            idempotencyKey,
            eventType: 'system.weekly_recap',
            category: 'learning',
            priorityLevel: 'medium',
            preloadedPreferences: userPref,
          })
          if (result.success) recapsQueued++
        }

        lastSeenId = users[users.length - 1].id
        if (users.length < BATCH_SIZE) break
      }

      await EmailAutomationsService.recordDigestRun('weeklyRecap')
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
)

export const GET = POST
