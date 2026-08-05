'use client'

import React from 'react'
import { Trophy, Award, Flame, Zap, Shield, Lock } from 'lucide-react'
import type { PublicPortfolioPayload } from '@/lib/portfolio-db'

interface PortfolioAchievementsProps {
  user: PublicPortfolioPayload['user']
}

export function PortfolioAchievements({ user }: PortfolioAchievementsProps) {
  const { currentStreak, longestStreak, totalXp, levelInfo } = user

  // Placeholder badges grid for Phase 3
  const badgePlaceholders = [
    { key: 'first_quiz', name: 'First Quiz Completed', icon: 'CheckCircle', earned: true },
    { key: 'first_capstone', name: 'First Capstone Submitted', icon: 'Award', earned: true },
    { key: 'streak_7', name: '7-Day Learning Streak', icon: 'Flame', earned: currentStreak >= 7 },
    { key: 'module_1_complete', name: 'Foundations Master', icon: 'BookOpen', earned: true },
    { key: 'cpo_completion', name: 'Chief Product Officer', icon: 'Crown', earned: levelInfo.level >= 9 },
  ]

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
              Verified level title, study streaks, and earned milestone badges.
            </p>
          </div>
        </div>
      </div>

      {/* Grid: 4 Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border/80 bg-card/60 p-4 space-y-1">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-primary" /> Career Title
          </span>
          <div className="text-base font-bold text-foreground truncate">{levelInfo.title}</div>
          <span className="text-[10px] text-primary font-bold">Level {levelInfo.level}</span>
        </div>

        <div className="rounded-xl border border-border/80 bg-card/60 p-4 space-y-1">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-primary" /> Total Experience
          </span>
          <div className="text-xl font-bold text-foreground">{totalXp.toLocaleString()} XP</div>
          <span className="text-[10px] text-muted-foreground">Ledger Verified</span>
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

      {/* Badges Placeholder Grid */}
      <div className="space-y-3 pt-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Earned Badges & Milestones
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {badgePlaceholders.map((b) => (
            <div
              key={b.key}
              className={`p-3 rounded-xl border flex items-center gap-3 transition-colors ${
                b.earned
                  ? 'border-primary/30 bg-primary/5 text-foreground'
                  : 'border-border/50 bg-card/40 text-muted-foreground opacity-60'
              }`}
            >
              <div className={`p-2 rounded-lg ${b.earned ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                {b.earned ? <Award className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold block truncate">{b.name}</span>
                <span className="text-[10px] text-muted-foreground block">
                  {b.earned ? 'Milestone Unlocked' : 'Locked Milestone'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
