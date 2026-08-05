'use client'

import React from 'react'
import Link from 'next/link'
import { Trophy, ArrowRight } from 'lucide-react'

interface DashboardLeaderboardWidgetProps {
  rank: number | null
  daysStudied: number
}

export function DashboardLeaderboardWidget({
  rank,
  daysStudied,
}: DashboardLeaderboardWidgetProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4 shadow-xs">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2 text-primary font-bold text-xs">
          <Trophy className="w-4 h-4" /> Consistency Leaderboard
        </div>

        <Link
          href="/leaderboard"
          className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1"
        >
          <span>View All</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 space-y-0.5">
          <span className="text-[10px] uppercase font-bold text-muted-foreground block">
            Weekly Rank
          </span>
          <div className="text-xl font-bold font-serif text-foreground">
            {rank ? `#${rank}` : 'Unranked'}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10 space-y-0.5">
          <span className="text-[10px] uppercase font-bold text-muted-foreground block">
            Days Studied
          </span>
          <div className="text-xl font-bold font-serif text-emerald-500">
            {daysStudied} / 7
          </div>
        </div>
      </div>
    </div>
  )
}
