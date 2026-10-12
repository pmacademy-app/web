import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/supabase'
import type { UserNotificationPreferences } from '@/lib/notifications/preferences/types'
import { EmailAutomationsService } from '@/lib/notifications/automations/service'
import { enqueueNotificationItem } from '@/lib/notifications/queue/processor'
import { createInAppNotification } from '@/lib/notifications/in-app/service'
import { isLifecycleHoldout } from '@/lib/notifications/lifecycle/holdout'
import { BRAND } from '@/lib/brand'
import { PORTFOLIO_SETTINGS_HREF } from '@/lib/portfolio'
import type { ProofState } from './proof-state'
import { loadProofStates } from './proof-state-db'
import {
  EMPTY_NUDGE_HISTORY,
  PROOF_NUDGE_KEYS,
  applicableNudges,
  nudgeEventType,
  nudgeIdempotencyKey,
  nudgeRoundDue,
  type NudgeHistory,
  type ProofNudgeKey,
} from './proof-nudges'

/**
 * Sends the proof nudges for one page of learners (Growth R5 / B6, B7). Called by the lifecycle
 * cron for the learners who are in their delivery hour and got no lifecycle email this run.
 *
 * - At most one nudge per learner per run (portfolio ready first).
 * - What was sent (or held out) is recorded in notification_events, which is what decides the
 *   reminder and stops repeats, whatever the learner's in-app or email preferences.
 * - An automation toggle off disables that nudge entirely (no in-app either).
 * - `dryRun` counts who would be nudged and writes nothing.
 */

export interface NudgeCandidate {
  id: string
  email: string
  name?: string | null
  preferences?: UserNotificationPreferences
}

export interface NudgePageResult {
  sent: Record<ProofNudgeKey, number>
  heldOut: number
  /** The page could not be evaluated (a read failed); nothing was sent for it. */
  skipped: boolean
  /**
   * Learners whose nudge threw part-way, including a record that could not be written; nothing is
   * recorded for them, so the next run retries (the in-app and email idempotency keys keep a
   * retry from delivering twice).
   */
  failed: number
}

type Client = SupabaseClient<Database>

const COPY: Record<ProofNudgeKey, { title: string; body: string; actionLabel: string }> = {
  'nudge.portfolio_ready': {
    title: 'Your portfolio is ready to share',
    body: 'Everything recruiters need is in place. Make your portfolio public so you can share it.',
    actionLabel: 'Publish portfolio',
  },
  'nudge.fellow_eligible': {
    title: 'You qualify for PM Fellow',
    body: 'Your portfolio meets the PM Fellow bar. Request it from your portfolio settings.',
    actionLabel: 'Request PM Fellow',
  },
}

async function loadHistory(supabase: Client, userIds: string[]): Promise<Map<string, NudgeHistory> | null> {
  const eventTypes = PROOF_NUDGE_KEYS.flatMap((key) => [nudgeEventType(key, 'initial'), nudgeEventType(key, 'reminder')])
  const { data, error } = await supabase
    .from('notification_events')
    .select('user_id, event_type, skipped_reason, created_at')
    .in('user_id', userIds)
    .in('event_type', eventTypes)
  if (error) return null

  const history = new Map<string, NudgeHistory>()
  for (const row of data ?? []) {
    for (const key of PROOF_NUDGE_KEYS) {
      const id = `${row.user_id}:${key}`
      const current = history.get(id) ?? { ...EMPTY_NUDGE_HISTORY }
      if (row.event_type === nudgeEventType(key, 'initial')) {
        if (row.skipped_reason === 'nudge_holdout') current.heldOut = true
        else current.sentAt = row.created_at
      } else if (row.event_type === nudgeEventType(key, 'reminder')) {
        current.remindedAt = row.created_at
      } else {
        continue
      }
      history.set(id, current)
    }
  }
  return history
}

async function record(
  supabase: Client,
  userId: string,
  eventType: string,
  idempotencyKey: string,
  skippedReason: string | null,
  now: Date,
  channels: Array<'in_app' | 'email'> = [],
): Promise<void> {
  const { error } = await supabase.from('notification_events').insert({
    event_type: eventType,
    user_id: userId,
    payload: { idempotencyKey } as unknown as Json,
    channels_notified: skippedReason ? [] : channels,
    skipped_reason: skippedReason,
    // The run's clock, so the seven-day reminder is measured against the same time base.
    created_at: now.toISOString(),
  })
  // supabase-js returns a failed insert instead of throwing it. Without the row the learner is
  // evaluated again next run, so the caller must count this as failed, not as sent or held out.
  if (error) throw new Error(`notification_events insert failed for ${eventType}: ${error.message}`)
}

