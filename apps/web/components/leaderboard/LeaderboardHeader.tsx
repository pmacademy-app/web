'use client'

import React, { useState } from 'react'
import { Trophy, Calendar, BookOpen, Eye, EyeOff, Zap, Award } from 'lucide-react'
import { type LeaderboardEntry, getLeaderboardTier } from '@/lib/leaderboard'
import { cn } from '@/lib/utils'

interface LeaderboardHeaderProps {
  personalEntry: LeaderboardEntry | null
  initialOptedIn: boolean
  onOptInToggle?: (isOptedIn: boolean) => void
}

export function LeaderboardHeader({
  personalEntry,
  initialOptedIn,
  onOptInToggle,
}: LeaderboardHeaderProps) {
  const [isOptedIn, setIsOptedIn] = useState<boolean>(initialOptedIn)
  const [loading, setLoading] = useState<boolean>(false)

  const tierInfo = personalEntry
    ? getLeaderboardTier(personalEntry.level, personalEntry.totalXp ?? personalEntry.xpEarned)
    : null

  const handleToggle = async () => {
    const nextState = !isOptedIn
    setIsOptedIn(nextState)
    setLoading(true)

    try {
      const res = await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isOptedIn: nextState }),
      })
      if (res.ok && onOptInToggle) {
        onOptInToggle(nextState)
      }
    } catch (err) {
      console.warn('Failed to update leaderboard privacy:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner: Title & Privacy Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wider mb-1">
            <Trophy className="w-4 h-4" /> Learning Accountability
          </div>
          <h1 className="text-2xl md:text-3xl font-bold font-serif text-foreground">
            Consistency Leaderboard
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">
            Rewarding weekly study consistency, learning milestones, and habit formation over raw XP accumulation.
          </p>
        </div>

        {/* Opt-in / Opt-out Toggle Button */}
        <button
          type="button"
          onClick={handleToggle}
          disabled={loading}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border shadow-xs ${
            isOptedIn
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/20'
              : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          {isOptedIn ? (
            <>
              <Eye className="w-4 h-4 text-emerald-500" />
              <span>Publicly Listed (Opted-in)</span>
            </>
          ) : (
            <>
              <EyeOff className="w-4 h-4" />
              <span>Private Mode (Opted-out)</span>
            </>
          )}
        </button>
      </div>

      {/* 3 Personal Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-5 space-y-1 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5 text-primary" /> Weekly Rank
            </span>
            {tierInfo && (
              <span className={cn('text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border', tierInfo.badgeColor)}>
                {tierInfo.tier}
              </span>
            )}
          </div>
          <div className="text-2xl font-bold font-serif text-foreground flex items-baseline gap-2">
            <span>{personalEntry ? `#${personalEntry.rank}` : 'Unranked'}</span>
            {personalEntry?.pointsToNextRank && personalEntry.rank > 1 && (
              <span className="text-[11px] font-sans font-semibold text-primary">
                (+{personalEntry.pointsToNextRank} XP to #{personalEntry.rank - 1})
              </span>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground block truncate">
            {isOptedIn ? 'Consistency Leaderboard' : 'Opted out of public list'}
          </span>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 space-y-1 shadow-xs">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-emerald-500" /> Days Studied This Week
          </span>
          <div className="text-2xl font-bold font-serif text-foreground">
            {personalEntry ? personalEntry.daysStudied : 0} / 7 Days
          </div>
          <span className="text-[10px] text-emerald-500 font-semibold">Active Study Habit</span>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 space-y-1 shadow-xs">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-primary" /> Lessons &amp; XP Earned
          </span>
          <div className="text-2xl font-bold font-serif text-foreground">
            {personalEntry ? personalEntry.lessonsCompleted : 0} Lessons
          </div>
          <span className="text-[10px] text-primary font-bold">
            +{personalEntry ? personalEntry.xpEarned : 0} Weekly XP Earned
          </span>
        </div>
      </div>
    </div>
  )
}
