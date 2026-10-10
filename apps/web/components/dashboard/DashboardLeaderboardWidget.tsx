import Link from 'next/link'
import { Trophy, ArrowRight } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

type DashboardLeaderboardWidgetProps =
  | {
      /** The weekly leaderboard could not be loaded; show that instead of fake numbers. */
      unavailable: true
    }
  | {
      unavailable?: false
      /** Weekly consistency rank; null/0 means the learner is not ranked yet. */
      rank: number | null
      /** Distinct days with a completed lesson this week (Monday-start, UTC). */
      daysStudied: number
      /** Optional nudge shown under "Unranked" (e.g. no activity yet this week). */
      hint?: string | null
    }

const DAYS_IN_WEEK = 7

// The width matches one column of the 3-column dashboard grid above (gap-6 = 1.5rem), so
// the card lines up with it while the activity card can still fill the row on its own.
const CARD =
  'rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4 md:w-[calc((100%_-_3rem)/3)] md:shrink-0'
const STATS = 'rounded-xl border border-border/50 bg-secondary/30 divide-y divide-border/50'
const STAT_ROW = 'flex flex-wrap items-baseline justify-between gap-x-3 px-3.5 py-3'
const STAT_LABEL = 'text-[11px] font-semibold text-muted-foreground uppercase tracking-wider'
const STAT_NOTE = 'basis-full text-[11px] leading-tight text-muted-foreground'

/** Clamps to a whole number of days within a single week (0–7). */
export function clampDaysStudied(days: number): number {
  if (!Number.isFinite(days)) return 0
  return Math.min(DAYS_IN_WEEK, Math.max(0, Math.floor(days)))
}

function WidgetHeader() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <div className="flex items-center gap-2">
        <Trophy className="w-5 h-5 text-primary" aria-hidden="true" />
        <h3 className="text-sm font-bold font-serif text-foreground">Weekly Leaderboard</h3>
      </div>

      <Link
        href="/leaderboard"
        className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:text-primary/80 transition-colors rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
      >
        View All<span className="sr-only"> leaderboard</span>
        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
      </Link>
    </div>
  )
}

/**
 * Compact dashboard summary of the learner's weekly consistency ranking.
 * Server-renderable: no client state, just a link through to the full leaderboard.
 */
export function DashboardLeaderboardWidget(props: DashboardLeaderboardWidgetProps) {
  if (props.unavailable) {
    return (
      <div className={CARD}>
        <WidgetHeader />
        {/* Same height as the stats block so the fallback-to-content swap does not shift. */}
        <div className={`${STATS} flex min-h-32 flex-col items-center justify-center gap-1 px-3.5 py-3 text-center`}>
          <p className="text-sm font-semibold text-foreground">Leaderboard unavailable right now</p>
          <p className="text-[11px] leading-tight text-muted-foreground">Check back in a moment.</p>
        </div>
      </div>
    )
  }

  const { rank, daysStudied, hint } = props
  const isRanked = typeof rank === 'number' && Number.isFinite(rank) && rank > 0
  const days = clampDaysStudied(daysStudied)

  return (
    <div className={CARD}>
      <WidgetHeader />

      <dl className={STATS}>
        <div className={STAT_ROW}>
          <dt className={STAT_LABEL}>Weekly Rank</dt>
          <dd className="ml-auto leading-8">
            {isRanked ? (
              <span className="text-2xl font-extrabold font-mono text-foreground">#{rank}</span>
            ) : (
              <span className="text-base font-bold text-muted-foreground">Unranked</span>
            )}
          </dd>
          {!isRanked && hint ? <dd className={STAT_NOTE}>{hint}</dd> : null}
        </div>

        <div className={STAT_ROW}>
          <dt className={STAT_LABEL}>Days Studied</dt>
          <dd className="ml-auto leading-8">
            <span className="text-2xl font-extrabold font-mono text-emerald-600 dark:text-emerald-400">{days}</span>
            <span aria-hidden="true" className="text-xs font-medium text-muted-foreground">{` / ${DAYS_IN_WEEK}`}</span>
            <span className="sr-only">{` of ${DAYS_IN_WEEK}`}</span>
          </dd>
          <dd className={STAT_NOTE}>days you completed a lesson this week</dd>
        </div>
      </dl>
    </div>
  )
}

/** Suspense fallback with the same footprint as the widget, so streaming in causes no layout shift. */
export function LeaderboardWidgetSkeleton() {
  return (
    <div aria-hidden="true" data-testid="leaderboard-widget-skeleton" className={CARD}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Skeleton className="size-5 rounded-md" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-3.5 w-14" />
      </div>

      <div className={STATS}>
        <div className="flex items-center justify-between gap-3 px-3.5 py-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-12" />
        </div>
        <div className="space-y-1 px-3.5 py-3">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-14" />
          </div>
          <Skeleton className="h-3 w-36 max-w-full" />
        </div>
      </div>
    </div>
  )
}
