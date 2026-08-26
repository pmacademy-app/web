import { Flame, Shield, AlertTriangle } from 'lucide-react'
import type { StreakStatusSummary } from '@/lib/streaks'

interface StreakCardProps {
  streakStatus: StreakStatusSummary
}

export function StreakCard({ streakStatus }: StreakCardProps) {
  const {
    status,
    effectiveCurrentStreak,
    longestStreak,
    streakFreezesAvailable,
    statusMessage,
  } = streakStatus

  const getStatusBadge = () => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            Active Today
          </span>
        )
      case 'at_risk':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <AlertTriangle className="w-3 h-3" />
            Study Due Today
          </span>
        )
      case 'broken':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            Reset Needed
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-secondary text-muted-foreground">
            Not Started
          </span>
        )
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm flex flex-col justify-between space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flame className="w-5 h-5 text-amber-500 fill-amber-500/20" />
          <h3 className="text-sm font-bold font-serif text-foreground">
            Daily Study Streak
          </h3>
        </div>
        {getStatusBadge()}
      </div>

      <div className="grid grid-cols-2 gap-4 my-1">
        {/* Current Streak */}
        <div className="bg-secondary/30 rounded-xl p-3.5 border border-border/50">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Current Streak
          </span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-extrabold text-foreground font-mono">
              {effectiveCurrentStreak}
            </span>
            <span className="text-xs text-muted-foreground font-medium">Days</span>
          </div>
        </div>

        {/* Longest Streak */}
        <div className="bg-secondary/30 rounded-xl p-3.5 border border-border/50">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Best Record
          </span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-extrabold text-foreground font-mono">
              {longestStreak}
            </span>
            <span className="text-xs text-muted-foreground font-medium">Days</span>
          </div>
        </div>
      </div>

      {/* Freezes & Motivator */}
      <div className="space-y-2 border-t border-border/50 pt-3">
        <div className="flex items-center justify-between text-xs">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground font-medium" title="Streak freezes automatically protect your streak on a missed day">
            <Shield className="w-3.5 h-3.5 text-sky-500" />
            Earned Streak Freezes:
          </span>
          <span className="font-bold text-foreground font-mono" title="Streak freezes automatically protect your streak on a missed day">
            {streakFreezesAvailable} / 2 Available
          </span>
        </div>

        <p className="text-xs text-muted-foreground leading-snug">
          {statusMessage}
        </p>
        <p className="text-[11px] text-muted-foreground/80 italic leading-tight">
          Available freezes automatically protect your streak if you miss a day.
        </p>
      </div>
    </div>
  )
}
