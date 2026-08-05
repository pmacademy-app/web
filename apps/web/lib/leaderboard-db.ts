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

/**
 * Fetches weekly consistency rankings for opted-in users.
 */
export async function getWeeklyLeaderboard(
  supabase: SupabaseClient<Database>,
  userId: string,
  targetWeekStart?: string
): Promise<WeeklyLeaderboardPayload> {
  const weekStart = targetWeekStart || calculateWeekStart()
  const { isOptedIn } = await getUserLeaderboardSettings(supabase, userId)

  // 1. Fetch opted-in users
  const { data: optedInRows } = (await (supabase
    .from('user_leaderboard_settings') as unknown as DBChain)
    .select('user_id')
    .eq('is_opted_in', true)) as unknown as { data: { user_id: string }[] | null }

  const optedInUserIds = new Set<string>((optedInRows || []).map((r) => r.user_id))
  // Always include current user in their personal view even if opted out
  optedInUserIds.add(userId)

  const userIdsArray = Array.from(optedInUserIds)
  if (userIdsArray.length === 0) {
    return { weekStart, isOptedIn, entries: [], personalEntry: null }
  }

  // 2. Fetch users metadata
  const { data: users } = (await (supabase
    .from('users') as unknown as DBChain)
    .select('id, username, name, avatar_url, total_xp, current_streak, level')
    .in('id', userIdsArray)) as unknown as { data: UserRow[] | null }

  if (!users || users.length === 0) {
    return { weekStart, isOptedIn, entries: [], personalEntry: null }
  }

  // 3. Fetch lesson progress in current week for consistency metric
  const weekStartDate = new Date(weekStart)
  const { data: lessonProgress } = (await (supabase
    .from('user_lesson_progress') as unknown as DBChain)
    .select('user_id, status, completed_at')
    .in('user_id', userIdsArray)
    .eq('status', 'completed')
    .gte('completed_at', weekStartDate.toISOString())) as unknown as {
    data: { user_id: string; status: string; completed_at: string }[] | null
  }

  // 4. Fetch xp events in current week
  const { data: xpEvents } = (await (supabase
    .from('xp_events') as unknown as DBChain)
    .select('user_id, amount, created_at')
    .in('user_id', userIdsArray)
    .gte('created_at', weekStartDate.toISOString())) as unknown as {
    data: { user_id: string; amount: number; created_at: string }[] | null
  }

  // Aggregate user weekly metrics
  const rawMetrics: RawLeaderboardUserMetric[] = users.map((u) => {
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
    }
  })

  // Calculate final rankings
  const rankedEntries = calculateRankings(rawMetrics, userId)
  const publicEntries = rankedEntries.filter((e) => e.isCurrentUser || optedInUserIds.has(e.userId))
  const personalEntry = rankedEntries.find((e) => e.isCurrentUser) ?? null

  return {
    weekStart,
    isOptedIn,
    entries: publicEntries,
    personalEntry,
  }
}

/**
 * Fetches user friends list and friend rankings.
 */
export async function getFriendLeaderboard(
  supabase: SupabaseClient<Database>,
  userId: string
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

  const { entries } = await getWeeklyLeaderboard(supabase, userId)
  return entries.filter((e) => friendIds.has(e.userId))
}

/**
 * Adds a friend by username or user ID.
 */
export async function addFriend(
  supabase: SupabaseClient<Database>,
  userId: string,
  friendIdentifier: string
): Promise<{ success: boolean; message: string }> {
  // Resolve friend by username or ID
  const { data: targetUser } = (await (supabase
    .from('users') as unknown as DBChain)
    .select('id, username')
    .or(`username.eq.${friendIdentifier},id.eq.${friendIdentifier}`)
    .maybeSingle()) as unknown as { data: { id: string; username: string } | null }

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
    slug: c.slug,
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
