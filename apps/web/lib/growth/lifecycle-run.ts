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
import { runProofNudgesForPage, type NudgeCandidate } from '@/lib/growth/proof-nudges-run'
import type { ProofNudgeKey } from '@/lib/growth/proof-nudges'
import { loadProofStates } from '@/lib/growth/proof-state-db'
import { selectProofNextStep } from '@/lib/growth/proof-state'
import { BRAND } from '@/lib/brand'

/** Keyset pagination batch size for lifecycle processing (mirrors T3 crons). */
const BATCH_SIZE = 100
/** Safety bound on total pages processed per run. */
const MAX_PAGES = 50
/** Maximum execution duration per run to respect serverless deadlines (50s). */
const MAX_EXECUTION_MS = 50_000

export interface LifecycleRunOptions {
  /** Count who would be emailed or nudged, and write nothing at all. */
  dryRun: boolean
  /** Bypass the per-user local-hour delivery gate. */
  force: boolean
  /** Clock for segment resolution, local-hour gating and nudges. Defaults to the current time. */
  now?: Date
}

export interface LifecycleRunResult {
  /** The global pause short-circuited the run; every count is zero. */
  paused: boolean
  dryRun: boolean
  lifecycleQueued: number
  queuedBySequence: Record<LifecycleSequenceKey, number>
  heldOut: number
  skippedTimezone: number
  skippedNoSegment: number
  proofNudges: {
    sent: Record<ProofNudgeKey, number>
    heldOut: number
    pagesSkipped: number
  }
}

function emptyResult(dryRun: boolean, paused: boolean): LifecycleRunResult {
  return {
    paused,
    dryRun,
    lifecycleQueued: 0,
    queuedBySequence: {
      'lifecycle.d1_never_started': 0,
      'lifecycle.d3_started_not_finished': 0,
      'lifecycle.streak_broken': 0,
    },
    heldOut: 0,
    skippedTimezone: 0,
    skippedNoSegment: 0,
    proofNudges: {
      sent: { 'nudge.portfolio_ready': 0, 'nudge.fellow_eligible': 0 },
      heldOut: 0,
      pagesSkipped: 0,
    },
  }
}

/**
 * Phase 1.5 — Lifecycle reactivation run (shared by the cron and the admin dry-run preview).
 *
 * Evaluates every user against the three lifecycle sequences (D+1 never-started,
 * D+3 started-not-finished, streak-broken → quiet), assigns each qualifying user to at
 * most one sequence, applies a deterministic 30% holdout, and enqueues the treatment
 * email through the standard notification pipeline (`enqueueNotificationItem`) so that
 * feature flags, per-template automation toggles, the global pause, suppression /
 * unsubscribe, preference resolution, daily quota, and idempotency all apply unchanged.
 * Learners who get no lifecycle email this run are then evaluated for a proof nudge.
 *
 * With `dryRun` nothing is written: no email, no in-app, no holdout record. Counts cover
 * learners in their delivery hour (add `force` to count everyone).
 *
 * Never throws for a data failure: a query error or exception stops the run, is logged,
 * and the counts gathered so far are returned.
 */
