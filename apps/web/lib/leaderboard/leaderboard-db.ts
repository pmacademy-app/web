/**
 * Leaderboard Database Operations Service (Phase 3 Sprint 5)
 *
 * Handles server-side queries for weekly consistency leaderboards,
 * opt-in privacy toggles, friend management, and cohort memberships.
 *
 * Enforces strict privacy: users with `is_opted_in = false` are never exposed publicly.
 */

import { revalidateTag, unstable_cache } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import { calculateLevel } from '@/lib/xp/xp'
import { calculateWeekStart, calculateRankings, type LeaderboardEntry, type RawLeaderboardUserMetric } from '@/lib/leaderboard/leaderboard'
import * as db from '@/lib/db/leaderboard'
import type { LeaderboardUserRow } from '@/lib/db/leaderboard'
import { fetchAllRows } from '@/lib/db'
import { PublicError } from '@/lib/errors/public-error'
import { log } from '@/lib/monitoring/log'

export interface WeeklyLeaderboardPayload {
  weekStart: string
  isOptedIn: boolean
  entries: LeaderboardEntry[]
  personalEntry: LeaderboardEntry | null
  /**
   * Present (and `true`) only when one of the weekly aggregation queries failed, so the
   * metrics it feeds were zeroed rather than loaded. Absent on a complete board.
   */
  degraded?: boolean
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
  const settings = await db.selectLeaderboardSettings(supabase, userId)

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
  const { error } = await db.upsertLeaderboardOptIn(supabase, userId, isOptedIn, now)

  if (error) throw error
  // The cached board carries the opt-out list. Expired, not marked stale: a learner who just
  // opted out must not be served once more from the old board.
  invalidateLeaderboardCache({ expire: 0 })
  return { success: true, isOptedIn }
}

/**
 * Cache tag of the weekly board (perf plan item 14). Anything that changes who is on the board or
 * how they are shown (leaderboard opt-in, display name, username, avatar, account deletion) calls
 * `invalidateLeaderboardCache`.
 */
export const LEADERBOARD_CACHE_TAG = 'leaderboard'

/** How long a cached board is served before Next rebuilds it, in seconds. */
export const LEADERBOARD_REVALIDATE_SECONDS = 300

/**
 * Marks the cached weekly board stale on every instance. Best-effort: revalidateTag throws outside
 * a request scope, and a failed purge must never fail the write that triggered it.
 *
 * `'max'` (the default) serves the old board once more while the rebuild runs, which is right for
 * cosmetic changes such as a new display name. A privacy change passes `{ expire: 0 }` so the next
 * request rebuilds instead of being served a board that still lists a learner who opted out.
 */
export function invalidateLeaderboardCache(profile: 'max' | { expire: number } = 'max'): void {
  try {
    revalidateTag(LEADERBOARD_CACHE_TAG, profile)
  } catch {
    // Best-effort, see above.
  }
}

/**
 * The roster-wide weekly board, the part that is the same for every viewer. This is what the
 * cross-instance data cache stores, so it must survive JSON: arrays, never Sets or Maps.
 */
interface CachedWeeklyBoard {
  optedOutUserIds: string[]
  rawMetrics: RawLeaderboardUserMetric[]
}

/** A built board as the request uses it. */
interface LeaderboardCacheEntry {
  optedOutUserIds: ReadonlySet<string>
  rawMetrics: RawLeaderboardUserMetric[]
  // True when an aggregation query failed. Such a board is handed back to the callers of that
  // load but never stored in the data cache.
  degraded: boolean
}

interface BuiltWeeklyBoard extends CachedWeeklyBoard {
  degraded: boolean
}

/**
 * Thrown from inside the cached function for a degraded board. unstable_cache stores only values
 * that resolve, so throwing keeps the zeroed numbers out of the cache (the next request retries)
 * while the caller still receives the board from the error.
 */
class DegradedBoardError extends Error {
  constructor(readonly board: CachedWeeklyBoard) {
    super('weekly leaderboard degraded; not cached')
    this.name = 'DegradedBoardError'
  }
}

