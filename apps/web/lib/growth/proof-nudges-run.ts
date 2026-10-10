import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/supabase'
import type { UserNotificationPreferences } from '@/lib/notifications/preferences/types'
import { EmailAutomationsService } from '@/lib/notifications/automations/service'
import { enqueueNotificationItem } from '@/lib/notifications/queue/processor'
import { createInAppNotification } from '@/lib/notifications/in-app/service'
import { isLifecycleHoldout } from '@/lib/notifications/lifecycle/holdout'
import { BRAND } from '@/lib/brand'
import { PORTFOLIO_SETTINGS_HREF } from '@/lib/portfolio'
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
): Promise<void> {
  await supabase.from('notification_events').insert({
    event_type: eventType,
    user_id: userId,
    payload: { idempotencyKey } as unknown as Json,
    channels_notified: skippedReason ? [] : ['in_app', 'email'],
    skipped_reason: skippedReason,
    // The run's clock, so the seven-day reminder is measured against the same time base.
    created_at: now.toISOString(),
  })
}

export async function runProofNudgesForPage(
  supabase: Client,
  candidates: NudgeCandidate[],
  opts: { now: Date; dryRun?: boolean },
): Promise<NudgePageResult> {
  const result: NudgePageResult = { sent: { 'nudge.portfolio_ready': 0, 'nudge.fellow_eligible': 0 }, heldOut: 0, skipped: false }
  if (candidates.length === 0) return result

  const enabled = new Map<ProofNudgeKey, boolean>()
  for (const key of PROOF_NUDGE_KEYS) enabled.set(key, await EmailAutomationsService.isAutomationEnabled(key))
  if (![...enabled.values()].some(Boolean)) return result

  const ids = candidates.map((c) => c.id)
  const [states, history] = await Promise.all([loadProofStates(supabase, ids), loadHistory(supabase, ids)])
  if (!states || !history) return { ...result, skipped: true }

  const origin = (process.env.NEXT_PUBLIC_SITE_URL || BRAND.siteUrl).replace(/\/$/, '')

  for (const candidate of candidates) {
    const state = states.get(candidate.id)
    if (!state) continue

    for (const key of applicableNudges(state)) {
      if (!enabled.get(key)) continue
      const past = history.get(`${candidate.id}:${key}`) ?? EMPTY_NUDGE_HISTORY
      const round = nudgeRoundDue(past, opts.now)
      if (!round) continue

      const idempotencyKey = nudgeIdempotencyKey(key, candidate.id, round)

      // The holdout is decided once, at the first round, and recorded so it is never re-rolled.
      if (round === 'initial' && isLifecycleHoldout(candidate.id, key)) {
        result.heldOut++
        if (!opts.dryRun) await record(supabase, candidate.id, nudgeEventType(key, 'initial'), idempotencyKey, 'nudge_holdout', opts.now)
        break
      }

      result.sent[key]++
      if (!opts.dryRun) {
        const copy = COPY[key]
        const userName = candidate.name || candidate.email.split('@')[0]
        await createInAppNotification({
          userId: candidate.id,
          idempotencyKey,
          category: 'portfolio',
          title: copy.title,
          body: round === 'reminder' ? `A quick reminder: ${copy.body}` : copy.body,
          actionUrl: PORTFOLIO_SETTINGS_HREF,
          priority: 'low',
          preloadedPreferences: candidate.preferences,
        })
        await enqueueNotificationItem({
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
        await record(supabase, candidate.id, nudgeEventType(key, round), idempotencyKey, null, opts.now)
      }
      // One nudge per learner per run.
      break
    }
  }

  return result
}
