'use client'

import React from 'react'
import { X, Flame, Shield, BookOpen } from 'lucide-react'
import type { LeaderboardEntry } from '@/lib/leaderboard'

interface ProfileComparisonModalProps {
  currentUser: LeaderboardEntry | null
  targetUser: LeaderboardEntry | null
  onClose: () => void
}

export function ProfileComparisonModal({
  currentUser,
  targetUser,
  onClose,
}: ProfileComparisonModalProps) {
  if (!targetUser) return null

  const userA = currentUser || {
    name: 'You',
    username: 'you',
    levelTitle: 'Learner',
    level: 1,
    daysStudied: 0,
    lessonsCompleted: 0,
    xpEarned: 0,
    currentStreak: 0,
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="max-w-lg w-full rounded-2xl border border-border bg-card p-6 shadow-xl space-y-6 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-primary block">
              Peer Comparison
            </span>
            <h3 className="text-lg font-bold font-serif text-foreground">
              {userA.name || 'You'} vs {targetUser.name || `@${targetUser.username}`}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg border border-border hover:bg-secondary text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Comparison Grid */}
        <div className="space-y-4 text-xs">
          {/* Level & Career Title */}
          <div className="rounded-xl border border-border bg-card/60 p-4 space-y-2">
            <div className="text-[11px] font-bold text-muted-foreground uppercase flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-primary" /> Career Title & Level
            </div>
            <div className="grid grid-cols-2 gap-4 text-center font-serif">
              <div className="p-2 rounded-lg bg-primary/5">
                <div className="font-bold text-foreground text-sm">{userA.levelTitle}</div>
                <span className="text-[10px] text-primary font-bold">Level {userA.level}</span>
              </div>
              <div className="p-2 rounded-lg bg-primary/5">
                <div className="font-bold text-foreground text-sm">{targetUser.levelTitle}</div>
                <span className="text-[10px] text-primary font-bold">Level {targetUser.level}</span>
              </div>
            </div>
          </div>

          {/* Days Studied */}
          <div className="rounded-xl border border-border bg-card/60 p-3 flex items-center justify-between">
            <span className="font-semibold text-muted-foreground flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5 text-emerald-500" /> Weekly Days Studied
            </span>
            <div className="flex items-center gap-6 font-mono font-bold">
              <span className="text-foreground">{userA.daysStudied} Days</span>
              <span className="text-muted-foreground">vs</span>
              <span className="text-primary">{targetUser.daysStudied} Days</span>
            </div>
          </div>

          {/* Lessons Completed */}
          <div className="rounded-xl border border-border bg-card/60 p-3 flex items-center justify-between">
            <span className="font-semibold text-muted-foreground flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5 text-primary" /> Weekly Lessons
            </span>
            <div className="flex items-center gap-6 font-mono font-bold">
              <span className="text-foreground">{userA.lessonsCompleted}</span>
              <span className="text-muted-foreground">vs</span>
              <span className="text-primary">{targetUser.lessonsCompleted}</span>
            </div>
          </div>

          {/* Current Streak */}
          <div className="rounded-xl border border-border bg-card/60 p-3 flex items-center justify-between">
            <span className="font-semibold text-muted-foreground flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 text-amber-500" /> Active Streak
            </span>
            <div className="flex items-center gap-6 font-mono font-bold">
              <span className="text-foreground">{userA.currentStreak} Days</span>
              <span className="text-muted-foreground">vs</span>
              <span className="text-amber-500">{targetUser.currentStreak} Days</span>
            </div>
          </div>
        </div>

        {/* Close button */}
        <div className="pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90 transition-colors"
          >
            Close Comparison
          </button>
        </div>
      </div>
    </div>
  )
}