/**
 * unstable_cache needs Next's incremental cache, which exists inside a request, a route handler
 * or a render. Outside one (scripts, some test harnesses) it throws this invariant before running
 * the function, and the board is then built directly.
 */
function isMissingIncrementalCache(error: unknown): boolean {
  return error instanceof Error && error.message.includes('incrementalCache missing')
}

/**
 * Reads the weekly board through the cross-instance data cache (tag `leaderboard`, 5 minutes).
 *
 * The closure's client is used only on a miss; the entry's identity is the key parts, so every
 * caller shares one entry per week. Every caller passes a service-role client, so the board does
 * not depend on whose client built it. Per-viewer work (the viewer's own entry, adding an absent
 * viewer back, the opted-out viewer rule) happens after this returns, never inside it.
 */
async function loadWeeklyBoard(
  supabase: SupabaseClient<Database>,
  weekStart: string
): Promise<LeaderboardCacheEntry> {
  const compute = async (): Promise<CachedWeeklyBoard> => {
    const built = await buildWeeklyRawMetrics(supabase, weekStart)
    const board: CachedWeeklyBoard = { optedOutUserIds: built.optedOutUserIds, rawMetrics: built.rawMetrics }
    if (built.degraded) throw new DegradedBoardError(board)
    return board
  }

  let board: CachedWeeklyBoard
  let degraded = false
  try {
    try {
      board = await unstable_cache(compute, ['leaderboard-weekly', 'v1', weekStart], {
        tags: [LEADERBOARD_CACHE_TAG],
        revalidate: LEADERBOARD_REVALIDATE_SECONDS,
      })()
    } catch (error) {
      if (!isMissingIncrementalCache(error)) throw error
      board = await compute()
    }
  } catch (error) {
    if (!(error instanceof DegradedBoardError)) throw error
    board = error.board
    degraded = true
  }

  return {
    optedOutUserIds: new Set(board.optedOutUserIds),
    rawMetrics: board.rawMetrics,
    degraded,
  }
}

// Loads currently running on this instance, keyed by week. Concurrent calls (the dashboard widget
// and the leaderboard page both drive this) share one read of the data cache, and on a miss one
// rebuild, instead of each running the four full paged scans.
const LEADERBOARD_INFLIGHT = new Map<string, Promise<LeaderboardCacheEntry>>()

// Short negative cache for rebuilds that failed outright (the opt-out query throws, so
// the board is suppressed). During an outage this stops every request re-running the
// scans; callers still get the original error, never a board that looks like a quiet week.
// Partially degraded boards are deliberately NOT negative-cached: they are returned but
// never cached, so the next request retries and recovers as soon as the query does.
interface LeaderboardFailureEntry {
  timestamp: number
  error: unknown
}
const LEADERBOARD_FAILURES = new Map<string, LeaderboardFailureEntry>()
const FAILURE_CACHE_TTL_MS = 10 * 1000

/**
 * Records a failed weekly-aggregation query as a structured incident.
 *
 * These queries feed metrics that degrade to zero rather than to an error, so a silent
 * failure reads as "nobody was active this week" — which is why F-COR-1 survived
 * unnoticed. The board is still returned (a partially-correct leaderboard beats a blank
 * page), but the failure is no longer invisible.
 *
 * `kind: 'db_unavailable'` is the taxonomy's entry for a required query failing; it
 * derives to `critical` / `manual_retry`. Instrumentation never changes the outcome:
 * if the incident sink itself fails, the leaderboard request still completes.
 */
async function reportLeaderboardQueryFailure(
  operation: string,
  summary: string,
  cause: unknown
): Promise<void> {
  try {
    const { logErrorReport } = await import('@/lib/monitoring/logger')
    await logErrorReport({
      domain: 'db',
      kind: 'db_unavailable',
      operation,
      summary,
      details: {
        cause:
          cause instanceof Error
            ? `${cause.name}: ${cause.message}`
            : typeof cause === 'object' && cause !== null && 'message' in cause
              ? String((cause as { message: unknown }).message)
              : String(cause),
      },
    })
  } catch {
    // Never let instrumentation change what the caller sees.
  }
}

