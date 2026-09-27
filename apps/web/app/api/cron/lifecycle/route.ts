import { NextResponse } from 'next/server'
import { z } from 'zod'

import { withRoute } from '@/lib/api/with-route'
import { EmailAutomationsService } from '@/lib/notifications/automations/service'
import { getBatchUserNotificationPreferences } from '@/lib/notifications/preferences/defaults'
import { enqueueNotificationItem } from '@/lib/notifications/queue/processor'
import { isLifecycleHoldout } from '@/lib/notifications/lifecycle/holdout'
import {
  resolveLifecycleSequence,
  type LifecycleSequenceKey,
  type LifecycleUserSnapshot,
} from '@/lib/notifications/lifecycle/segments'
import { createServiceRoleClient } from '@/lib/supabase'

/** Keyset pagination batch size for lifecycle processing (mirrors T3 crons). */
const BATCH_SIZE = 100
/** Safety bound on total pages processed per cron invocation. */
const MAX_PAGES = 50
/** Maximum execution duration per cron run to respect serverless deadlines (50s). */
const MAX_EXECUTION_MS = 50_000

/**
 * `force=true` bypasses the per-user local-hour schedule window, matching the daily
 * reminder / weekly recap crons. Only the literal string 'true' has an effect.
 */
const forceQuerySchema = z.object({ force: z.string().optional() })

/**
 * Phase 1.5 — Lifecycle reactivation cron.
 *
 * Evaluates every user against the three lifecycle sequences (D+1 never-started,
 * D+3 started-not-finished, streak-broken → quiet), assigns each qualifying user to at
 * most one sequence, applies a deterministic 30% holdout, and enqueues the treatment
 * email through the standard notification pipeline (`enqueueNotificationItem`) so that
 * feature flags, per-template automation toggles, the global pause, suppression /
 * unsubscribe, preference resolution, daily quota, and idempotency all apply unchanged.
 *
 * Runs hourly on the shared '30 * * * *' scheduler trigger; the per-user local-hour
 * gate plus a local-date idempotency key make delivery exactly-once per user per day.
 */
