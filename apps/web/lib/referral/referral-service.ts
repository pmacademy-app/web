/**
 * PM Academy — Phase 7 Referral & Attribution Service
 *
 * Manages privacy-conscious referral attribution, self-referral prevention,
 * rate limiting, and reward automation upon first lesson completion.
 *
 * References: PRD.md §4.10, Architecture.md §5, Master Plan Phase 7
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { awardXp, hasXpEvent } from '@/lib/xp-service'
import { XP_VALUES } from '@/lib/xp/xp'
import { createInAppNotification } from '@/lib/notifications/in-app/service'
import { BRAND } from '@/lib/brand'

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
  referrals: ReferredUserSummary[]
}

const MAX_REFERRALS_PER_24H = 10
export const REFERRAL_ACTIVATION_XP = XP_VALUES.REFERRAL_ACTIVATION

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

  return {
    created: true,
    referralId: inserted.id,
    referrerId: referrer.id,
  }
}

/**
 * Checks and activates referral rewards when a learner completes their first lesson.
 * Idempotent: rewards only once per referral attribution.
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

  const now = new Date().toISOString()

  // 2. Mark referral status as rewarded / activated
  const { error: updateError } = await (supabase
    .from('referrals') as unknown as DBChain)
    .update({
      status: 'rewarded',
      rewarded_at: now,
    })
    .eq('id', referral.id)

  if (updateError) {
    console.error('[referral-service] Failed to update referral status:', updateError)
    return { rewarded: false, reason: 'update_failed' }
  }

  // 3. Award referral XP to referrer (idempotent with hasXpEvent check)
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
        REFERRAL_ACTIVATION_XP,
        referral.id
      )
    }
  } catch (xpErr) {
    console.error('[referral-service] Error awarding referral XP to referrer:', xpErr)
  }

  // 4. Send in-app notification to referrer
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
      body: `${learnerName} completed their first lesson! You received +${REFERRAL_ACTIVATION_XP} XP for introducing them to ${BRAND.product}.`,
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
    xpAwarded: REFERRAL_ACTIVATION_XP,
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

  const activatedCount = formattedReferrals.filter(
    (r) => r.status === 'rewarded' || r.status === 'activated'
  ).length

  return {
    referralCode,
    referralLink,
    totalInvited: formattedReferrals.length,
    activatedCount,
    totalXpEarned: activatedCount * REFERRAL_ACTIVATION_XP,
    referrals: formattedReferrals,
  }
}
