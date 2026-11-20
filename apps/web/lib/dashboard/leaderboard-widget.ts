import type { WeeklyLeaderboardPayload } from '@/lib/leaderboard/leaderboard-db'

/** Shown under "Unranked" when the learner has no lesson-days yet this week. */
export const NO_ACTIVITY_HINT = 'Complete a lesson this week to get ranked.'

/** What the dashboard widget should show. `null` from the mapper means "render nothing". */
export type LeaderboardWidgetView =
  | { status: 'available'; rank: number | null; daysStudied: number; hint: string | null }
  | { status: 'unavailable' }

/**
 * Maps the weekly leaderboard payload onto the dashboard widget's view.
 *
 * - `null` payload (load failed) → `unavailable`: no fake "Unranked · 0/7" numbers.
 * - Learner opted out → `null`, meaning "render nothing" to respect their choice. Checked
 *   before `degraded`, so an opted-out learner sees nothing on a degraded board too.
 * - Degraded payload (an aggregation query failed) → `unavailable`: its zeroed metrics
 *   would otherwise read as "Unranked · 0/7" for a learner who did study.
 * - No personal entry, or no lesson-days this week → Unranked with a nudge. A learner with
 *   zero activity still gets a tie-break rank from the ranking (e.g. #212); showing it
 *   would read as a real position, so it is suppressed.
 * - Otherwise → the learner's rank and days studied.
 */
export function toLeaderboardWidgetView(
  payload: Pick<WeeklyLeaderboardPayload, 'isOptedIn' | 'personalEntry' | 'degraded'> | null,
): LeaderboardWidgetView | null {
  if (!payload) return { status: 'unavailable' }
  if (payload.isOptedIn === false) return null
  if (payload.degraded) return { status: 'unavailable' }

  const entry = payload.personalEntry
  const daysStudied = entry && Number.isFinite(entry.daysStudied) ? Math.max(0, entry.daysStudied) : 0
  const rank = entry && Number.isFinite(entry.rank) && entry.rank > 0 ? entry.rank : null

  if (rank === null || daysStudied === 0) {
    return { status: 'available', rank: null, daysStudied, hint: daysStudied === 0 ? NO_ACTIVITY_HINT : null }
  }

  return { status: 'available', rank, daysStudied, hint: null }
}

/** One line of the dashboard leaderboard list. */
export interface LeaderboardWidgetRow {
  key: string
  rank: number
  /** "You" for the learner, else their name or @username */
  name: string
  daysStudied: number
  isYou: boolean
}

/**
 * The top learners this week (only people who studied at least one day), followed by the
 * learner's own row when it is not already among them. A learner with no lesson-days is left
 * out here; the widget shows them an Unranked row instead of a tie-break rank.
 */
export function toLeaderboardRows(
  payload: Pick<WeeklyLeaderboardPayload, 'entries' | 'personalEntry'> | null,
  top = 3,
): LeaderboardWidgetRow[] {
  if (!payload) return []
  const youId = payload.personalEntry?.userId ?? null
  const isYou = (e: { userId: string; isCurrentUser: boolean }) => e.isCurrentUser || (youId !== null && e.userId === youId)
  const row = (e: WeeklyLeaderboardPayload['entries'][number]): LeaderboardWidgetRow => ({
    key: e.userId,
    rank: e.rank,
    name: isYou(e) ? 'You' : e.name?.trim() || `@${e.username || 'learner'}`,
    daysStudied: Math.max(0, e.daysStudied),
    isYou: isYou(e),
  })
  const active = (payload.entries ?? [])
    .filter((e) => Number.isFinite(e.rank) && e.rank > 0 && e.daysStudied > 0)
    .sort((a, b) => a.rank - b.rank)
  const rows = active.slice(0, top).map(row)
  const me = payload.personalEntry
  if (me && me.rank > 0 && me.daysStudied > 0 && !rows.some((r) => r.isYou)) rows.push(row({ ...me, isCurrentUser: true }))
  return rows
}
