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
import { fetchAllRows } from '@/lib/growth/fetch-all-rows'
import { selectProofNextStep } from '@/lib/growth/proof-state'
import { BRAND } from '@/lib/brand'

/** Keyset pagination batch size for lifecycle processing (mirrors T3 crons). */
const BATCH_SIZE = 100
/** Safety bound on total pages processed per run. */
const MAX_PAGES = 50
/** Maximum execution duration per run to respect serverless deadlines (50s). */
const MAX_EXECUTION_MS = 50_000

/** Who started the run; it names the run in error logs so a preview failure is not read as the cron. */
export type LifecycleRunSource = 'cron' | 'admin_preview'

export interface LifecycleRunOptions {
  /** Who started the run: the hourly cron route or the admin dry-run preview. */
  source: LifecycleRunSource
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
  /**
   * Pages of learners skipped entirely (no lifecycle email, no holdout, no nudge) because their
   * progress or preferences could not be read. Also counted in `proofNudges.pagesSkipped`, which
   * additionally counts pages where only the nudges could not be evaluated.
   */
  pagesSkipped: number
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
    pagesSkipped: 0,
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
export async function runLifecycle({ source, dryRun, force, now }: LifecycleRunOptions): Promise<LifecycleRunResult> {
  // The cron keeps its historical operation names and message prefix, so existing alerts match.
  const logOperation = (suffix: string) => (source === 'cron' ? `cron_lifecycle_${suffix}` : `admin_lifecycle_preview_${suffix}`)
  const logOrigin = source === 'cron' ? '/api/cron/lifecycle' : '/api/admin/automations/lifecycle-preview (dry run)'
  const logPrefix = source === 'cron' ? '[cron/lifecycle]' : '[admin/lifecycle-preview]'

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
  // The proof-nudge automation toggles, read on first use and shared by every page of this run.
  const nudgeToggles = new Map<ProofNudgeKey, boolean>()

  const startTime = Date.now()

  try {
    let lastSeenId: string | null = null

    for (let page = 0; page < MAX_PAGES; page++) {
      if (Date.now() - startTime > MAX_EXECUTION_MS) {
        console.warn(`${logPrefix} Reached execution deadline, stopping pagination`)
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
          operation: logOperation('query'),
          message: `Database query failure in ${logOrigin}: ${queryErr.message}`,
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
      // completed lesson). Two lightweight queries per page — no N+1. The progress read is
      // paged in a stable order (fetchAllRows): a page of learners can own more rows than one
      // response holds (1000), and a cut-off read would make the late ones look never started.
      const [prefRead, progressRes] = await Promise.all([
        // Strict: a failed read must not stand in as "everyone opted in" (see the skip below).
        getBatchUserNotificationPreferences(supabase, userIds, { strict: true }).then(
          (map) => ({ map, error: null }),
          (error: unknown) => ({ map: null, error }),
        ),
        fetchAllRows<{ user_id: string; status: string }>((lo, hi) =>
          supabase
            .from('user_lesson_progress')
            .select('user_id, status')
            .in('user_id', userIds)
            .order('user_id')
            .order('lesson_id')
            .range(lo, hi)
        ),
      ])

      // Without the progress rows everyone here would look never started and get the D+1
      // email, so a failed read skips the page (lifecycle and nudges) until the next run.
      if (progressRes.error) {
        result.pagesSkipped++
        result.proofNudges.pagesSkipped++
        const { logSystemError } = await import('@/lib/monitoring/logger')
        const reason = (progressRes.error as { message?: string }).message ?? String(progressRes.error)
        void logSystemError({
          severity: 'error',
          category: 'cron',
          operation: logOperation('progress_query'),
          message: `Learning progress read failed in ${logOrigin}; page skipped: ${reason}`,
        })
        lastSeenId = users[users.length - 1].id
        if (users.length < BATCH_SIZE) break
        continue
      }

      // Same for the preferences: with defaults standing in, a learner who opted out would be
      // emailed and nudged, so a failed read also skips the page until the next run.
      if (!prefRead.map) {
        result.pagesSkipped++
        result.proofNudges.pagesSkipped++
        const { logSystemError } = await import('@/lib/monitoring/logger')
        const reason = prefRead.error instanceof Error ? prefRead.error.message : String(prefRead.error)
        void logSystemError({
          severity: 'error',
          category: 'cron',
          operation: logOperation('preferences_query'),
          message: `Notification preferences read failed in ${logOrigin}; page skipped: ${reason}`,
        })
        lastSeenId = users[users.length - 1].id
        if (users.length < BATCH_SIZE) break
        continue
      }
      const prefMap = prefRead.map

      const hasAnyProgress = new Set<string>()
      const hasCompletedLesson = new Set<string>()
      for (const row of progressRes.data) {
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
        const nudges = await runProofNudgesForPage(supabase, nudgeCandidates, { now: nowUtc, dryRun, enabled: nudgeToggles })
        result.proofNudges.sent['nudge.portfolio_ready'] += nudges.sent['nudge.portfolio_ready']
        result.proofNudges.sent['nudge.fellow_eligible'] += nudges.sent['nudge.fellow_eligible']
        result.proofNudges.heldOut += nudges.heldOut
        if (nudges.skipped) result.proofNudges.pagesSkipped++
        if (nudges.failed > 0) {
          const { logSystemError } = await import('@/lib/monitoring/logger')
          void logSystemError({
            severity: 'error',
            category: 'cron',
            operation: logOperation('proof_nudges'),
            message: `Proof nudges failed for ${nudges.failed} learner(s) in ${logOrigin}; they are retried on the next run`,
          })
        }
      } catch (nudgeErr) {
        result.proofNudges.pagesSkipped++
        console.error(`${logPrefix} Proof nudges failed for a page:`, nudgeErr)
      }

      lastSeenId = users[users.length - 1].id
      if (users.length < BATCH_SIZE) break
    }
  } catch (err) {
    console.error(`${logPrefix} Failed to process lifecycle sequences:`, err)
    const { logSystemError } = await import('@/lib/monitoring/logger')
    void logSystemError({
      severity: 'error',
      category: 'cron',
      operation: logOperation('exception'),
      message: `Unhandled exception in ${logOrigin}: ${err instanceof Error ? err.message : String(err)}`,
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
