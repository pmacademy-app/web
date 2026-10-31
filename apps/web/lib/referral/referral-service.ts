/**
 * Prodily — Phase 7 Referral & Attribution Service
 *
 * Manages privacy-conscious referral attribution, self-referral prevention,
 * rate limiting, and reward automation upon first lesson completion.
 *
 * References: PRD.md §4.10, Architecture.md §5, Master Plan Phase 7
 */

import { normalizeReferralRewardXp, REFERRAL_REWARD_XP } from '@/lib/referral/reward'
import { SettingsService } from '@/lib/admin/settings-service'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { awardXp, hasXpEvent } from '@/lib/xp-service'
import { createInAppNotification } from '@/lib/notifications/in-app/service'
import { BRAND } from '@/lib/brand'
import { trackProductEvent } from '@/lib/events/product-events'

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown; count?: number | null }>
}

export interface ReferrerInfo {
  id: string
  username: string | null
  name: string | null
}

export interface ReferralRecordResult {
  created: boolean
  referralId?: string
  referrerId?: string
  reason?: string
}

export interface ReferralActivationResult {
  rewarded: boolean
  referrerId?: string
  xpAwarded?: number
  reason?: string
}

export interface ReferredUserSummary {
  id: string
  displayName: string
  joinedAt: string
  status: 'signed_up' | 'activated' | 'rewarded'
  rewardedAt: string | null
}

export interface UserReferralStats {
  referralCode: string
  referralLink: string
  totalInvited: number
  activatedCount: number
  totalXpEarned: number
  /** The reward currently paid per activated referral. */
  rewardXp: number
  referrals: ReferredUserSummary[]
}

const MAX_REFERRALS_PER_24H = 10
/** The default reward; the live value comes from resolveReferralRewardXp(). */
export const REFERRAL_ACTIVATION_XP = REFERRAL_REWARD_XP

/**
 * The reward an admin configured (Settings → Learning), validated, or the default. Without
 * `strict` it never throws: SettingsService falls back to defaults when the settings row cannot be
 * read, and anything else resolves to the default reward.
 *
 * `strict` is for the award itself: a failed settings read throws (SettingsReadError) instead of
 * resolving to the default, so the caller can pay later rather than pay a guessed amount.
 */
export async function resolveReferralRewardXp({ strict = false }: { strict?: boolean } = {}): Promise<number> {
  if (strict) {
    const settings = await SettingsService.getLearningSettings({ strict: true })
    return normalizeReferralRewardXp(settings.xpReferralReward)
  }
  try {
    const settings = await SettingsService.getLearningSettings()
    return normalizeReferralRewardXp(settings.xpReferralReward)
  } catch {
    return REFERRAL_REWARD_XP
  }
}

/**
 * Resolves a referral code or handle to a valid referrer user.
 * Accepts username (case-insensitive) or UUID.
 */
export async function resolveReferralCode(
  supabase: SupabaseClient<Database>,
  codeOrHandle: string
): Promise<ReferrerInfo | null> {
  if (!codeOrHandle || typeof codeOrHandle !== 'string') return null
  const cleanCode = codeOrHandle.trim().replace(/^@/, '')
  if (!cleanCode) return null

  // 1. Try match by username (case-insensitive)
  const { data: userByUsername } = (await (supabase
    .from('users') as unknown as DBChain)
    .select('id, username, name')
    .ilike('username', cleanCode)
    .maybeSingle()) as unknown as { data: { id: string; username: string | null; name: string | null } | null }

  if (userByUsername) {
    return userByUsername
  }

  // 2. If it's a valid UUID, try match by user id
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanCode)
  if (isUuid) {
    const { data: userById } = (await (supabase
      .from('users') as unknown as DBChain)
      .select('id, username, name')
      .eq('id', cleanCode)
      .maybeSingle()) as unknown as { data: { id: string; username: string | null; name: string | null } | null }

    if (userById) {
      return userById
    }
  }

  return null
}

