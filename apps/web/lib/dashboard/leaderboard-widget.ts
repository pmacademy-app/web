import type { WeeklyLeaderboardPayload } from '@/lib/leaderboard-db'

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
