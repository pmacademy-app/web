/**
 * Leaderboard queries (B8-F).
 *
 * This is the aggregate that produced `F-COR-1`. The weekly XP query asked for
 * `xp_events.amount`, a column that does not exist; PostgREST rejected it, the call
 * destructured only `data`, and the board reported that nobody had earned any XP.
 * The `DBChain` cast is what made that invisible to the compiler.
 *
 * Written against the generated types, the column names below are checked. The
 * `Selected<...>` return types state exactly which columns each query asked for, so
 * a later edit cannot read a field the query never requested.
 *
 * The bounded paging is `F-COR-4` and stays: an unbounded `.select()` is truncated
 * at PostgREST's row cap with no error, which drops everyone past it off the board.
 */

import { fetchAllRows, type Db, type Row, type Selected } from '@/lib/db'

/** The user columns the weekly board renders. */
export type LeaderboardUserRow = Selected<
  'users',
  'id' | 'username' | 'name' | 'avatar_url' | 'total_xp' | 'current_streak' | 'level'
>

export type WeeklyLessonRow = Selected<'user_lesson_progress', 'user_id' | 'status' | 'completed_at'>
export type WeeklyXpRow = Selected<'xp_events', 'user_id' | 'xp_amount' | 'created_at'>
export type OptOutRow = Selected<'user_leaderboard_settings', 'user_id'>

/**
 * Every user with lifetime XP, paged to completion.
 *
 * Paged rather than issued as one select: the row cap would silently drop the tail
 * of the roster, and a shorter board looks exactly like a smaller user base.
 */
export function selectRankedUsers(db: Db): Promise<LeaderboardUserRow[]> {
  return fetchAllRows<LeaderboardUserRow>((from, to) =>
    db
      .from('users')
      .select('id, username, name, avatar_url, total_xp, current_streak, level')
      .gt('total_xp', 0)
      .range(from, to)
  )
}

/**
 * The users who opted out of the leaderboard.
 *
 * The caller must treat a failure here as fatal rather than degrading: an empty
 * exclusion list publishes exactly the people who asked not to be published.
 */
export function selectOptedOutUserIds(db: Db): Promise<OptOutRow[]> {
  return fetchAllRows<OptOutRow>((from, to) =>
    db.from('user_leaderboard_settings').select('user_id').eq('is_opted_in', false).range(from, to)
  )
}

/**
 * Completed lessons since `weekStartIso`.
 *
 * Not filtered by user id. The `.in('user_id', <every qualifying id>)` this carried
 * before B8-C put the entire roster into a query string and failed on URL length as
 * the user base grew. The week bound already limits the rows to recent activity and
 * the caller joins against the roster in memory, so the filter bought nothing.
 */
export function selectWeeklyLessonProgress(db: Db, weekStartIso: string): Promise<WeeklyLessonRow[]> {
  return fetchAllRows<WeeklyLessonRow>((from, to) =>
    db
      .from('user_lesson_progress')
      .select('user_id, status, completed_at')
      .eq('status', 'completed')
      .gte('completed_at', weekStartIso)
      .range(from, to)
  )
}

/**
 * XP events since `weekStartIso`.
 *
 * `xp_amount` — the column F-COR-1 got wrong. It is now checked against the schema;
 * spelling it `amount` here fails the build with the column name in the message.
 */
export function selectWeeklyXpEvents(db: Db, weekStartIso: string): Promise<WeeklyXpRow[]> {
  return fetchAllRows<WeeklyXpRow>((from, to) =>
    db
      .from('xp_events')
      .select('user_id, xp_amount, created_at')
      .gte('created_at', weekStartIso)
      .range(from, to)
  )
}

/**
 * A user's leaderboard privacy settings, or `null` when no row exists yet.
 *
 * The caller decides what an absent row means (today: opted in). That default is a
 * product decision and stays out of the query layer.
 */
export async function selectLeaderboardSettings(
  db: Db,
  userId: string
): Promise<Selected<'user_leaderboard_settings', 'is_opted_in' | 'allow_friend_requests'> | null> {
  const { data } = await db
    .from('user_leaderboard_settings')
    .select('is_opted_in, allow_friend_requests')
    .eq('user_id', userId)
    .maybeSingle()

  return data
}

/** Writes a user's opt-in toggle. Returns the raw error for the caller to throw. */
export async function upsertLeaderboardOptIn(
  db: Db,
  userId: string,
  isOptedIn: boolean,
  nowIso: string
): Promise<{ error: unknown }> {
  const { error } = await db.from('user_leaderboard_settings').upsert({
    user_id: userId,
    is_opted_in: isOptedIn,
    updated_at: nowIso,
  })

  return { error }
}

