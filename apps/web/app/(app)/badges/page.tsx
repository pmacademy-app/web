import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getServerUser } from '@/lib/auth'
import { getUserBadgesData } from '@/lib/badges-db'
import { BadgeCard } from '@/components/badges/BadgeCard'
import { Trophy, Award, Sparkles } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Badge & Achievement Gallery | PM Academy',
  description:
    'Celebrate genuine product management learning milestones, streak habits, and capstone achievements.',
}

export default async function BadgesGalleryPage() {
  const user = await getServerUser()
  if (!user) {
    redirect('/login')
  }

  const supabase = createServerSupabaseClient()
  const { totalEarned, totalAvailable, completionPercentage, allBadges, recentBadge } =
    await getUserBadgesData(supabase, user.id)

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wider mb-1">
            <Trophy className="w-4 h-4" /> PM Academy Achievements
          </div>
          <h1 className="text-2xl md:text-3xl font-bold font-serif text-foreground">
            Badge & Milestone Gallery
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">
            Celebrating genuine product management mastery across curriculum, quizzes, streaks, and applied capstones.
          </p>
        </div>
      </div>

      {/* Stats Summary Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-5 space-y-1 shadow-xs">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-primary" /> Total Badges Earned
          </span>
          <div className="text-2xl font-bold text-foreground font-serif">
            {totalEarned} / {totalAvailable}
          </div>
          <p className="text-[11px] text-emerald-500 font-semibold">
            {completionPercentage}% Completion
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 space-y-1 shadow-xs">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5 text-amber-500" /> Milestone Completion
          </span>
          <div className="w-full bg-secondary h-2.5 rounded-full overflow-hidden mt-2">
            <div
              className="bg-amber-500 h-full rounded-full transition-all"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {totalAvailable - totalEarned} Badges remaining to unlock
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 space-y-1 shadow-xs">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" /> Recent Achievement
          </span>
          {recentBadge ? (
            <div>
              <div className="text-sm font-bold text-foreground truncate">
                {recentBadge.definition.name}
              </div>
              <p className="text-[11px] text-muted-foreground truncate">
                {recentBadge.definition.description}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic py-1">
              Complete lessons or quizzes to earn your first badge!
            </p>
          )}
        </div>
      </div>

      {/* Badges Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold font-serif text-foreground">All Milestones</h2>
          <span className="text-xs text-muted-foreground">
            {totalEarned} Unlocked • {totalAvailable - totalEarned} Locked
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {allBadges.map((badge) => (
            <BadgeCard key={badge.definition.key} badge={badge} />
          ))}
        </div>
      </div>
    </div>
  )
}