/**
 * Returns the raw weekly metrics for ALL opted-in-eligible users. Shared by global, cohort-scoped,
 * and friend-scoped ranking views, so the expensive aggregation runs at most once per week per
 * revalidate window across all instances, regardless of how many scopes or cohorts are viewed.
 *
 * Concurrent calls on one instance share a single in-flight load, and a rebuild that failed
 * outright is remembered for FAILURE_CACHE_TTL_MS so an outage is not re-scanned on every request.
 */
function getOrBuildWeeklyRawMetrics(
  supabase: SupabaseClient<Database>,
  weekStart: string
): Promise<LeaderboardCacheEntry> {
  const now = Date.now()
  const failure = LEADERBOARD_FAILURES.get(weekStart)
  if (failure) {
    if (now - failure.timestamp <= FAILURE_CACHE_TTL_MS) {
      return Promise.reject(failure.error)
    }
    LEADERBOARD_FAILURES.delete(weekStart)
  }

  const inFlight = LEADERBOARD_INFLIGHT.get(weekStart)
  if (inFlight) return inFlight

  const rebuild = loadWeeklyBoard(supabase, weekStart)
    .catch((error: unknown) => {
      LEADERBOARD_FAILURES.set(weekStart, { timestamp: Date.now(), error })
      throw error
    })
    .finally(() => {
      if (LEADERBOARD_INFLIGHT.get(weekStart) === rebuild) {
        LEADERBOARD_INFLIGHT.delete(weekStart)
      }
    })
  LEADERBOARD_INFLIGHT.set(weekStart, rebuild)
  return rebuild
}

interface RpcLeaderboardRow {
  user_id: string
  username: string | null
  name: string | null
  avatar_url: string | null
  level: number
  total_xp: number
  current_streak: number
  days_studied: number
  lessons_completed: number
  xp_earned: number
  rank: number
}

/**
 * Runs the weekly aggregation (the RPC, or the four paged queries as a fallback). Caching is the
 * caller's job (loadWeeklyBoard), which stores only a board that is not degraded.
 */