export const POST = withRoute(
  {
    actor: { allow: ['cron', 'admin'] },
    operation: 'cron.lifecycle',
    domain: 'cron',
    summary: 'Unhandled exception in /api/cron/lifecycle',
    query: forceQuerySchema,
    onDenied: async () => {
      const { logSystemError } = await import('@/lib/monitoring/logger')
      await logSystemError({
        severity: 'warning',
        category: 'cron',
        operation: 'cron_lifecycle_auth',
        message: 'Unauthorized cron request: CRON_SECRET or Admin session required on /api/cron/lifecycle',
      })
    },
  },
  async ({ query }) => {
    // Global pause short-circuits the whole run (per-template toggles are still enforced
    // by enqueueNotificationItem for finer control). Digest schedule reuse: lifecycle
    // sends land in the user's daily-reminder local window.
    const isGlobalPause = await EmailAutomationsService.isGlobalPauseActive()
    const schedules = await EmailAutomationsService.getDigestSchedules()
    const dailySched = schedules.dailyReminder

    if (isGlobalPause) {
      return NextResponse.json({
        success: true,
        message: 'Lifecycle sequences suppressed by Global Pause',
        isGlobalPause,
        lifecycleQueued: 0,
      })
    }

    const isForced = query.force === 'true'
    const supabase = createServiceRoleClient()
    const nowUtc = new Date()

    let lifecycleQueued = 0
    let skippedTimezone = 0
    let skippedNoSegment = 0
    let heldOut = 0
    const queuedBySequence: Record<LifecycleSequenceKey, number> = {
      'lifecycle.d1_never_started': 0,
      'lifecycle.d3_started_not_finished': 0,
      'lifecycle.streak_broken': 0,
    }

    const startTime = Date.now()

    try {
      let lastSeenId: string | null = null

      for (let page = 0; page < MAX_PAGES; page++) {
        if (Date.now() - startTime > MAX_EXECUTION_MS) {
          console.warn('[cron/lifecycle] Reached execution deadline, stopping pagination')
          break
        }

        let queryBuilder = supabase
          .from('users')
          .select('id, email, name, created_at, current_streak, longest_streak, last_streak_date, timezone')
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
            operation: 'cron_lifecycle_query',
            message: `Database query failure in /api/cron/lifecycle: ${queryErr.message}`,
          })
          break
        }

        const users = (rawUsers || []) as Array<{
          id: string
          email: string
          name?: string
          created_at: string
          current_streak?: number
          longest_streak?: number
          last_streak_date?: string | null
          timezone?: string | null
        }>
        if (users.length === 0) break

        const userIds = users.map((u) => u.id)

        // Batch-resolve, for this page only: notification preferences, and the two
        // learning-progress signals the segments need (has any progress row; has a
        // completed lesson). Two lightweight queries per page — no N+1.
        const [prefMap, progressRes] = await Promise.all([
          getBatchUserNotificationPreferences(supabase, userIds),
          supabase
            .from('user_lesson_progress')
            .select('user_id, status')
            .in('user_id', userIds),
        ])

        const hasAnyProgress = new Set<string>()
        const hasCompletedLesson = new Set<string>()
        for (const row of (progressRes.data || []) as Array<{ user_id: string; status: string }>) {
          if (!row.user_id) continue
          hasAnyProgress.add(row.user_id)
          if (row.status === 'completed') hasCompletedLesson.add(row.user_id)
        }

        const { getUserLocalTime } = await import('@/lib/notifications/timezone')

        for (const user of users) {
          if (!user.email) continue

          const userPref = prefMap.get(user.id)
          const timezone = userPref?.timezone || user.timezone || 'UTC'
          const userLocalTime = getUserLocalTime(timezone, nowUtc)
          const targetHour = userPref?.preferredReminderHour ?? dailySched.hourUtc ?? 9

          // Local-hour delivery gate (bypassed with force=true) — keeps lifecycle mail
          // in the learner's morning window and makes the hourly cron send once/day.
          if (!isForced && userLocalTime.localHour !== targetHour) {
            skippedTimezone++
            continue
          }

          const snapshot: LifecycleUserSnapshot = {
            createdAt: user.created_at,
            currentStreak: user.current_streak ?? 0,
            longestStreak: user.longest_streak ?? 0,
            lastStreakDate: user.last_streak_date ?? null,
            hasAnyProgress: hasAnyProgress.has(user.id),
            hasCompletedLesson: hasCompletedLesson.has(user.id),
            localDate: userLocalTime.localDate,
          }

          const sequenceKey = resolveLifecycleSequence(snapshot, nowUtc)
          if (!sequenceKey) {
            skippedNoSegment++
            continue
          }

          // Step 8 — deterministic 30% holdout per sequence. Held-out users remain
          // eligible for all other product behaviour; only this sequence is withheld.
          // Recorded as an auditable notification_events row so the treatment/holdout
          // split is queryable for D14 measurement.
          if (isLifecycleHoldout(user.id, sequenceKey)) {
            heldOut++
            await recordHoldoutEvent(supabase, user.id, sequenceKey)
            continue
          }

          const idempotencyKey = `${sequenceKey}-${user.id}-${userLocalTime.localDate}`
          const result = await enqueueNotificationItem({
            userId: user.id,
            toEmail: user.email,
            toName: user.name || user.email.split('@')[0],
            channel: 'email',
            templateKey: sequenceKey,
            templateVariables: {
              userName: user.name || user.email.split('@')[0],
            },
            eventId: idempotencyKey,
            idempotencyKey,
            eventType: sequenceKey,
            category: 'learning',
            priorityLevel: 'medium',
            preloadedPreferences: userPref,
          })
          if (result.success) {
            lifecycleQueued++
            queuedBySequence[sequenceKey]++
          }
        }

        lastSeenId = users[users.length - 1].id
        if (users.length < BATCH_SIZE) break
      }
    } catch (err) {
      console.error('[cron/lifecycle] Failed to process lifecycle sequences:', err)
      const { logSystemError } = await import('@/lib/monitoring/logger')
      void logSystemError({
        severity: 'error',
        category: 'cron',
        operation: 'cron_lifecycle_exception',
        message: `Unhandled exception in /api/cron/lifecycle: ${err instanceof Error ? err.message : String(err)}`,
      })
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      lifecycleQueued,
      queuedBySequence,
      heldOut,
      skippedTimezone,
      skippedNoSegment,
    })
  }
)

export const GET = POST

/**
 * Records a holdout assignment as an auditable `notification_events` row so the
 * treatment/holdout split can be measured server-side without a separate platform.
 * Non-fatal: a logging failure never blocks the run.
 */
async function recordHoldoutEvent(
  supabase: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  sequenceKey: LifecycleSequenceKey
): Promise<void> {
  try {
    await supabase.from('notification_events').insert({
      event_type: sequenceKey,
      user_id: userId,
      payload: { sequence: sequenceKey } as unknown as import('@/lib/supabase').Json,
      channels_notified: [],
      skipped_reason: `lifecycle_holdout:${sequenceKey}`,
      created_at: new Date().toISOString(),
    })
  } catch {
    // Non-fatal audit helper
  }
}
