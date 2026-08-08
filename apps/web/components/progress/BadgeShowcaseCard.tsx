'use client'

import React from 'react'
import Link from 'next/link'
import { Award, ArrowRight } from 'lucide-react'

export interface BadgeItem {
  key: string
  name: string
  description: string
  unlocked: boolean
  icon?: string
}

interface BadgeShowcaseCardProps {
  unlockedCount: number
  totalBadges: number
  badges: BadgeItem[]
}

export function BadgeShowcaseCard({ unlockedCount, totalBadges, badges }: BadgeShowcaseCardProps) {
  const displayBadges = badges.slice(0, 6)

  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-xs">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <Award className="w-5 h-5 text-purple-400" />
          <h2 className="text-xl font-bold font-serif text-foreground">
            Achievements &amp; Badges ({unlockedCount} / {totalBadges})
          </h2>
        </div>
        <Link
          href="/badges"
          className="text-xs font-bold text-purple-400 hover:underline inline-flex items-center gap-1"
        >
          <span>View Full Showcase</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {displayBadges.map((badge) => (
          <div
            key={badge.key}
            className={`p-3 rounded-xl border flex flex-col items-center text-center space-y-2 transition-all ${
              badge.unlocked
                ? 'bg-purple-500/10 border-purple-500/30 text-white'
                : 'bg-muted/40 border-border/60 text-muted-foreground opacity-60'
            }`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
              badge.unlocked ? 'bg-purple-500 text-white' : 'bg-muted text-muted-foreground'
            }`}>
              {badge.unlocked ? '★' : '🔒'}
            </div>
            <div>
              <p className="text-xs font-bold font-serif truncate w-full">{badge.name}</p>
              <span className="text-[9px] font-mono text-muted-foreground block uppercase mt-0.5">
                {badge.unlocked ? 'Unlocked' : 'Locked'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
