/**
 * Badge Database Service (Phase 3 Sprint 4)
 *
 * Handles server-side queries for user badges, progress calculations,
 * and idempotent badge evaluation and awarding.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import { BADGE_DEFINITIONS, type BadgeDefinition } from '@/config/badges'
import {
  calculateBadgeProgress,
  evaluateEligibleBadges,
  type BadgeProgressItem,
  type UserStatsForBadges,
} from '@/lib/badges'
import { globalNotificationDispatcher } from '@/lib/notifications/dispatcher'
import { initializeNotificationConnectors } from '@/lib/notifications/events/connectors'

type UserRow = Database['public']['Tables']['users']['Row']
type BadgeRow = Database['public']['Tables']['badges']['Row']
type UserBadgeRow = Database['public']['Tables']['user_badges']['Row']

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

export interface UserBadgesSummaryPayload {
  totalEarned: number
  totalAvailable: number
  completionPercentage: number
  allBadges: BadgeProgressItem[]
  recentBadge: BadgeProgressItem | null
}

export interface BadgeStatsPreloadedData {
  /** Already-fetched `user_lesson_progress` rows for this user — skips the internal query when provided. */
  progressRows?: { lesson_id: string; status: string; quiz_score: number | null; quiz_attempts: number }[]
  /** Already-fetched `capstone_submissions` rows (any status) for this user — filtered internally to submitted/reviewed. */
  capstoneRows?: { status: string }[]
}

/**
 * Aggregates user progress statistics from database for badge criteria evaluation.
 *
 * Accepts optional `preloaded` progress/capstone rows so callers that already
 * fetched the same data for other sections (e.g. the Progress page) can avoid
 * duplicate queries. When omitted, behavior is identical to before.
 */
async function fetchUserStatsForBadges(
  supabase: SupabaseClient<Database>,
  userId: string,
  preloaded?: BadgeStatsPreloadedData
): Promise<UserStatsForBadges> {
  // 1. Fetch user record
  const { data: user } = (await (supabase
    .from('users') as unknown as DBChain)
    .select('*')
    .eq('id', userId)
    .single()) as unknown as { data: UserRow | null }

  // 2. Completed lesson progress
  let progressRows = preloaded?.progressRows
  if (!progressRows) {
    const { data } = (await (supabase
      .from('user_lesson_progress') as unknown as DBChain)
      .select('lesson_id, status, quiz_score, quiz_attempts')
      .eq('user_id', userId)) as unknown as {
      data: { lesson_id: string; status: string; quiz_score: number | null; quiz_attempts: number }[] | null
    }
    progressRows = data || []
  }

  const completedLessons = (progressRows || []).filter((p) => p.status === 'completed')
  const lessonsCompletedCount = completedLessons.length
  const modulesCompletedCount = Math.min(9, Math.floor(lessonsCompletedCount / 10))

  const perfectFirstAttemptQuizCount = completedLessons.filter(
    (p) => p.quiz_attempts === 1 && (p.quiz_score ?? 0) === 100
  ).length

  const perfectQuizCount = completedLessons.filter(
    (p) => (p.quiz_score ?? 0) === 100
  ).length

  // 3. Capstone submissions count (submitted/reviewed)
  let capstonesSubmittedCount: number
  if (preloaded?.capstoneRows) {
    capstonesSubmittedCount = preloaded.capstoneRows.filter((c) => c.status === 'submitted' || c.status === 'reviewed').length
  } else {
    const { data: capstones } = (await (supabase
      .from('capstone_submissions') as unknown as DBChain)
      .select('id')
      .eq('user_id', userId)
      .in('status', ['submitted', 'reviewed'])) as unknown as { data: { id: string }[] | null }
    capstonesSubmittedCount = capstones?.length ?? 0
  }

  return {
    lessonsCompletedCount,
    modulesCompletedCount,
    perfectFirstAttemptQuizCount,
    perfectQuizCount,
    totalXp: user?.total_xp || 0,
    level: user?.level || 1,
    currentStreak: user?.current_streak || 0,
    longestStreak: user?.longest_streak || 0,
    capstonesSubmittedCount,
    isPortfolioPublic: user?.is_portfolio_public ?? true,
    usedStreakFreeze: (user?.streak_freezes_available ?? 0) > 0,
    email: user?.email || '',
    name: user?.name || '',
  }
}

/**
 * Retrieves full badge gallery and progress for a user.
 */