export async function runLifecycle({ dryRun, force, now }: LifecycleRunOptions): Promise<LifecycleRunResult> {
  // Global pause short-circuits the whole run (per-template toggles are still enforced
  // by enqueueNotificationItem for finer control). Digest schedule reuse: lifecycle
  // sends land in the user's daily-reminder local window.
  const isGlobalPause = await EmailAutomationsService.isGlobalPauseActive()
  const schedules = await EmailAutomationsService.getDigestSchedules()
  const dailySched = schedules.dailyReminder

  if (isGlobalPause) return emptyResult(dryRun, true)

  const result = emptyResult(dryRun, false)
  const siteOrigin = (process.env.NEXT_PUBLIC_SITE_URL || BRAND.siteUrl).replace(/\/$/, '')
  const supabase = createServiceRoleClient()
  const nowUtc = now ?? new Date()

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
      // In their delivery hour and sent no lifecycle email this run: eligible for a proof nudge.
      const nudgeCandidates: NudgeCandidate[] = []
      const lifecycleDue: Array<{
        user: (typeof users)[number]
        sequenceKey: LifecycleSequenceKey
        userPref: ReturnType<typeof prefMap.get>
        localDate: string
        nudgeCandidate: NudgeCandidate
      }> = []

      for (const user of users) {
        if (!user.email) continue

        const userPref = prefMap.get(user.id)
        const timezone = userPref?.timezone || user.timezone || 'UTC'
        const userLocalTime = getUserLocalTime(timezone, nowUtc)
        const targetHour = userPref?.preferredReminderHour ?? dailySched.hourUtc ?? 9

        // Local-hour delivery gate (bypassed with force) — keeps lifecycle mail
        // in the learner's morning window and makes the hourly cron send once/day.
        if (!force && userLocalTime.localHour !== targetHour) {
          result.skippedTimezone++
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

        const nudgeCandidate: NudgeCandidate = { id: user.id, email: user.email, name: user.name, preferences: userPref }
        const sequenceKey = resolveLifecycleSequence(snapshot, nowUtc)
        if (!sequenceKey) {
          result.skippedNoSegment++
          nudgeCandidates.push(nudgeCandidate)
          continue
        }

        // Step 8 — deterministic 30% holdout per sequence. Held-out users remain
        // eligible for all other product behaviour; only this sequence is withheld.
        // Recorded as an auditable notification_events row so the treatment/holdout
        // split is queryable for D14 measurement.
        if (isLifecycleHoldout(user.id, sequenceKey)) {
          result.heldOut++
          if (!dryRun) await recordHoldoutEvent(supabase, user.id, sequenceKey)
          nudgeCandidates.push(nudgeCandidate)
          continue
        }

        lifecycleDue.push({ user, sequenceKey, userPref, localDate: userLocalTime.localDate, nudgeCandidate })
      }

      // Growth R5 B10: the comeback emails carry the learner's own next step. Proof state loads
      // once for this page's lifecycle sends; a failed read only drops the line.
      const proofStates =
        lifecycleDue.length > 0
          ? await loadProofStates(supabase, lifecycleDue.map((d) => d.user.id)).catch(() => null)
          : null

      for (const { user, sequenceKey, userPref, localDate, nudgeCandidate } of lifecycleDue) {
        if (dryRun) {
          // Counted as it would be sent; the learner is then not a nudge candidate either.
          result.lifecycleQueued++
          result.queuedBySequence[sequenceKey]++
          continue
        }
        const idempotencyKey = `${sequenceKey}-${user.id}-${localDate}`
        const proofState = proofStates?.get(user.id)
        const nextStep = proofState ? selectProofNextStep(proofState) : null
        const hasStep = nextStep !== null && nextStep.kind !== 'none'
        const enqueued = await enqueueNotificationItem({
          userId: user.id,
          toEmail: user.email,
          toName: user.name || user.email.split('@')[0],
          channel: 'email',
          templateKey: sequenceKey,
          templateVariables: {
            userName: user.name || user.email.split('@')[0],
            sequence: sequenceKey,
            proofStepText: hasStep ? nextStep.text : null,
            proofStepUrl: hasStep ? `${siteOrigin}${nextStep.path}` : null,
          },
          eventId: idempotencyKey,
          idempotencyKey,
          eventType: sequenceKey,
          category: 'learning',
          priorityLevel: 'medium',
          preloadedPreferences: userPref,
        })
        if (enqueued.success) {
          result.lifecycleQueued++
          result.queuedBySequence[sequenceKey]++
        } else if (!enqueued.duplicate) {
          // A genuine skip (preference, toggle, suppression): the learner may get a nudge instead.
          // A duplicate means today's lifecycle email already went out (an earlier run), so no
          // nudge on top of it.
          nudgeCandidates.push(nudgeCandidate)
        }
      }

      // Proof nudges for this page. A failure here never stops the lifecycle run.
      try {
        const nudges = await runProofNudgesForPage(supabase, nudgeCandidates, { now: nowUtc, dryRun })
        result.proofNudges.sent['nudge.portfolio_ready'] += nudges.sent['nudge.portfolio_ready']
        result.proofNudges.sent['nudge.fellow_eligible'] += nudges.sent['nudge.fellow_eligible']
        result.proofNudges.heldOut += nudges.heldOut
        if (nudges.skipped) result.proofNudges.pagesSkipped++
      } catch (nudgeErr) {
        result.proofNudges.pagesSkipped++
        console.error('[cron/lifecycle] Proof nudges failed for a page:', nudgeErr)
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

  return result
}

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
