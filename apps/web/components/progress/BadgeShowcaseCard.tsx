import React from 'react'
import Link from 'next/link'
import { Award, ArrowRight } from 'lucide-react'
import { BadgeCard } from '@/components/badges/BadgeCard'
import type { BadgeProgressItem } from '@/lib/badges'

interface BadgeShowcaseCardProps {
  unlockedCount: number
  totalBadges: number
  badges: BadgeProgressItem[]
}

/**
 * Achievements preview for the Progress page. Reuses the same `BadgeCard`
 * component as the full /badges gallery (icon, category, earned date, and
 * progress-toward-locked bar) so both surfaces stay visually consistent.
 *
 * Preview selection favors motivation: a couple of recently-earned badges
 * followed by the locked badges closest to completion, rather than an
 * arbitrary slice — all computed from data already fetched for this page,
 * no additional queries.
 */
export function BadgeShowcaseCard({ unlockedCount, totalBadges, badges }: BadgeShowcaseCardProps) {
  const earned = badges.filter((b) => b.isEarned).slice(0, 3)
  const locked = badges
    .filter((b) => !b.isEarned)
    .sort((a, b) => b.progressPercentage - a.progressPercentage)
    .slice(0, 5)
  const displayBadges = [...earned, ...locked].slice(0, 6)

  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-xs">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <Award className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold font-serif text-foreground">
            Achievements &amp; Badges
          </h2>
          <span className="text-xs font-mono font-bold text-muted-foreground">
            {unlockedCount} / {totalBadges}
          </span>
        </div>
        <Link
          href="/badges"
          className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1"
        >
          <span>View Full Showcase</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {displayBadges.length === 0 ? (
        <div className="py-8 text-center text-xs text-muted-foreground">
          Complete lessons, quizzes, and capstones to start earning badges.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {displayBadges.map((badge) => (
            <BadgeCard key={badge.definition.key} badge={badge} />
          ))}
        </div>
      )}
    </div>
  )
}
