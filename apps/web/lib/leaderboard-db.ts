/**
 * Leaderboard Database Operations Service (Phase 3 Sprint 5)
 *
 * Handles server-side queries for weekly consistency leaderboards,
 * opt-in privacy toggles, friend management, and cohort memberships.
 *
 * Enforces strict privacy: users with `is_opted_in = false` are never exposed publicly.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import { calculateLevel } from '@/lib/xp'
import { calculateWeekStart, calculateRankings, type LeaderboardEntry, type RawLeaderboardUserMetric } from '@/lib/leaderboard'

type UserRow = Database['public']['Tables']['users']['Row']
type CohortRow = Database['public']['Tables']['cohorts']['Row']

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

export interface WeeklyLeaderboardPayload {
  weekStart: string
  isOptedIn: boolean
  entries: LeaderboardEntry[]
  personalEntry: LeaderboardEntry | null
}

export interface CohortItemPayload {
  id: string
  slug: string
  name: string
  description: string | null
  memberCount: number
  isMember: boolean
}

/**
 * Checks or initializes user leaderboard privacy settings.
 */
export async function getUserLeaderboardSettings(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<{ isOptedIn: boolean; allowFriendRequests: boolean }> {
  const { data: settings } = (await (supabase
    .from('user_leaderboard_settings') as unknown as DBChain)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()) as unknown as { data: { is_opted_in: boolean; allow_friend_requests: boolean } | null }

  if (!settings) {
    // Default to opted in
    return { isOptedIn: true, allowFriendRequests: true }
  }

  return {
    isOptedIn: settings.is_opted_in,
    allowFriendRequests: settings.allow_friend_requests,
  }
}

/**
 * Updates user leaderboard opt-in privacy toggle.
 */
export async function toggleLeaderboardOptIn(
  supabase: SupabaseClient<Database>,
  userId: string,
  isOptedIn: boolean
): Promise<{ success: boolean; isOptedIn: boolean }> {
  const now = new Date().toISOString()
  const { error } = await (supabase
    .from('user_leaderboard_settings') as unknown as DBChain)
    .upsert({
      user_id: userId,
      is_opted_in: isOptedIn,
      updated_at: now,
    })

  if (error) throw error
  return { success: true, isOptedIn }
}

// In-memory cache for weekly leaderboard calculations (45-second TTL)
interface LeaderboardCacheEntry {
  timestamp: number
  users: UserRow[]
  optedOutUserIds: Set<string>
  rawMetrics: RawLeaderboardUserMetric[]
}

const LEADERBOARD_CACHE = new Map<string, LeaderboardCacheEntry>()
const CACHE_TTL_MS = 45 * 1000

/**
 * Builds (or reuses the cached) raw weekly metrics for ALL opted-in-eligible users.
 * Shared by global, cohort-scoped, and friend-scoped ranking views so the expensive
 * aggregation queries run at most once per week per 45-second window, regardless of
 * how many scopes/cohorts are viewed.
 */
async function getOrBuildWeeklyRawMetrics(
  supabase: SupabaseClient<Database>,
  weekStart: string
): Promise<LeaderboardCacheEntry> {
  const now = Date.now()
  let cached = LEADERBOARD_CACHE.get(weekStart)
  if (!cached || now - cached.timestamp > CACHE_TTL_MS) {
    // 1. Fetch users with total_xp > 0
    const { data: users } = (await (supabase
      .from('users') as unknown as DBChain)
      .select('id, username, name, avatar_url, total_xp, current_streak, level')
      .gt('total_xp', 0)) as unknown as { data: UserRow[] | null }

    const userList = users || []
    const userIdsArray = userList.map((u) => u.id)

    // 2. Fetch opted-out users so we can exclude them
    const { data: optedOutRows } = (await (supabase
      .from('user_leaderboard_settings') as unknown as DBChain)
      .select('user_id')
      .eq('is_opted_in', false)) as unknown as { data: { user_id: string }[] | null }

    const optedOutUserIds = new Set<string>((optedOutRows || []).map((r) => r.user_id))

    // 3. Fetch lesson progress in current week for consistency metric
    const weekStartDate = new Date(weekStart)
    const { data: lessonProgress } = (await (supabase
      .from('user_lesson_progress') as unknown as DBChain)
      .select('user_id, status, completed_at')
      .in('user_id', userIdsArray.length ? userIdsArray : ['00000000-0000-0000-0000-000000000000'])
      .eq('status', 'completed')
      .gte('completed_at', weekStartDate.toISOString())) as unknown as {
      data: { user_id: string; status: string; completed_at: string }[] | null
    }

    // 4. Fetch xp events in current week
    const { data: xpEvents } = (await (supabase
      .from('xp_events') as unknown as DBChain)
      .select('user_id, amount, created_at')
      .in('user_id', userIdsArray.length ? userIdsArray : ['00000000-0000-0000-0000-000000000000'])
      .gte('created_at', weekStartDate.toISOString())) as unknown as {
      data: { user_id: string; amount: number; created_at: string }[] | null
    }

    // Aggregate user weekly metrics
    const rawMetrics: RawLeaderboardUserMetric[] = userList.map((u) => {
      const userLessons = (lessonProgress || []).filter((lp) => lp.user_id === u.id)
      const lessonsCompleted = userLessons.length

      // Calculate unique days studied in week
      const studyDays = new Set<string>()
      for (const lp of userLessons) {
        if (lp.completed_at) {
          studyDays.add(lp.completed_at.split('T')[0])
        }
      }
      const daysStudied = studyDays.size

      // Calculate weekly XP
      const userXpEvents = (xpEvents || []).filter((xe) => xe.user_id === u.id)
      const xpEarned = userXpEvents.reduce((acc, curr) => acc + (curr.amount || 0), 0)

      const levelInfo = calculateLevel(u.total_xp || 0)

      return {
        userId: u.id,
        username: u.username ?? null,
        name: u.name ?? null,
        avatarUrl: u.avatar_url ?? null,
        levelTitle: levelInfo.title,
        level: levelInfo.level,
        daysStudied,
        lessonsCompleted,
        xpEarned,
        currentStreak: u.current_streak || 0,
        totalXp: u.total_xp || 0,
      }
    })

    cached = {
      timestamp: now,
      users: userList,
      optedOutUserIds,
      rawMetrics,
    }
    LEADERBOARD_CACHE.set(weekStart, cached)
  }

  return cached
}

/**
 * Ensures a user is represented in a raw-metrics list even if they have 0 total_xp
 * (e.g. brand new users, or users in a cohort with no activity yet).
 */
async function ensureUserPresent(
  supabase: SupabaseClient<Database>,
  rawMetrics: RawLeaderboardUserMetric[],
  userId: string
): Promise<RawLeaderboardUserMetric[]> {
  if (rawMetrics.some((m) => m.userId === userId)) {
    return rawMetrics
  }

  const { data: currentUser } = (await (supabase
    .from('users') as unknown as DBChain)
    .select('id, username, name, avatar_url, total_xp, current_streak, level')
    .eq('id', userId)
    .maybeSingle()) as unknown as { data: UserRow | null }

  if (!currentUser) return rawMetrics

  const levelInfo = calculateLevel(currentUser.total_xp || 0)
  return [
    ...rawMetrics,
    {
      userId: currentUser.id,
      username: currentUser.username ?? null,
      name: currentUser.name ?? null,
      avatarUrl: currentUser.avatar_url ?? null,
      levelTitle: levelInfo.title,
      level: levelInfo.level,
      daysStudied: 0,
      lessonsCompleted: 0,
      xpEarned: 0,
      currentStreak: currentUser.current_streak || 0,
      totalXp: currentUser.total_xp || 0,
    },
  ]
}

/**
 * Fetches weekly consistency rankings for opted-in users (global scope).
 */
export async function getWeeklyLeaderboard(
  supabase: SupabaseClient<Database>,
  userId: string,
  targetWeekStart?: string
): Promise<WeeklyLeaderboardPayload> {
  const weekStart = targetWeekStart || calculateWeekStart()
  const { isOptedIn } = await getUserLeaderboardSettings(supabase, userId)
  const cached = await getOrBuildWeeklyRawMetrics(supabase, weekStart)

  const rawMetrics = await ensureUserPresent(supabase, cached.rawMetrics, userId)

  // Calculate final rankings
  const rankedEntries = calculateRankings(rawMetrics, userId)
  const publicEntries = rankedEntries.filter((e) => e.isCurrentUser || !cached.optedOutUserIds.has(e.userId))
  const personalEntry = rankedEntries.find((e) => e.isCurrentUser) ?? null

  return {
    weekStart,
    isOptedIn,
    entries: publicEntries,
    personalEntry,
  }
}

export interface CohortLeaderboardPayload extends WeeklyLeaderboardPayload {
  cohortId: string
  cohortName: string | null
  isMember: boolean
}

/**
 * Fetches weekly consistency rankings scoped to a single cohort's membership.
 * Reuses the same cached raw weekly metrics as the global leaderboard — cohort
 * scoping is a cheap in-memory filter + re-rank, not a separate aggregation query.
 */
export async function getCohortLeaderboard(
  supabase: SupabaseClient<Database>,
  userId: string,
  cohortId: string,
  targetWeekStart?: string
): Promise<CohortLeaderboardPayload> {
  const weekStart = targetWeekStart || calculateWeekStart()
  const { isOptedIn } = await getUserLeaderboardSettings(supabase, userId)

  const [cached, cohortResult, memberRows] = await Promise.all([
    getOrBuildWeeklyRawMetrics(supabase, weekStart),
    (supabase.from('cohorts') as unknown as DBChain)
      .select('id, name')
      .eq('id', cohortId)
      .maybeSingle() as unknown as Promise<{ data: { id: string; name: string } | null }>,
    (supabase.from('cohort_members') as unknown as DBChain)
      .select('user_id')
      .eq('cohort_id', cohortId) as unknown as Promise<{ data: { user_id: string }[] | null }>,
  ])

  const cohortName = cohortResult.data?.name ?? null
  const memberIds = new Set<string>((memberRows.data || []).map((m) => m.user_id))
  const isMember = memberIds.has(userId)

  let rawMetrics = cached.rawMetrics.filter((m) => memberIds.has(m.userId))
  if (isMember) {
    rawMetrics = await ensureUserPresent(supabase, rawMetrics, userId)
  }

  const rankedEntries = calculateRankings(rawMetrics, userId)
  const publicEntries = rankedEntries.filter((e) => e.isCurrentUser || !cached.optedOutUserIds.has(e.userId))
  const personalEntry = rankedEntries.find((e) => e.isCurrentUser) ?? null

  return {
    weekStart,
    isOptedIn,
    entries: publicEntries,
    personalEntry,
    cohortId,
    cohortName,
    isMember,
  }
}

/**
 * Fetches user friends list and friend rankings.
 */
export async function getFriendLeaderboard(
  supabase: SupabaseClient<Database>,
  userId: string,
  existingEntries?: LeaderboardEntry[]
): Promise<LeaderboardEntry[]> {
  const { data: friendsRows } = (await (supabase
    .from('user_friends') as unknown as DBChain)
    .select('user_id, friend_id')
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`)) as unknown as {
    data: { user_id: string; friend_id: string }[] | null
  }

  const friendIds = new Set<string>([userId])
  if (friendsRows) {
    for (const row of friendsRows) {
      if (row.user_id === userId) friendIds.add(row.friend_id)
      if (row.friend_id === userId) friendIds.add(row.user_id)
    }
  }

  const entries = existingEntries ?? (await getWeeklyLeaderboard(supabase, userId)).entries
  return entries.filter((e) => friendIds.has(e.userId))
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Adds a friend by username or user ID.
 *
 * Root-cause note: this previously used a single `.or('username.eq.X,id.eq.X')`
 * filter for both lookup modes. Since `id` is a UUID column, PostgREST/Postgres
 * fails the ENTIRE query with an "invalid input syntax for type uuid" error
 * whenever X is a plain username (the normal case, since the UI always sends a
 * username) — the resulting DB error was silently swallowed (only `data` was
 * destructured), surfacing as an incorrect "Learner not found" for every
 * attempt. Querying by the correct column for the identifier's actual shape
 * avoids ever sending an invalid UUID comparison to Postgres.
 */
export async function addFriend(
  supabase: SupabaseClient<Database>,
  userId: string,
  friendIdentifier: string
): Promise<{ success: boolean; message: string }> {
  const isUuid = UUID_PATTERN.test(friendIdentifier)
  const lookupColumn = isUuid ? 'id' : 'username'

  const { data: targetUser, error: lookupError } = (await (supabase
    .from('users') as unknown as DBChain)
    .select('id, username')
    .eq(lookupColumn, friendIdentifier)
    .maybeSingle()) as unknown as { data: { id: string; username: string } | null; error: unknown }

  if (lookupError) {
    throw new Error('Failed to look up learner. Please try again.')
  }

  if (!targetUser) {
    throw new Error(`Learner "${friendIdentifier}" not found.`)
  }

  if (targetUser.id === userId) {
    throw new Error('You cannot add yourself as a friend.')
  }

  const { error } = await (supabase
    .from('user_friends') as unknown as DBChain)
    .insert({
      user_id: userId,
      friend_id: targetUser.id,
      status: 'accepted',
    })

  if (error && !error.toString().includes('duplicate')) {
    throw error
  }

  return { success: true, message: `Added @${targetUser.username || 'friend'} to your learning friends!` }
}

/**
 * Removes a friend.
 */
export async function removeFriend(
  supabase: SupabaseClient<Database>,
  userId: string,
  friendId: string
): Promise<{ success: boolean }> {
  await (supabase
    .from('user_friends') as unknown as DBChain)
    .delete()
    .or(`and(user_id.eq.${userId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${userId})`)

  return { success: true }
}

/**
 * Fetches available cohorts and user membership status.
 */
export async function getCohortsData(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<CohortItemPayload[]> {
  const { data: cohortsList } = (await (supabase
    .from('cohorts') as unknown as DBChain)
    .select('*')
    .order('created_at', { ascending: true })) as unknown as { data: CohortRow[] | null }

  const { data: userMemberships } = (await (supabase
    .from('cohort_members') as unknown as DBChain)
    .select('cohort_id')
    .eq('user_id', userId)) as unknown as { data: { cohort_id: string }[] | null }

  const joinedCohortIds = new Set<string>((userMemberships || []).map((m) => m.cohort_id))

  const { data: allMembers } = (await (supabase
    .from('cohort_members') as unknown as DBChain)
    .select('cohort_id')) as unknown as { data: { cohort_id: string }[] | null }

  const countMap = new Map<string, number>()
  if (allMembers) {
    for (const m of allMembers) {
      countMap.set(m.cohort_id, (countMap.get(m.cohort_id) || 0) + 1)
    }
  }

  return (cohortsList || []).map((c) => ({
    id: c.id,
    slug: c.slug || c.id,
    name: c.name,
    description: c.description,
    memberCount: countMap.get(c.id) || 0,
    isMember: joinedCohortIds.has(c.id),
  }))
}

/**
 * Joins or leaves a cohort.
 */
export async function toggleCohortMembership(
  supabase: SupabaseClient<Database>,
  userId: string,
  cohortSlug: string,
  action: 'join' | 'leave'
): Promise<{ success: boolean; isMember: boolean }> {
  const { data: cohort } = (await (supabase
    .from('cohorts') as unknown as DBChain)
    .select('id')
    .eq('slug', cohortSlug)
    .single()) as unknown as { data: { id: string } | null }

  if (!cohort) throw new Error('Cohort not found.')

  if (action === 'join') {
    await (supabase
      .from('cohort_members') as unknown as DBChain)
      .insert({
        cohort_id: cohort.id,
        user_id: userId,
      })
    return { success: true, isMember: true }
  } else {
    await (supabase
      .from('cohort_members') as unknown as DBChain)
      .delete()
      .eq('cohort_id', cohort.id)
      .eq('user_id', userId)
    return { success: true, isMember: false }
  }
}
