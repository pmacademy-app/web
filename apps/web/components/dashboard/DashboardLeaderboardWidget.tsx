import Link from 'next/link'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { LeaderboardWidgetRow } from '@/lib/dashboard/leaderboard-widget'

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
      /** Optional nudge shown under the learner's Unranked row (e.g. no activity yet this week). */
      hint?: string | null
      /** Top learners this week, plus the learner's own row. */
      rows?: LeaderboardWidgetRow[]
    }

const DAYS_IN_WEEK = 7

// Same column width as the streak panel above it, so the two right-hand cards line up.
const CARD = 'rounded-2xl border border-border bg-surface px-5 py-4 lg:w-[22rem] lg:shrink-0'

/** Clamps to a whole number of days within a single week (0–7). */
export function clampDaysStudied(days: number): number {
  if (!Number.isFinite(days)) return 0
  return Math.min(DAYS_IN_WEEK, Math.max(0, Math.floor(days)))
}

function WidgetHeader() {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h3 id="leaderboard-widget-title" className="text-base font-semibold">
        This week&apos;s leaderboard
      </h3>
      <Link
        href="/leaderboard"
        className="shrink-0 rounded-sm text-xs font-semibold text-ink-muted outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        View all<span className="sr-only"> leaderboard</span>
      </Link>
    </div>
  )
}

/** Seven dots, one per day of the week, filled for each day studied. */
function DayDots({ days }: { days: number }) {
  const n = clampDaysStudied(days)
  return (
    <span className="flex shrink-0 items-center gap-1" data-days={n}>
      <span aria-hidden="true" className="flex gap-1">
        {Array.from({ length: DAYS_IN_WEEK }, (_, k) => (
          <span key={k} className={cn('size-1.5 rounded-full', k < n ? 'bg-primary' : 'bg-border')} />
        ))}
      </span>
      <span className="sr-only">{`${n} of ${DAYS_IN_WEEK} days`}</span>
    </span>
  )
}

function Row({ rank, name, days, isYou }: { rank: number | null; name: string; days: number; isYou: boolean }) {
  return (
    <li
      data-you={isYou ? 'true' : undefined}
      className={cn('-mx-2 flex items-center gap-3 rounded-lg px-2 py-2', isYou && 'bg-primary-soft')}
    >
      <span className="w-6 shrink-0 text-sm font-semibold tabular-nums text-ink-muted" data-rank>
        {rank ? (
          rank
        ) : (
          <>
            <span aria-hidden="true">–</span>
            <span className="sr-only">Unranked</span>
          </>
        )}
      </span>
      <span className={cn('min-w-0 flex-1 truncate text-sm', isYou ? 'font-semibold' : 'font-medium')}>{name}</span>
      <DayDots days={days} />
    </li>
  )
}

/**
 * Dashboard summary of this week's consistency leaderboard: the top learners and the
 * learner's own place. Server-renderable; links through to the full leaderboard.
 */
export function DashboardLeaderboardWidget(props: DashboardLeaderboardWidgetProps) {
  if (props.unavailable) {
    return (
      <section aria-labelledby="leaderboard-widget-title" className={CARD}>
        <WidgetHeader />
        {/* Roughly the list's height so the fallback-to-content swap does not shift. */}
        <div className="flex min-h-40 flex-col items-center justify-center gap-1 text-center">
          <p className="text-sm font-semibold">Leaderboard unavailable right now</p>
          <p className="text-xs text-ink-muted">Check back in a moment.</p>
        </div>
      </section>
    )
  }

  const { rank, daysStudied, hint } = props
  const isRanked = typeof rank === 'number' && Number.isFinite(rank) && rank > 0
  const rows = (props.rows ?? []).filter((r) => !r.isYou)
  const shown = rows.slice(0, 3)

  return (
    <section aria-labelledby="leaderboard-widget-title" className={CARD}>
      <WidgetHeader />
      <p className="mt-0.5 text-xs text-ink-muted">Ranked by days studied, then lessons</p>
      <ol className="mt-3 space-y-0.5">
        {shown.map((r) => (
          <Row key={r.key} rank={r.rank} name={r.name} days={r.daysStudied} isYou={false} />
        ))}
        <Row rank={isRanked ? rank : null} name="You" days={daysStudied} isYou />
      </ol>
      {!isRanked && hint ? <p className="mt-2 text-xs text-ink-muted">{hint}</p> : null}
    </section>
  )
}

/** Suspense fallback with the same footprint as the widget, so streaming in causes no layout shift. */
export function LeaderboardWidgetSkeleton() {
  return (
    <div aria-hidden="true" data-testid="leaderboard-widget-skeleton" className={CARD}>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-12" />
      </div>
      <Skeleton className="mt-2 h-3 w-48 max-w-full" />
      <div className="mt-3 space-y-0.5">
        {[0, 1, 2, 3].map((k) => (
          <div key={k} className="flex items-center gap-3 py-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-1.5 w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}
