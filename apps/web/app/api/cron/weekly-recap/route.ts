import { NextResponse } from 'next/server'
import { z } from 'zod'

import { withRoute } from '@/lib/api/with-route'
import { EmailAutomationsService } from '@/lib/notifications/automations/service'
import { getBatchUserNotificationPreferences } from '@/lib/notifications/preferences/defaults'
import { enqueueNotificationItem } from '@/lib/notifications/queue/processor'
import { createServiceRoleClient } from '@/lib/supabase'
import { loadProofStates } from '@/lib/growth/proof-state-db'
import { fetchAllRows } from '@/lib/growth/fetch-all-rows'
import { selectProofNextStep } from '@/lib/growth/proof-state'
import { resolveReferralRewardXp } from '@/lib/referral/referral-service'
import { BRAND } from '@/lib/brand'
import { withCronHeartbeat } from '@/lib/monitoring/cron-heartbeat'
import {
  findQueuedIdempotencyKeys,
  isInWeeklySendWindow,
  localIsoWeekKey,
  weeklyAnchorLocalDate,
} from '@/lib/notifications/send-window'

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
  async ({ query }) => withCronHeartbeat('weekly-recap', async () => {
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
    let recapsSkippedNoActivity = 0
    let recapsSkippedAlreadyQueued = 0
    let skippedPages = 0

    const startTime = Date.now()
    const weekStartDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const weekNumber = Math.ceil(new Date().getDate() / 7)
    const siteOrigin = (process.env.NEXT_PUBLIC_SITE_URL || BRAND.siteUrl).replace(/\/$/, '')
    // Growth R5 B9: the referral line states the live reward (once per run).
    const referralRewardXp = await resolveReferralRewardXp()

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
        const [xpRes, lessonRes, prefRead] = await Promise.all([
          // Paged: a week of XP events for a whole page of learners can pass the 1000-row cap.
          fetchAllRows<{ user_id: string | null; xp_amount: number; created_at: string }>((lo, hi) =>
            supabase
              .from('xp_events')
              .select('user_id, xp_amount, created_at')
              .in('user_id', userIds)
              .gte('created_at', weekStartDate)
              .order('id')
              .range(lo, hi),
          ),
          supabase
            .from('user_lesson_progress')
            .select('user_id')
            .in('user_id', userIds)
            .eq('status', 'completed')
            .gte('completed_at', weekStartDate),
          // Strict: a failed read must not stand in as "everyone opted in" (see the skip below).
          getBatchUserNotificationPreferences(supabase, userIds, { strict: true }).then(
            (map) => ({ map, error: null }),
            (error: unknown) => ({ map: null, error }),
          ),
        ])

        // With defaults standing in for a failed read, a learner who opted out would be
        // mailed, so a failed read skips the page until the next run (CQ-03).
        if (!prefRead.map) {
          skippedPages++
          const { logSystemError } = await import('@/lib/monitoring/logger')
          const reason = prefRead.error instanceof Error ? prefRead.error.message : String(prefRead.error)
          void logSystemError({
            severity: 'error',
            category: 'cron',
            operation: 'cron_weekly_recap_preferences',
            message: `Notification preferences read failed in /api/cron/weekly-recap; page skipped: ${reason}`,
          })
          lastSeenId = users[users.length - 1].id
          if (users.length < BATCH_SIZE) break
          continue
        }
        const prefMap = prefRead.map

        const xpMap = new Map<string, number>()
        // Distinct UTC days with any XP this week: the recap's "days studied".
        const studyDays = new Map<string, Set<string>>()
        for (const row of (xpRes.data || []) as Array<{ user_id: string; xp_amount: number; created_at?: string }>) {
          if (!row.user_id) continue
          xpMap.set(row.user_id, (xpMap.get(row.user_id) || 0) + (row.xp_amount || 0))
          if (row.created_at) {
            const days = studyDays.get(row.user_id) ?? new Set<string>()
            days.add(row.created_at.slice(0, 10))
            studyDays.set(row.user_id, days)
          }
        }

        const lessonMap = new Map<string, number>()
        for (const row of (lessonRes.data || []) as Array<{ user_id: string }>) {
          lessonMap.set(row.user_id, (lessonMap.get(row.user_id) || 0) + 1)
        }

        const { getUserLocalTime } = await import('@/lib/notifications/timezone')
        // Learners due a recap this run, collected first so their proof state loads in one batch.
        const due: Array<{
          user: (typeof users)[number]
          userPref: ReturnType<typeof prefMap.get>
          idempotencyKey: string
          /** The pre-ENG-01 key (`weekly-recap-<user>-<preferred local date>`), checked so the
           *  switch to per-week keys cannot send a second recap in the week it deploys. */
          legacyKey: string
          xpEarnedThisWeek: number
          lessonsCompletedCount: number
        }> = []

        for (const user of users) {
          if (!user.email) continue

          const userPref = prefMap.get(user.id)
          const userLocalTime = getUserLocalTime(userPref?.timezone)
          const targetDay = userPref?.preferredRecapDay ?? weeklySched.dayOfWeek ?? 0
          const targetHour = userPref?.preferredRecapHour ?? weeklySched.hourUtc ?? 18

          // ENG-01: level-triggered window. Due from the preferred local hour until 22:00 on the
          // preferred day, or on a later day of the same local ISO week if every run that day
          // was missed (bypassed with force=true). The per-ISO-week key keeps it to one recap.
          if (!isForced && !isInWeeklySendWindow(userLocalTime, targetDay, targetHour)) {
            recapsSkippedTimezone++
            continue
          }

          const xpEarnedThisWeek = xpMap.get(user.id) || 0
          const lessonsCompletedCount = lessonMap.get(user.id) || 0

          // Phase 1.4 — suppress zero-value recaps. A "0 lessons, 0 XP this week"
          // summary is noise that trains learners to ignore the channel and inflates
          // unsubscribe/complaint rates. Only mail a recap when there is meaningful
          // activity to report. (Timezone gating above already ran, so this does not
          // affect delivery timing for active learners.)
          if (xpEarnedThisWeek <= 0 && lessonsCompletedCount <= 0) {
            recapsSkippedNoActivity++
            continue
          }

          due.push({
            user,
            userPref,
            idempotencyKey: `weekly-recap-${user.id}-${localIsoWeekKey(userLocalTime.localDate)}`,
            legacyKey: `weekly-recap-${user.id}-${weeklyAnchorLocalDate(userLocalTime.localDate, userLocalTime.localDayOfWeek, targetDay)}`,
            xpEarnedThisWeek,
            lessonsCompletedCount,
          })
        }

        // Learners already queued this week are dropped in one read, before the proof-state load
        // and the per-learner enqueue (whose duplicate path would write a skipped-event row).
        const alreadyQueued = await findQueuedIdempotencyKeys(
          supabase,
          due.flatMap((d) => [d.idempotencyKey, d.legacyKey])
        )
        const toSend = due.filter((d) => {
          const queued = alreadyQueued.has(d.idempotencyKey) || alreadyQueued.has(d.legacyKey)
          if (queued) recapsSkippedAlreadyQueued++
          return !queued
        })

        // Growth R5 B9: one proof next-step line per recap. A failed read only drops the line.
        const proofStates = toSend.length > 0 ? await loadProofStates(supabase, toSend.map((d) => d.user.id)).catch(() => null) : null

        for (const { user, userPref, idempotencyKey, xpEarnedThisWeek, lessonsCompletedCount } of toSend) {
          const proofState = proofStates?.get(user.id)
          const nextStep = proofState ? selectProofNextStep(proofState) : null

          const result = await enqueueNotificationItem({
            userId: user.id,
            toEmail: user.email,
            toName: user.name || user.email.split('@')[0],
            channel: 'email',
            templateKey: 'learning.weekly_recap',
            templateVariables: {
              userName: user.name || user.email.split('@')[0],
              lessonsCompletedThisWeek: lessonsCompletedCount,
              xpEarnedThisWeek,
              currentStreak: user.current_streak || 0,
              // A rolling 7x24h window can touch 8 calendar dates.
              daysStudiedThisWeek: Math.min(7, studyDays.get(user.id)?.size ?? 0),
              weekNumber,
              proofStepText: nextStep && nextStep.kind !== 'none' ? nextStep.text : null,
              proofStepUrl: nextStep && nextStep.kind !== 'none' ? `${siteOrigin}${nextStep.path}` : null,
              referralRewardXp,
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
      recapsSkippedTimezone,
      recapsSkippedNoActivity,
      recapsSkippedAlreadyQueued,
      skippedPages,
    })
  })
)

export const GET = POST
