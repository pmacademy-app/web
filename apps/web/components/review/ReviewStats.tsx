import { Layers, Calendar, CheckCircle2, Award } from 'lucide-react'
import type { ReviewStats as ReviewStatsType } from '@/lib/srs'

interface ReviewStatsProps {
  stats: ReviewStatsType
}

export function ReviewStats({ stats }: ReviewStatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {/* Due Today */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Due Today
          </span>
          <Layers className="w-4 h-4 text-primary" />
        </div>
        <div className="mt-2">
          <span className="text-2xl font-extrabold text-primary font-mono">
            {stats.dueTodayCount}
          </span>
          <span className="text-xs text-muted-foreground font-medium ml-1">Cards</span>
        </div>
      </div>

      {/* Completed Today */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Completed Today
          </span>
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        </div>
        <div className="mt-2">
          <span className="text-2xl font-extrabold text-foreground font-mono">
            {stats.completedTodayCount}
          </span>
          <span className="text-xs text-muted-foreground font-medium ml-1">Reviewed</span>
        </div>
      </div>

      {/* Upcoming Reviews */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Upcoming
          </span>
          <Calendar className="w-4 h-4 text-sky-500" />
        </div>
        <div className="mt-2">
          <span className="text-2xl font-extrabold text-foreground font-mono">
            {stats.upcomingCount}
          </span>
          <span className="text-xs text-muted-foreground font-medium ml-1">Scheduled</span>
        </div>
      </div>

      {/* Total Unlocked Cards */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Total Unlocked
          </span>
          <Award className="w-4 h-4 text-amber-500" />
        </div>
        <div className="mt-2">
          <span className="text-2xl font-extrabold text-foreground font-mono">
            {stats.totalUnlockedCount}
          </span>
          <span className="text-xs text-muted-foreground font-medium ml-1">Total</span>
        </div>
      </div>
    </div>
  )
}