async function buildWeeklyRawMetrics(
  supabase: SupabaseClient<Database>,
  weekStart: string
): Promise<BuiltWeeklyBoard> {
  const weekStartDate = new Date(weekStart)
  const weekStartIso = weekStartDate.toISOString()

  // Attempt SQL RPC aggregation first (ENG-08, AG-31)
  let rpcRows: RpcLeaderboardRow[] = []
  try {
    // Paged: one call returns at most p_limit rows, and the board must not stop at the
    // first page. A failed page throws and falls back to the JS path below.
    const pages = await fetchAllRows<RpcLeaderboardRow>(async (from, to) => {
      const { data, error } = await supabase.rpc('get_weekly_leaderboard', {
        p_week_start: weekStartIso,
        p_limit: to - from + 1,
        p_offset: from,
      })
      return { data: (data as unknown as RpcLeaderboardRow[] | null) ?? null, error }
    })
    // Ranks can move between page reads, so a learner may appear on two pages.
    const seen = new Set<string>()
    rpcRows = pages.filter((row) => !seen.has(row.user_id) && Boolean(seen.add(row.user_id)))
  } catch (rpcErr: unknown) {
    const message = rpcErr instanceof Error ? rpcErr.message : String(rpcErr)
    log.info('leaderboard.weekly_js_fallback_used', {
      weekStart,
      reason: message || 'RPC threw',
    })
  }

  if (rpcRows.length > 0) {
    log.info('leaderboard.weekly_rpc_path_used', {
      weekStart,
      rowCount: rpcRows.length,
    })

    // The RPC already leaves opted-out learners off the roster, but the viewer is added
    // back by ensureUserPresent when absent, so the exclusion list is still needed here.
    // Fails closed like the JS path: without it an opted-out viewer cannot be recognised.
    let optedOutRows: { user_id: string }[] = []
    try {
      optedOutRows = await db.selectOptedOutUserIds(supabase)
    } catch (optOutError) {
      await reportLeaderboardQueryFailure(
        'leaderboard.weekly_opt_outs',
        'Weekly leaderboard opt-out query failed',
        optOutError
      )
      throw optOutError
    }

    const rawMetrics: RawLeaderboardUserMetric[] = rpcRows.map((row) => {
      const levelInfo = calculateLevel(row.total_xp || 0)
      return {
        userId: row.user_id,
        username: row.username ?? null,
        name: row.name ?? null,
        avatarUrl: row.avatar_url ?? null,
        levelTitle: levelInfo.title,
        level: row.level ?? levelInfo.level,
        daysStudied: row.days_studied ?? 0,
        lessonsCompleted: row.lessons_completed ?? 0,
        xpEarned: row.xp_earned ?? 0,
        currentStreak: row.current_streak ?? 0,
        totalXp: row.total_xp ?? 0,
      }
    })

    return {
      optedOutUserIds: optedOutRows.map((r) => r.user_id),
      rawMetrics,
      degraded: false,
    }
  }

  // Fallback JavaScript aggregation path
  let aggregationDegraded = false

  // 1. Fetch users with total_xp > 0.
  //
  // Paged rather than issued as one unbounded select: PostgREST truncates at its row
  // cap without reporting an error, which silently drops everyone past it from the
  // board. F-COR-4.
  let userList: LeaderboardUserRow[] = []
  try {
    userList = await db.selectRankedUsers(supabase)
  } catch (usersError) {
    aggregationDegraded = true
    await reportLeaderboardQueryFailure(
      'leaderboard.weekly_users',
      'Weekly leaderboard user roster query failed',
      usersError
    )
  }

  const userIds = new Set(userList.map((u) => u.id))

  // 2. Fetch opted-out users so we can exclude them.
  let optedOutRows: { user_id: string }[] = []
  try {
    optedOutRows = await db.selectOptedOutUserIds(supabase)
  } catch (optOutError) {
    aggregationDegraded = true
    // Failing open here would publish users who opted OUT of the leaderboard, so the
    // board is suppressed rather than shown without the exclusion list.
    await reportLeaderboardQueryFailure(
      'leaderboard.weekly_opt_outs',
      'Weekly leaderboard opt-out query failed',
      optOutError
    )
    throw optOutError
  }

  // 3. Fetch lesson progress in current week for consistency metric
  //
  // The `.in('user_id', <every qualifying id>)` filter this used to carry put the
  // entire user roster into a query string, which fails on URL length as the user
  // base grows. The week bound already limits the row set to recent activity, and the
  // rows are matched against `userIds` in JS below, so the filter bought nothing that
  // the client-side join does not. F-COR-4.
  let lessonProgress: db.WeeklyLessonRow[] = []
  try {
    lessonProgress = await db.selectWeeklyLessonProgress(supabase, weekStartDate.toISOString())
  } catch (lessonProgressError) {
    aggregationDegraded = true
    await reportLeaderboardQueryFailure(
      'leaderboard.weekly_lesson_progress',
      'Weekly leaderboard lesson-progress query failed',
      lessonProgressError
    )
  }

  // 4. Fetch xp events in current week.
  //
  // The column is `xp_amount`, not `amount`. This selected `amount` until B8-A, which
  // PostgREST rejects as an unknown column — and because only `data` was destructured,
  // the error went nowhere, `data` came back null, and every user's weekly XP reduced
  // to 0 with no signal anywhere. Hence the check below: a failed read here must never
  // be indistinguishable from a week in which nobody earned XP. See F-COR-1.
  let xpEvents: db.WeeklyXpRow[] = []
  try {
    xpEvents = await db.selectWeeklyXpEvents(supabase, weekStartDate.toISOString())
  } catch (xpEventsError) {
    aggregationDegraded = true
    await reportLeaderboardQueryFailure(
      'leaderboard.weekly_xp_events',
      'Weekly leaderboard XP events query failed',
      xpEventsError
    )
  }

  // Group once by user rather than re-scanning both arrays per user. The previous
  // per-user `.filter()` was O(users × events); now that the two queries are paged to
  // completion and no longer pre-filtered by user id, that cost would compound.
  // Rows belonging to users who are not on the board are dropped here — this is the
  // client-side join that replaces the old `.in()` filter.
  const lessonDaysByUser = new Map<string, Set<string>>()
  const lessonCountByUser = new Map<string, number>()
  for (const lp of lessonProgress) {
    // `user_id` is nullable in the schema. The local row shape this module used to
    // declare said otherwise, so the null case was invisible; a null here would have
    // keyed the maps under "null" and inflated one phantom learner's metrics.
    const progressUserId = lp.user_id
    if (!progressUserId || !userIds.has(progressUserId)) continue
    lessonCountByUser.set(progressUserId, (lessonCountByUser.get(progressUserId) ?? 0) + 1)
    if (lp.completed_at) {
      let days = lessonDaysByUser.get(progressUserId)
      if (!days) {
        days = new Set<string>()
        lessonDaysByUser.set(progressUserId, days)
      }
      days.add(lp.completed_at.split('T')[0])
    }
  }

  const xpByUser = new Map<string, number>()
  for (const xe of xpEvents) {
    // Nullable for the same reason as above.
    const xpUserId = xe.user_id
    if (!xpUserId || !userIds.has(xpUserId)) continue
    xpByUser.set(xpUserId, (xpByUser.get(xpUserId) ?? 0) + (xe.xp_amount || 0))
  }

  // Aggregate user weekly metrics
  const rawMetrics: RawLeaderboardUserMetric[] = userList.map((u) => {
    const lessonsCompleted = lessonCountByUser.get(u.id) ?? 0
    const daysStudied = lessonDaysByUser.get(u.id)?.size ?? 0
    const xpEarned = xpByUser.get(u.id) ?? 0

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

  // A degraded board is returned but never cached (loadWeeklyBoard). Caching it would pin the
  // wrong numbers for the full window and suppress recovery on the next request: the same
  // "a wrong answer looks like a quiet week" failure mode as F-COR-1, one layer up.
  return {
    optedOutUserIds: optedOutRows.map((r) => r.user_id),
    rawMetrics,
    degraded: aggregationDegraded,
  }
}

/**
 * Ensures a user is represented in a raw-metrics list even if they have 0 total_xp
 * (e.g. brand new users, or users in a cohort with no activity yet).
 *
 * An opted-out learner who is not in the list is left out: the SQL path drops opted-out
 * learners from the roster, so adding them back here would rank them with zeroed weekly
 * numbers they never had.
 */
async function ensureUserPresent(
  supabase: SupabaseClient<Database>,
  rawMetrics: RawLeaderboardUserMetric[],
  userId: string,
  optedOutUserIds: ReadonlySet<string>
): Promise<RawLeaderboardUserMetric[]> {
  if (rawMetrics.some((m) => m.userId === userId) || optedOutUserIds.has(userId)) {
    return rawMetrics
  }

  const currentUser = await db.selectSingleRankedUser(supabase, userId)

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
 *
 * `skipIfOptedOut` (the dashboard widget) returns an empty payload for a learner who opted out,
 * before the roster-wide aggregation runs: the widget renders nothing for them, so building the
 * board would be wasted work. The leaderboard page leaves it off and still shows the learner
 * their own entry.
 */
export async function getWeeklyLeaderboard(
  supabase: SupabaseClient<Database>,
  userId: string,
  targetWeekStart?: string,
  options: { skipIfOptedOut?: boolean } = {}
): Promise<WeeklyLeaderboardPayload> {
  const weekStart = targetWeekStart || calculateWeekStart()
  const { isOptedIn } = await getUserLeaderboardSettings(supabase, userId)
  if (options.skipIfOptedOut && !isOptedIn) {
    return { weekStart, isOptedIn, entries: [], personalEntry: null }
  }
  const cached = await getOrBuildWeeklyRawMetrics(supabase, weekStart)

  const rawMetrics = await ensureUserPresent(supabase, cached.rawMetrics, userId, cached.optedOutUserIds)

  // Calculate final rankings
  const rankedEntries = calculateRankings(rawMetrics, userId)
  const publicEntries = rankedEntries.filter((e) => e.isCurrentUser || !cached.optedOutUserIds.has(e.userId))
  const personalEntry = rankedEntries.find((e) => e.isCurrentUser) ?? null

  return {
    weekStart,
    isOptedIn,
    entries: publicEntries,
    personalEntry,
    // Only set on a degraded board, so a complete payload keeps its existing shape.
    // Without it a zeroed metric is indistinguishable from a learner who did nothing.
    ...(cached.degraded ? { degraded: true } : {}),
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

  const [cached, cohort, memberRows] = await Promise.all([
    getOrBuildWeeklyRawMetrics(supabase, weekStart),
    db.selectCohortById(supabase, cohortId),
    db.selectCohortMemberIds(supabase, cohortId),
  ])

  const cohortName = cohort?.name ?? null
  const memberIds = new Set<string>(memberRows.map((m) => m.user_id))
  const isMember = memberIds.has(userId)

  let rawMetrics = cached.rawMetrics.filter((m) => memberIds.has(m.userId))
  if (isMember) {
    rawMetrics = await ensureUserPresent(supabase, rawMetrics, userId, cached.optedOutUserIds)
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
  const friendsRows = await db.selectFriendEdges(supabase, userId)

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

  const { row: targetUser, error: lookupError } = await db.selectUserByIdentifier(
    supabase,
    lookupColumn,
    friendIdentifier
  )

  if (lookupError) {
    throw new PublicError('Failed to look up learner. Please try again.', { status: 400, code: 'LOOKUP_FAILED' })
  }

  if (!targetUser) {
    throw new PublicError(`Learner "${friendIdentifier}" not found.`, { status: 404, code: 'NOT_FOUND' })
  }

  if (targetUser.id === userId) {
    throw new PublicError('You cannot add yourself as a friend.', { status: 400, code: 'VALIDATION' })
  }

  const { error } = await db.insertFriendEdge(supabase, userId, targetUser.id)

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
  await db.deleteFriendEdge(supabase, userId, friendId)

  return { success: true }
}

/**
 * Fetches available cohorts and user membership status.
 */
export async function getCohortsData(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<CohortItemPayload[]> {
  const cohortsList = await db.selectAllCohorts(supabase)
  const userMemberships = await db.selectUserCohortIds(supabase, userId)

  const joinedCohortIds = new Set<string>(userMemberships.map((m) => m.cohort_id))

  // Paged to completion since B8-F. A single unbounded select stopped at PostgREST's
  // row cap, so every cohort's member count was quietly low once total memberships
  // passed it — a wrong number presented as a fact.
  const allMembers = await db.selectAllCohortMemberships(supabase)

  const countMap = new Map<string, number>()
  for (const m of allMembers) {
    countMap.set(m.cohort_id, (countMap.get(m.cohort_id) || 0) + 1)
  }

  return cohortsList.map((c) => ({
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
  const cohort = await db.selectCohortBySlug(supabase, cohortSlug)

  if (!cohort) throw new PublicError('Cohort not found.', { status: 404, code: 'NOT_FOUND' })

  if (action === 'join') {
    await db.insertCohortMember(supabase, cohort.id, userId)
    return { success: true, isMember: true }
  }

  await db.deleteCohortMember(supabase, cohort.id, userId)
  return { success: true, isMember: false }
}
