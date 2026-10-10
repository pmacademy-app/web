import type { WeeklyLeaderboardPayload } from '@/lib/leaderboard-db'
import { toLeaderboardWidgetView } from '@/lib/dashboard/leaderboard-widget'
import { DashboardLeaderboardWidget } from '@/components/dashboard/DashboardLeaderboardWidget'

/**
 * Streams the weekly leaderboard summary into the dashboard.
 *
 * The page starts the fetch alongside its own data and passes the promise down; this
 * component resolves it inside a <Suspense> boundary so the roster-wide aggregation never
 * blocks the rest of the page. Never throws: a failed load (null or rejected promise)
 * renders the widget's "unavailable" state; an opted-out learner sees nothing.
 */
export async function LeaderboardWidgetSlot({
  payloadPromise,
}: {
  payloadPromise: Promise<WeeklyLeaderboardPayload | null>
}) {
  let payload: WeeklyLeaderboardPayload | null = null
  try {
    payload = await payloadPromise
  } catch (error) {
    console.error('[dashboard] weekly leaderboard widget failed to load', error)
  }

  const view = toLeaderboardWidgetView(payload)
  if (!view) return null

  if (view.status === 'unavailable') {
    return <DashboardLeaderboardWidget unavailable />
  }

  return <DashboardLeaderboardWidget rank={view.rank} daysStudied={view.daysStudied} hint={view.hint} />
}