export async function runProofNudgesForPage(
  supabase: Client,
  candidates: NudgeCandidate[],
  opts: {
    now: Date
    dryRun?: boolean
    /**
     * The automation toggles, shared by the caller across the pages of one run: filled here on
     * first use, so the toggle read (an uncached HTTP call) happens once per run, not per page.
     */
    enabled?: Map<ProofNudgeKey, boolean>
  },
): Promise<NudgePageResult> {
  const result: NudgePageResult = { sent: { 'nudge.portfolio_ready': 0, 'nudge.fellow_eligible': 0 }, heldOut: 0, skipped: false, failed: 0 }
  if (candidates.length === 0) return result

  const enabled = opts.enabled ?? new Map<ProofNudgeKey, boolean>()
  for (const key of PROOF_NUDGE_KEYS) {
    if (!enabled.has(key)) enabled.set(key, await EmailAutomationsService.isAutomationEnabled(key))
  }
  if (![...enabled.values()].some(Boolean)) return result

  const ids = candidates.map((c) => c.id)
  const [states, history] = await Promise.all([loadProofStates(supabase, ids), loadHistory(supabase, ids)])
  if (!states || !history) return { ...result, skipped: true }

  const origin = (process.env.NEXT_PUBLIC_SITE_URL || BRAND.siteUrl).replace(/\/$/, '')

  for (const candidate of candidates) {
    const state = states.get(candidate.id)
    if (!state) continue

    // One learner's failure must not drop the rest of the page.
    try {
      await nudgeCandidate(supabase, candidate, state, history, enabled, origin, opts, result)
    } catch (err) {
      result.failed++
      console.error(`[proof-nudges] Nudge failed for user ${candidate.id}:`, err)
    }
  }

  return result
}

async function nudgeCandidate(
  supabase: Client,
  candidate: NudgeCandidate,
  state: ProofState,
  history: Map<string, NudgeHistory>,
  enabled: Map<ProofNudgeKey, boolean>,
  origin: string,
  opts: { now: Date; dryRun?: boolean },
  result: NudgePageResult,
): Promise<void> {
  for (const key of applicableNudges(state)) {
    if (!enabled.get(key)) continue
    const past = history.get(`${candidate.id}:${key}`) ?? EMPTY_NUDGE_HISTORY
    const round = nudgeRoundDue(past, opts.now)
    if (!round) continue

    const idempotencyKey = nudgeIdempotencyKey(key, candidate.id, round)

    // The holdout is decided once, at the first round, and recorded so it is never re-rolled.
    if (round === 'initial' && isLifecycleHoldout(candidate.id, key)) {
      if (!opts.dryRun) await record(supabase, candidate.id, nudgeEventType(key, 'initial'), idempotencyKey, 'nudge_holdout', opts.now)
      result.heldOut++
      return
    }

    if (opts.dryRun) {
      result.sent[key]++
      return
    }

    const copy = COPY[key]
    const userName = candidate.name || candidate.email.split('@')[0]
    const inApp = await createInAppNotification({
      userId: candidate.id,
      idempotencyKey,
      category: 'portfolio',
      title: copy.title,
      body: round === 'reminder' ? `A quick reminder: ${copy.body}` : copy.body,
      actionUrl: PORTFOLIO_SETTINGS_HREF,
      priority: 'low',
      preloadedPreferences: candidate.preferences,
    })
    const email = await enqueueNotificationItem({
      userId: candidate.id,
      toEmail: candidate.email,
      toName: userName,
      channel: 'email',
      templateKey: key,
      templateVariables: {
        userName,
        nudge: key === 'nudge.portfolio_ready' ? 'portfolio_ready' : 'fellow_eligible',
        isReminder: round === 'reminder',
        ctaUrl: `${origin}${PORTFOLIO_SETTINGS_HREF}`,
      },
      eventId: idempotencyKey,
      idempotencyKey,
      eventType: key,
      category: 'portfolio',
      priorityLevel: 'low',
      preloadedPreferences: candidate.preferences,
    })
    // The channels that really went out. A duplicate email is one an earlier run queued before it
    // could write this row. The row itself is written whatever the channels: it marks the learner
    // as assigned to the nudge (the readout's treated arm, which must not depend on preferences)
    // and stops the daily re-evaluation.
    const channels: Array<'in_app' | 'email'> = []
    if (inApp?.success) channels.push('in_app')
    if (email?.success || email?.duplicate) channels.push('email')
    await record(supabase, candidate.id, nudgeEventType(key, round), idempotencyKey, null, opts.now, channels)
    if (channels.length > 0) result.sent[key]++
    // One nudge per learner per run.
    return
  }
}