export async function getUserBadgesData(
  supabase: SupabaseClient<Database>,
  userId: string,
  preloaded?: BadgeStatsPreloadedData
): Promise<UserBadgesSummaryPayload> {
  const stats = await fetchUserStatsForBadges(supabase, userId, preloaded)

  // Fetch all badges definitions from DB
  const { data: dbBadges } = (await (supabase
    .from('badges') as unknown as DBChain)
    .select('*')) as unknown as { data: BadgeRow[] | null }

  const badgeIdToKeyMap = new Map<string, string>()
  const keyToBadgeIdMap = new Map<string, string>()
  if (dbBadges) {
    for (const b of dbBadges) {
      badgeIdToKeyMap.set(b.id, b.key)
      keyToBadgeIdMap.set(b.key, b.id)
    }
  }

  // Fetch user earned badges
  const { data: userBadges } = (await (supabase
    .from('user_badges') as unknown as DBChain)
    .select('badge_id, earned_at')
    .eq('user_id', userId)
    .order('earned_at', { ascending: false })) as unknown as { data: UserBadgeRow[] | null }

  const earnedMap = new Map<string, string>() // key -> earned_at
  if (userBadges) {
    for (const ub of userBadges) {
      const key = badgeIdToKeyMap.get(ub.badge_id)
      if (key) {
        earnedMap.set(key, ub.earned_at)
      }
    }
  }

  // Build progress items for all configured badges
  const allBadges: BadgeProgressItem[] = BADGE_DEFINITIONS.map((def) => {
    const earnedAt = earnedMap.get(def.key) ?? null
    return calculateBadgeProgress(def, stats, Boolean(earnedAt), earnedAt)
  })

  const earnedItems = allBadges.filter((b) => b.isEarned)
  const totalEarned = earnedItems.length
  const totalAvailable = BADGE_DEFINITIONS.length
  const completionPercentage = Math.min(100, Math.round((totalEarned / totalAvailable) * 100))

  // Sort recent badge by earnedAt timestamp
  let recentBadge: BadgeProgressItem | null = null
  if (earnedItems.length > 0) {
    const sorted = [...earnedItems].sort((a, b) => {
      const dateA = a.earnedAt ? new Date(a.earnedAt).getTime() : 0
      const dateB = b.earnedAt ? new Date(b.earnedAt).getTime() : 0
      return dateB - dateA
    })
    recentBadge = sorted[0]
  }

  return {
    totalEarned,
    totalAvailable,
    completionPercentage,
    allBadges,
    recentBadge,
  }
}

/**
 * Evaluates user stats against criteria and awards new eligible badges idempotently.
 * Returns newly awarded badge definitions for toast notifications.
 */
export async function evaluateAndAwardBadges(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<BadgeDefinition[]> {
  const stats = await fetchUserStatsForBadges(supabase, userId)

  // Fetch db badges table map
  const { data: dbBadges } = (await (supabase
    .from('badges') as unknown as DBChain)
    .select('id, key')) as unknown as { data: { id: string; key: string }[] | null }

  const keyToIdMap = new Map<string, string>()
  const idToKeyMap = new Map<string, string>()
  if (dbBadges) {
    for (const b of dbBadges) {
      keyToIdMap.set(b.key, b.id)
      idToKeyMap.set(b.id, b.key)
    }
  }

  // Fetch user already earned badge IDs
  const { data: userBadges } = (await (supabase
    .from('user_badges') as unknown as DBChain)
    .select('badge_id')
    .eq('user_id', userId)) as unknown as { data: { badge_id: string }[] | null }

  const earnedKeys = new Set<string>()
  if (userBadges) {
    for (const ub of userBadges) {
      const key = idToKeyMap.get(ub.badge_id)
      if (key) earnedKeys.add(key)
    }
  }

  // Evaluate newly eligible badges
  const newlyEligible = evaluateEligibleBadges(stats, earnedKeys)
  if (newlyEligible.length === 0) {
    return []
  }

  const newlyAwarded: BadgeDefinition[] = []

  for (const badgeDef of newlyEligible) {
    const badgeId = keyToIdMap.get(badgeDef.key)
    if (!badgeId) continue

    const { error: insertErr } = await (supabase
      .from('user_badges') as unknown as DBChain)
      .insert({
        user_id: userId,
        badge_id: badgeId,
        earned_at: new Date().toISOString(),
      })

    if (!insertErr) {
      newlyAwarded.push(badgeDef)
      try {
        initializeNotificationConnectors()
        await globalNotificationDispatcher.dispatch({
          id: `badge-${userId}-${badgeDef.key}`,
          event: 'badge.earned',
          userId,
          userEmail: stats.email || '',
          userName: stats.name || 'Learner',
          userTimezone: 'UTC',
          priority: 'high',
          category: 'achievements',
          occurredAt: new Date().toISOString(),
          payload: {
            userId,
            badgeId: badgeDef.key,
            badgeName: badgeDef.name,
            badgeDescription: badgeDef.description,
          },
        })
      } catch (dispatchErr) {
        console.warn('[badges-db] Non-fatal notification dispatch warning:', dispatchErr)
      }
    }
  }

  return newlyAwarded
}