/**
 * Creates a referral attribution record for a newly registered user.
 * Enforces self-referral prevention, 1-to-1 attribution uniqueness, and 24h rate limit.
 */
export async function createReferralAttribution(
  supabase: SupabaseClient<Database>,
  params: {
    referrerCodeOrId: string | null
    newUserId: string
  }
): Promise<ReferralRecordResult> {
  if (!params.referrerCodeOrId) {
    return { created: false, reason: 'no_referrer_code' }
  }

  const referrer = await resolveReferralCode(supabase, params.referrerCodeOrId)
  if (!referrer) {
    return { created: false, reason: 'referrer_not_found' }
  }

  // 1. Self-referral prevention
  if (referrer.id === params.newUserId) {
    return { created: false, reason: 'self_referral_prevented' }
  }

  // 2. 1-to-1 Attribution check: Ensure new user is not already attributed
  const { data: existing } = (await (supabase
    .from('referrals') as unknown as DBChain)
    .select('id')
    .eq('referred_user_id', params.newUserId)
    .maybeSingle()) as unknown as { data: { id: string } | null }

  if (existing) {
    return { created: false, reason: 'already_attributed' }
  }

  // 3. Abuse prevention: Rate limit (Max 10 signups credited per 24 hours per referrer)
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: recentSignups } = (await (supabase
    .from('referrals') as unknown as DBChain)
    .select('id')
    .eq('referrer_id', referrer.id)
    .gte('created_at', dayAgo)) as unknown as { data: { id: string }[] | null }

  if (recentSignups && recentSignups.length >= MAX_REFERRALS_PER_24H) {
    return { created: false, reason: 'rate_limit_exceeded' }
  }

  // 4. Insert referral row
  const { data: inserted, error } = (await (supabase
    .from('referrals') as unknown as DBChain)
    .insert({
      referrer_id: referrer.id,
      referred_user_id: params.newUserId,
      status: 'signed_up',
    })
    .select('id')
    .single()) as unknown as { data: { id: string } | null; error: unknown }

  if (error || !inserted) {
    console.error('[referral-service] Failed to insert referral record:', error)
    return { created: false, reason: 'db_insert_failed' }
  }

  await trackProductEvent('referral_used', params.newUserId, {
    referrer_id: referrer.id,
    referral_id: inserted.id,
  })

  return {
    created: true,
    referralId: inserted.id,
    referrerId: referrer.id,
  }
}

/**
 * Shape a referral code must have before it is worth storing or resolving.
 *
 * Applied at the signup boundary so attacker-controlled input cannot be carried
 * through the auth flow as an arbitrary string. Codes are short alphanumeric slugs or
 * a user UUID; anything else is dropped rather than persisted into user metadata.
 */
const REFERRAL_CODE_PATTERN = /^[A-Za-z0-9_-]{3,64}$/

export function isPlausibleReferralCode(value: unknown): value is string {
  return typeof value === 'string' && REFERRAL_CODE_PATTERN.test(value.trim())
}

/**
 * Applies a referral code that was recorded at signup but deliberately NOT acted on
 * until the account reached a durable, verified state.
 *
 * Attribution used to run inline during signup, and because it needed a
 * `public.users` row it called `ensureUserProfile()` — which dispatches the welcome
 * email. Supplying any `refCode` therefore produced a welcome email for an entirely
 * unverified account, turning an attacker-controlled request field into an
 * email-sending trigger. The code now rides along in auth metadata and is redeemed
 * here, once verification has actually happened.
 *
 * Safe to call more than once: `createReferralAttribution` already enforces
 * one-attribution-per-user.
 */
export async function applyPendingReferral(
  supabase: SupabaseClient<Database>,
  user: { id: string; user_metadata?: Record<string, unknown> | null }
): Promise<ReferralRecordResult> {
  const pending = user.user_metadata?.pending_ref_code
  if (!isPlausibleReferralCode(pending)) {
    return { created: false, reason: 'no_referrer_code' }
  }

  return createReferralAttribution(supabase, {
    referrerCodeOrId: pending.trim(),
    newUserId: user.id,
  })
}

