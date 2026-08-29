'use client'

import React from 'react'
import { Trophy, Award, Flame, Zap, Shield, CheckCircle2 } from 'lucide-react'
import type { PublicPortfolioPayload } from '@/lib/portfolio-db'
import { BADGE_DEFINITIONS } from '@/config/badges'

interface PortfolioAchievementsProps {
  user: PublicPortfolioPayload['user']
  progress?: PublicPortfolioPayload['progress']
  capstonesCount?: number
}

export function PortfolioAchievements({ user, progress, capstonesCount = 0 }: PortfolioAchievementsProps) {
  const { currentStreak, longestStreak, totalXp, levelInfo } = user
  const lessonsCompletedCount = progress?.completedLessonsCount ?? 0
  const modulesCompletedCount = progress?.completedModulesCount ?? 0

  // Compute earned badges dynamically based on public user achievements
  const earnedBadges = BADGE_DEFINITIONS.filter((badge) => {
    switch (badge.key) {
      case 'first_lesson':
        return lessonsCompletedCount >= 1
      case 'module_complete':
        return modulesCompletedCount >= 1
      case 'curriculum_explorer':
        return lessonsCompletedCount >= 30
      case 'first_level_up':
        return levelInfo.level >= 2
      case 'xp_1000':
        return totalXp >= 1000
      case 'xp_5000':
        return totalXp >= 5000
      case 'streak_7':
        return Math.max(currentStreak, longestStreak) >= 7
      case 'streak_30':
        return Math.max(currentStreak, longestStreak) >= 30
      case 'first_capstone':
        return capstonesCount >= 1
      case 'capstones_all':
        return capstonesCount >= 9
      case 'portfolio_published':
        return true
      case 'pm_academy_graduate':
        return lessonsCompletedCount >= 90
      default:
        return false
    }
  })

  return (
    <div className="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-sm space-y-6">
      {/* Section Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold font-serif text-foreground">
              Achievements & Milestones
            </h2>
            <p className="text-xs text-muted-foreground">
              Curriculum level, study streaks, and earned milestone badges.
            </p>
          </div>
        </div>
      </div>

      {/* Grid: 4 Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border/80 bg-card/60 p-4 space-y-1">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-primary" /> Curriculum Tier
          </span>
          <div className="text-base font-bold text-foreground truncate">Level {levelInfo.level} Learner</div>
          <span className="text-[10px] text-primary font-bold">Tier {levelInfo.level}</span>
        </div>

        <div className="rounded-xl border border-border/80 bg-card/60 p-4 space-y-1">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-primary" /> Total Experience
          </span>
          <div className="text-xl font-bold text-foreground">{totalXp.toLocaleString()} XP</div>
          <span className="text-[10px] text-muted-foreground">Activity Record</span>
        </div>

        <div className="rounded-xl border border-border/80 bg-card/60 p-4 space-y-1">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-amber-500" /> Current Streak
          </span>
          <div className="text-xl font-bold text-foreground">{currentStreak} Days</div>
          <span className="text-[10px] text-amber-500 font-semibold">Active Habit</span>
        </div>

        <div className="rounded-xl border border-border/80 bg-card/60 p-4 space-y-1">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-emerald-500" /> Longest Streak
          </span>
          <div className="text-xl font-bold text-foreground">{longestStreak} Days</div>
          <span className="text-[10px] text-emerald-500 font-semibold">Personal Record</span>
        </div>
      </div>

      {/* Badges Grid */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Earned Badges ({earnedBadges.length})
          </h3>
        </div>

        {earnedBadges.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-2">
            No public milestone badges earned yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {earnedBadges.map((b) => (
              <div
                key={b.key}
                className="p-3.5 rounded-xl border border-primary/30 bg-primary/5 text-foreground flex items-center gap-3 transition-colors"
              >
                <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                  <Award className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-bold block truncate">{b.name}</span>
                  <span className="text-[10px] text-emerald-500 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> {b.category}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
