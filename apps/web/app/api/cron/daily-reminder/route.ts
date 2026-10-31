import { after, NextResponse } from 'next/server'
import { z } from 'zod'

import { withRoute } from '@/lib/api/with-route'
import { EmailAutomationsService } from '@/lib/notifications/automations/service'
import { getBatchUserNotificationPreferences } from '@/lib/notifications/preferences/defaults'
import { enqueueNotificationItem } from '@/lib/notifications/queue/processor'
import { getDueCardsCount } from '@/lib/flashcards-service'
import { withCronHeartbeat } from '@/lib/monitoring/cron-heartbeat'
import { daysSinceLastActivity, shouldSendReminder } from '@/lib/notifications/reminder-cadence'
import { findQueuedIdempotencyKeys, isInSendWindow } from '@/lib/notifications/send-window'
import { getStreakStatusSummary } from '@/lib/streaks/streaks'
import { createServiceRoleClient } from '@/lib/supabase'

/** Keyset pagination batch size for daily reminder processing */
const BATCH_SIZE = 100
/** Safety bound on total pages processed per cron invocation to prevent runaway loops */
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
  async ({ query }) => withCronHeartbeat('daily-reminder', async () => {
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

    const supabase = createServiceRoleClient()
    let remindersQueued = 0
    let remindersSkippedTimezone = 0
    let remindersSkippedActiveToday = 0
    let remindersSkippedNoDueCards = 0
    let remindersSkippedAlreadyQueued = 0
    let remindersSkippedCadence = 0
    let skippedPages = 0

    const startTime = Date.now()

    try {
      let lastSeenId: string | null = null

      for (let page = 0; page < MAX_PAGES; page++) {
        // Enforce execution budget to guarantee return before serverless deadline
        if (Date.now() - startTime > MAX_EXECUTION_MS) {
          console.warn('[cron/daily-reminder] Reached execution deadline, stopping pagination')
          break
        }

        // Phase 1.3 — audience inversion. The previous `.gt('current_streak', 0)`
        // filter mailed only the already-engaged and went silent the moment a streak
        // broke, so lapsed learners (exactly the people a reminder should reach) were
        // never contacted. We now page the full base and decide per user below using
        // real activity/due-card data, preserving the T3 keyset pagination.
        let queryBuilder = supabase
          .from('users')
          .select('id, email, name, created_at, current_streak, longest_streak, streak_freezes_available, last_streak_date, timezone')
          .not('email', 'is', null)

        if (lastSeenId) {
          queryBuilder = queryBuilder.gt('id', lastSeenId)
        }

        const { data: rawUsers, error: queryErr } = await queryBuilder
          .order('id', { ascending: true })
          .limit(BATCH_SIZE)

        if (queryErr) {
          const { logSystemError } = await import('@/lib/monitoring/logger')
          after(() => logSystemError({
            severity: 'error',
            category: 'cron',
            operation: 'cron_daily_reminder_query',
            message: `Database query failure in /api/cron/daily-reminder: ${queryErr.message}`,
          }))
          break
        }

        const users = (rawUsers || []) as Array<{
          id: string
          email: string
          name?: string
          created_at?: string | null
          current_streak?: number
          longest_streak?: number
          streak_freezes_available?: number
          last_streak_date?: string | null
          timezone?: string | null
        }>
        if (users.length === 0) break

        const userIds = users.map((u) => u.id)
        // Batch resolve notification preferences for this entire page (anti-N+1).
        // Strict: with defaults standing in for a failed read, a learner who opted out
        // would be mailed, so a failed read skips the page until the next run (CQ-03).
        let prefMap: Awaited<ReturnType<typeof getBatchUserNotificationPreferences>>
        try {
          prefMap = await getBatchUserNotificationPreferences(supabase, userIds, { strict: true })
        } catch (prefErr) {
          skippedPages++
          const { logSystemError } = await import('@/lib/monitoring/logger')
          after(() => logSystemError({
            severity: 'error',
            category: 'cron',
            operation: 'cron_daily_reminder_preferences',
            message: `Notification preferences read failed in /api/cron/daily-reminder; page skipped: ${prefErr instanceof Error ? prefErr.message : String(prefErr)}`,
          }))
          lastSeenId = users[users.length - 1].id
          if (users.length < BATCH_SIZE) break
          continue
        }

        const { getUserLocalTime } = await import('@/lib/notifications/timezone')
        // One clock per page, so the send window, the cadence and the streak agree on "today".
        const now = new Date()

        // ENG-01: level-triggered window. A learner is due from their preferred local hour
        // until 22:00 local (bypassed with force=true), so a missed hourly run is picked up
        // by the next one. The per-local-date idempotency key keeps it to one reminder a
        // day; learners whose key is already queued are skipped here in one read, before
        // any per-learner work.
        const dueThisRun = new Map<
          string,
          { timezone: string; localTime: ReturnType<typeof getUserLocalTime>; idempotencyKey: string }
        >()
        for (const user of users) {
          if (!user.email) continue
          const userPref = prefMap.get(user.id)
          // Prefer the timezone stored on the preferences row; fall back to the
          // user's own profile timezone so no-preference-row learners are still
          // scheduled in their real local window rather than defaulting to UTC.
          const timezone = userPref?.timezone || user.timezone || 'UTC'
          const userLocalTime = getUserLocalTime(timezone, now)
          const targetHour = userPref?.preferredReminderHour ?? dailySched.hourUtc ?? 9
          if (!isForced && !isInSendWindow(userLocalTime, targetHour)) continue
          dueThisRun.set(user.id, {
            timezone,
            localTime: userLocalTime,
            idempotencyKey: `daily-reminder-${user.id}-${userLocalTime.localDate}`,
          })
        }
        const alreadyQueued = await findQueuedIdempotencyKeys(
          supabase,
          [...dueThisRun.values()].map((d) => d.idempotencyKey)
        )

        for (const user of users) {
          if (!user.email) continue

          const userPref = prefMap.get(user.id)
          const due = dueThisRun.get(user.id)
          if (!due) {
            remindersSkippedTimezone++
            continue
          }
          if (alreadyQueued.has(due.idempotencyKey)) {
            remindersSkippedAlreadyQueued++
            continue
          }
          const userLocalTime = due.localTime

          // Phase 1.3 — a learner who already registered activity *today* (their
          // `last_streak_date`, stored in local-date terms by the streak engine,
          // equals today) has no need of a "come review" nudge. Skipping them keeps
          // the reminder targeted at the lapsed/quiet audience.
          if (user.last_streak_date && user.last_streak_date === userLocalTime.localDate) {
            remindersSkippedActiveToday++
            continue
          }

          // PROD-05 (Q8): back off with time since last activity (last_streak_date, else
          // signup). Daily for days 0 to 3, then days 7, 14 and 30, then stop. Checked before
          // the due-card read so a lapsed learner costs no query.
          const quietDays = daysSinceLastActivity({
            lastStreakDate: user.last_streak_date,
            createdAt: user.created_at,
            localDate: userLocalTime.localDate,
            timezone: due.timezone,
          })
          if (!shouldSendReminder(quietDays)) {
            remindersSkippedCadence++
            continue
          }

          // Phase 1.6 — use the REAL due-card count from the SRS engine, never a
          // hardcoded placeholder. Users with zero due cards (including everyone who
          // has never started a lesson, and so has no unlocked cards) are suppressed
          // here — sending "you have cards waiting" to someone with none is the same
          // defect as a zero-activity recap. The never-started audience is owned by
          // the D+1 lifecycle sequence instead (see /api/cron/lifecycle), so no user
          // is contacted twice for the same gap.
          let dueCount = 0
          try {
            dueCount = await getDueCardsCount(supabase, user.id)
          } catch (dueErr) {
            console.warn('[cron/daily-reminder] due-card count failed; suppressing send', user.id, dueErr)
            remindersSkippedNoDueCards++
            continue
          }
          if (dueCount <= 0) {
            remindersSkippedNoDueCards++
            continue
          }

          // PROD-05: users.current_streak only resets on the learner's next activity, so a
          // lapsed learner still stores their old streak. The email shows the effective
          // streak in their timezone (0 once it has broken, freezes included).
          const { effectiveCurrentStreak } = getStreakStatusSummary(
            {
              currentStreak: user.current_streak ?? 0,
              longestStreak: user.longest_streak ?? 0,
              streakFreezesAvailable: user.streak_freezes_available ?? 0,
              lastActivityDate: user.last_streak_date ?? '',
            },
            due.timezone,
            now
          )

          const idempotencyKey = due.idempotencyKey
          const result = await enqueueNotificationItem({
            userId: user.id,
            toEmail: user.email,
            toName: user.name || user.email.split('@')[0],
            channel: 'email',
            templateKey: 'learning.daily_reminder',
            templateVariables: {
              userName: user.name || user.email.split('@')[0],
              currentStreak: effectiveCurrentStreak,
              longestStreak: user.longest_streak ?? 0,
              dueCount,
            },
            eventId: idempotencyKey,
            idempotencyKey,
            eventType: 'learning.daily_reminder',
            category: 'learning',
            priorityLevel: 'medium',
            preloadedPreferences: userPref,
          })
          if (result.success) remindersQueued++
        }

        lastSeenId = users[users.length - 1].id
        if (users.length < BATCH_SIZE) break
      }

      await EmailAutomationsService.recordDigestRun('dailyReminder')
    } catch (err) {
      console.error('[cron/daily-reminder] Failed to queue daily reminders:', err)
      const { logSystemError } = await import('@/lib/monitoring/logger')
      after(() => logSystemError({
        severity: 'error',
        category: 'cron',
        operation: 'cron_daily_reminder_exception',
        message: `Unhandled exception in /api/cron/daily-reminder: ${err instanceof Error ? err.message : String(err)}`,
      }))
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      remindersQueued,
      remindersSkippedTimezone,
      remindersSkippedActiveToday,
      remindersSkippedNoDueCards,
      remindersSkippedAlreadyQueued,
      remindersSkippedCadence,
      skippedPages,
    })
  })
)

export const GET = POST