/**
 * Checks and activates the referral reward for a learner who has completed a lesson.
 *
 * Despite the name, the caller (recordQuizAttemptAction in lib/academy/lessons-db.ts) runs this on
 * every lesson completion, not only the first. That is the retry: a run that could not finish (see
 * the `reason` it returns) leaves the referral `signed_up`, and the next completion picks it up.
 * With no `signed_up` referral it returns after one read on the unique referred_user_id index.
 *
 * Idempotent across retries and concurrent runs: the XP is awarded once per referral (the ledger),
 * the status flips once (compare-and-set on `signed_up`), and the notification is sent only by the
 * run that flipped it, under a stable idempotency key.
 */
export async function onFirstLessonCompletedReferralCheck(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<ReferralActivationResult> {
  // 1. Fetch pending referral record for this learner
  const { data: referral } = (await (supabase
    .from('referrals') as unknown as DBChain)
    .select('id, referrer_id, status')
    .eq('referred_user_id', userId)
    .eq('status', 'signed_up')
    .maybeSingle()) as unknown as { data: { id: string; referrer_id: string; status: string } | null }

  if (!referral) {
    return { rewarded: false, reason: 'no_pending_referral' }
  }

  // 2. Resolve the reward first. A failed settings read leaves the referral `signed_up` (retried
  // when the learner completes their next lesson) rather than paying the default in place of the
  // configured amount.
  let rewardXp: number
  try {
    rewardXp = await resolveReferralRewardXp({ strict: true })
  } catch (settingsErr) {
    console.error('[referral-service] Referral reward setting unavailable; referral left pending:', settingsErr)
    return { rewarded: false, reason: 'reward_unavailable' }
  }

  // 3. Award the XP before the status changes, so a referral is never `rewarded` without it. The
  // ledger is what makes the payment exactly-once: one `referral` event per (referrer, referral
  // id), by the hasXpEvent check and, under two concurrent activations, by the unique index
  // (awardXp treats the losing insert as already awarded). A failure here leaves `signed_up`.
  try {
    const alreadyAwarded = await hasXpEvent(
      supabase,
      referral.referrer_id,
      'referral',
      referral.id
    )
    if (!alreadyAwarded) {
      await awardXp(
        supabase,
        referral.referrer_id,
        'referral',
        rewardXp,
        referral.id
      )
    }
  } catch (xpErr) {
    console.error('[referral-service] Error awarding referral XP to referrer; referral left pending:', xpErr)
    return { rewarded: false, reason: 'xp_award_failed' }
  }

  const now = new Date().toISOString()

  // 4. Mark referral status as rewarded / activated atomically
  const { data: updatedRows, error: updateError } = (await (supabase
    .from('referrals') as unknown as DBChain)
    .update({
      status: 'rewarded',
      rewarded_at: now,
    })
    .eq('id', referral.id)
    .eq('status', 'signed_up')
    .select('id')) as unknown as { data: { id: string }[] | null; error: unknown }

  if (updateError) {
    // The XP is paid but the referral still reads `signed_up` and nobody was notified. The next
    // lesson's check finds the XP event, skips the award and completes the status and notification.
    console.error('[referral-service] Failed to update referral status:', updateError)
    return { rewarded: false, reason: 'update_failed' }
  }

  // If another concurrent request already updated this referral row
  if (Array.isArray(updatedRows) && updatedRows.length === 0) {
    return { rewarded: false, reason: 'already_activated' }
  }

  // 5. Send in-app notification to referrer
  try {
    // Look up referred user handle/name for contextual message
    const { data: referredUser } = (await (supabase
      .from('users') as unknown as DBChain)
      .select('username, name')
      .eq('id', userId)
      .maybeSingle()) as unknown as { data: { username: string | null; name: string | null } | null }

    const learnerName = referredUser?.username ? `@${referredUser.username}` : referredUser?.name || 'A friend you invited'

    await createInAppNotification({
      userId: referral.referrer_id,
      category: 'achievement',
      title: 'Referral Reward Earned! 🎁',
      body: `${learnerName} completed their first lesson! You received +${rewardXp} XP for introducing them to ${BRAND.product}.`,
      actionUrl: '/settings?tab=referrals',
      priority: 'high',
      idempotencyKey: `referral-reward-${referral.id}`,
    })
  } catch (notifErr) {
    console.error('[referral-service] Failed to dispatch referral notification:', notifErr)
  }

  return {
    rewarded: true,
    referrerId: referral.referrer_id,
    xpAwarded: rewardXp,
  }
}

/**
 * Retrieves the referral summary, unique link, and invited learner history for a user.
 */
export async function getUserReferralStats(
  supabase: SupabaseClient<Database>,
  userId: string,
  siteOrigin?: string
): Promise<UserReferralStats> {
  const origin = siteOrigin || process.env.NEXT_PUBLIC_SITE_URL || BRAND.siteUrl

  // 1. Fetch user handle/info
  const { data: user } = (await (supabase
    .from('users') as unknown as DBChain)
    .select('id, username, name')
    .eq('id', userId)
    .maybeSingle()) as unknown as { data: { id: string; username: string | null; name: string | null } | null }

  const referralCode = user?.username || user?.id || userId
  const referralLink = `${origin}/signup?ref=${encodeURIComponent(referralCode)}`

  // 2. Fetch all referrals sent by this user
  const { data: referralRows } = (await (supabase
    .from('referrals') as unknown as DBChain)
    .select('id, referred_user_id, status, rewarded_at, created_at')
    .eq('referrer_id', userId)
    .order('created_at', { ascending: false })) as unknown as {
      data: {
        id: string
        referred_user_id: string
        status: 'signed_up' | 'activated' | 'rewarded'
        rewarded_at: string | null
        created_at: string
      }[] | null
    }

  const referrals = referralRows || []
  const referredUserIds = referrals.map((r) => r.referred_user_id)

  // 3. Batch lookup referred users public handles
  const userMap = new Map<string, { name: string | null; username: string | null }>()
  if (referredUserIds.length > 0) {
    const { data: users } = (await (supabase
      .from('users') as unknown as DBChain)
      .select('id, name, username')
      .in('id', referredUserIds)) as unknown as { data: { id: string; name: string | null; username: string | null }[] | null }

    if (users) {
      for (const u of users) {
        userMap.set(u.id, { name: u.name, username: u.username })
      }
    }
  }

  const formattedReferrals: ReferredUserSummary[] = referrals.map((r) => {
    const info = userMap.get(r.referred_user_id)
    const displayName = info?.username ? `@${info.username}` : info?.name ? `${info.name.slice(0, 10)}...` : 'Learner'
    return {
      id: r.id,
      displayName,
      joinedAt: r.created_at,
      status: r.status,
      rewardedAt: r.rewarded_at,
    }
  })

  // What was actually awarded, so a changed reward never rewrites past earnings.
  const [{ data: referralXpRows, error: referralXpError }, rewardXp] = await Promise.all([
    (supabase.from('xp_events') as unknown as DBChain)
      .select('xp_amount')
      .eq('user_id', userId)
      .eq('source_type', 'referral') as unknown as Promise<{ data: { xp_amount: number }[] | null; error: unknown }>,
    resolveReferralRewardXp(),
  ])

  const activatedCount = formattedReferrals.filter(
    (r) => r.status === 'rewarded' || r.status === 'activated'
  ).length

  // A failed read must not show "0 XP earned": estimate from the current reward instead.
  if (referralXpError) {
    console.warn('[referral-service] referral XP read failed; estimating from the current reward')
  }
  const totalXpEarned = referralXpError
    ? activatedCount * rewardXp
    : (referralXpRows ?? []).reduce((sum, row) => sum + (row.xp_amount || 0), 0)

  return {
    referralCode,
    referralLink,
    totalInvited: formattedReferrals.length,
    activatedCount,
    totalXpEarned,
    rewardXp,
    referrals: formattedReferrals,
  }
}