// ─── Personal entry, cohorts and friends ─────────────────────────────────────

/** One user's board row, for a learner who is not in the cached roster. */
export async function selectSingleRankedUser(
  db: Db,
  userId: string
): Promise<LeaderboardUserRow | null> {
  const { data } = await db
    .from('users')
    .select('id, username, name, avatar_url, total_xp, current_streak, level')
    .eq('id', userId)
    .maybeSingle()

  return data
}

export async function selectCohortById(
  db: Db,
  cohortId: string
): Promise<Selected<'cohorts', 'id' | 'name'> | null> {
  const { data } = await db.from('cohorts').select('id, name').eq('id', cohortId).maybeSingle()

  return data
}

export async function selectCohortBySlug(
  db: Db,
  slug: string
): Promise<Selected<'cohorts', 'id'> | null> {
  const { data } = await db.from('cohorts').select('id').eq('slug', slug).single()

  return data
}

/** Every cohort, oldest first. */
export async function selectAllCohorts(db: Db): Promise<Row<'cohorts'>[]> {
  const { data } = await db.from('cohorts').select('*').order('created_at', { ascending: true })

  return data ?? []
}

/**
 * The members of one cohort, paged to completion.
 *
 * Unbounded before B8-F. A cohort past the row cap lost its tail, so those members
 * were silently absent from the cohort board — the same shape as F-COR-4, one table
 * over. Ordered by `user_id` so the pages partition the set deterministically;
 * paging without an ORDER BY can repeat or skip rows between pages.
 */
export function selectCohortMemberIds(
  db: Db,
  cohortId: string
): Promise<Selected<'cohort_members', 'user_id'>[]> {
  return fetchAllRows<Selected<'cohort_members', 'user_id'>>((from, to) =>
    db
      .from('cohort_members')
      .select('user_id')
      .eq('cohort_id', cohortId)
      .order('user_id', { ascending: true })
      .range(from, to)
  )
}

/** The cohorts one user belongs to. */
export async function selectUserCohortIds(
  db: Db,
  userId: string
): Promise<Selected<'cohort_members', 'cohort_id'>[]> {
  const { data } = await db.from('cohort_members').select('cohort_id').eq('user_id', userId)

  return data ?? []
}

/**
 * Every cohort membership row, paged to completion, for member counts.
 *
 * This was a single unbounded select. Past the row cap it returned a partial set
 * with no error, so every cohort's displayed member count was quietly too low —
 * a wrong number presented as a fact, which is worse than a failure. Ordered for
 * deterministic paging, as above.
 */
export function selectAllCohortMemberships(
  db: Db
): Promise<Selected<'cohort_members', 'cohort_id'>[]> {
  return fetchAllRows<Selected<'cohort_members', 'cohort_id'>>((from, to) =>
    db
      .from('cohort_members')
      .select('cohort_id')
      .order('cohort_id', { ascending: true })
      .range(from, to)
  )
}

export async function insertCohortMember(db: Db, cohortId: string, userId: string): Promise<void> {
  await db.from('cohort_members').insert({ cohort_id: cohortId, user_id: userId })
}

export async function deleteCohortMember(db: Db, cohortId: string, userId: string): Promise<void> {
  await db.from('cohort_members').delete().eq('cohort_id', cohortId).eq('user_id', userId)
}

/**
 * The friendship rows touching one user, in either direction.
 *
 * Not paged: the row set is one learner's own friend list, which the product bounds
 * far below the page cap — unlike the cohort queries above, which scale with the
 * whole user base.
 */
export async function selectFriendEdges(
  db: Db,
  userId: string
): Promise<Selected<'user_friends', 'user_id' | 'friend_id'>[]> {
  const { data } = await db
    .from('user_friends')
    .select('user_id, friend_id')
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`)

  return data ?? []
}

/** Looks a learner up by id or username, for the add-friend flow. */
export async function selectUserByIdentifier(
  db: Db,
  column: 'id' | 'username',
  value: string
): Promise<{ row: Selected<'users', 'id' | 'username'> | null; error: unknown }> {
  const { data, error } = await db
    .from('users')
    .select('id, username')
    .eq(column, value)
    .maybeSingle()

  return { row: data, error }
}

export async function insertFriendEdge(
  db: Db,
  userId: string,
  friendId: string
): Promise<{ error: unknown }> {
  const { error } = await db
    .from('user_friends')
    .insert({ user_id: userId, friend_id: friendId, status: 'accepted' })

  return { error }
}

export async function deleteFriendEdge(db: Db, userId: string, friendId: string): Promise<void> {
  await db
    .from('user_friends')
    .delete()
    .or(
      `and(user_id.eq.${userId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${userId})`
    )
}
