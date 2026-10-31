import React from 'react'
import { Target, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { loadNorthStar, type NorthStarSummary } from '@/lib/admin/north-star-service'
import { AdminLoadWarning } from '@/components/admin/AdminLoadWarning'
import { cn } from '@/lib/utils'

function formatWeek(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function TrendBadge({ delta, trendPct }: Pick<NorthStarSummary, 'delta' | 'trendPct'>) {
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  const Icon = direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : Minus
  const label =
    trendPct !== null ? `${trendPct > 0 ? '+' : ''}${trendPct}%` : `${delta > 0 ? '+' : ''}${delta}`

  return (
    <div
      className={cn(
        'flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border',
        direction === 'up' && 'bg-admin-success-soft text-admin-success border-admin-success/25',
        direction === 'down' && 'bg-admin-danger-soft text-admin-danger border-admin-danger/25',
        direction === 'flat' && 'bg-admin-surface-raised text-admin-fg-muted border-admin-border'
      )}
    >
      <Icon className="w-3 h-3" aria-hidden />
      <span>{label}</span>
      <span className="sr-only">compared with last week</span>
    </div>
  )
}

/** Presentational half of the tile, so it can render from any summary. */
export function NorthStarTileView({ summary, failed }: { summary: NorthStarSummary; failed: boolean }) {
  return (
    <section
      aria-labelledby="north-star-title"
      className="p-5 rounded-xl bg-admin-surface border border-admin-border space-y-3 shadow-xl"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="north-star-title" className="text-xs font-semibold text-admin-fg-muted uppercase tracking-wider">
            North star: weekly mastering learners
          </h2>
          <p className="text-xs text-admin-fg-muted mt-1">
            Learners who completed a lesson with a score of 70 or more, or submitted a capstone (UTC weeks).
          </p>
        </div>
        <div className="p-2 rounded-lg bg-admin-accent-soft border border-admin-accent/25 shrink-0">
          <Target className="w-4 h-4 text-admin-accent" aria-hidden />
        </div>
      </div>

      {failed ? (
        <p className="text-3xl font-extrabold text-admin-fg tracking-tight">Unavailable</p>
      ) : (
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <p className="text-3xl font-extrabold text-admin-fg tracking-tight">{summary.thisWeek.toLocaleString()}</p>
            <p className="text-xs text-admin-fg-muted font-medium">
              This week so far (from {formatWeek(summary.thisWeekStart)})
            </p>
          </div>
          <div>
            <p className="text-xl font-bold text-admin-fg">{summary.lastWeek.toLocaleString()}</p>
            <p className="text-xs text-admin-fg-muted font-medium">Last week (from {formatWeek(summary.lastWeekStart)})</p>
          </div>
          <TrendBadge delta={summary.delta} trendPct={summary.trendPct} />
        </div>
      )}
    </section>
  )
}

/** Overview tile for the north-star metric. Not range-scoped: always this week against last week. */
export async function OverviewNorthStarTile() {
  const { failed, ...summary } = await loadNorthStar()

  return (
    <div className="space-y-3">
      {failed && <AdminLoadWarning message="The north-star metric could not be loaded." />}
      <NorthStarTileView summary={summary} failed={failed} />
    </div>
  )
}

/** Suspense fallback with the tile's footprint, so the page does not shift when it resolves. */
export function OverviewNorthStarTileSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading north-star metric"
      className="w-full h-[9.5rem] rounded-xl border border-admin-border bg-admin-surface/40 motion-safe:animate-pulse"
    />
  )
}
