'use client'

import React, { useState } from 'react'
import { Trophy, Calendar, BookOpen, Eye, EyeOff, Zap, Award, Users, Shield, ChevronDown } from 'lucide-react'
import { type LeaderboardEntry, getLeaderboardTier } from '@/lib/leaderboard'
import type { CohortItemPayload } from '@/lib/leaderboard-db'
import { cn } from '@/lib/utils'
import { LeaderboardPopoverModal } from './LeaderboardPopoverModal'
import { CohortsSection } from './CohortsSection'
import { FriendAccountabilitySection } from './FriendAccountabilitySection'

interface LeaderboardHeaderProps {
  personalEntry: LeaderboardEntry | null
  initialOptedIn: boolean
  onOptInToggle?: (isOptedIn: boolean) => void
  cohortsList?: CohortItemPayload[]
  friendEntries?: LeaderboardEntry[]
  currentUserId?: string
}

export function LeaderboardHeader({
  personalEntry,
  initialOptedIn,
  onOptInToggle,
  cohortsList,
  friendEntries,
  currentUserId,
}: LeaderboardHeaderProps) {
  const [isOptedIn, setIsOptedIn] = useState<boolean>(initialOptedIn)
  const [loading, setLoading] = useState<boolean>(false)
  const [activeModal, setActiveModal] = useState<'cohorts' | 'friends' | null>(null)

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
      {/* Top Banner: Title & Controls */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-b border-border pb-6">
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

        {/* Action Controls in Header: Cohorts, Friends, Opt-in */}
        <div className="relative shrink-0 flex items-center gap-2 self-start lg:self-center">
          {/* Segmented Group: Cohorts & Friends */}
          <div className="inline-flex items-center p-1 rounded-xl border border-border/80 bg-card shadow-xs gap-1">
            {cohortsList && (
              <button
                type="button"
                id="header-cohorts-btn"
                onClick={() => setActiveModal((prev) => (prev === 'cohorts' ? null : 'cohorts'))}
                aria-expanded={activeModal === 'cohorts'}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none',
                  activeModal === 'cohorts'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-foreground hover:bg-secondary/70'
                )}
              >
                <Users className="w-3.5 h-3.5 shrink-0" />
                <span>Cohorts</span>
                <span
                  className={cn(
                    'px-1.5 py-0.2 rounded-full text-[10px] font-mono leading-none',
                    activeModal === 'cohorts'
                      ? 'bg-primary-foreground/20 text-primary-foreground font-bold'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {cohortsList.length}
                </span>
                <ChevronDown
                  className={cn(
                    'w-3 h-3 transition-transform duration-200 opacity-60',
                    activeModal === 'cohorts' && 'rotate-180 opacity-100'
                  )}
                />
              </button>
            )}

            {friendEntries && (
              <button
                type="button"
                id="header-friends-btn"
                onClick={() => setActiveModal((prev) => (prev === 'friends' ? null : 'friends'))}
                aria-expanded={activeModal === 'friends'}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none',
                  activeModal === 'friends'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-foreground hover:bg-secondary/70'
                )}
              >
                <Shield className="w-3.5 h-3.5 shrink-0" />
                <span>Friends</span>
                <span
                  className={cn(
                    'px-1.5 py-0.2 rounded-full text-[10px] font-mono leading-none',
                    activeModal === 'friends'
                      ? 'bg-white/20 text-white font-bold'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {friendEntries.length}
                </span>
                <ChevronDown
                  className={cn(
                    'w-3 h-3 transition-transform duration-200 opacity-60',
                    activeModal === 'friends' && 'rotate-180 opacity-100'
                  )}
                />
              </button>
            )}
          </div>

          {/* Privacy Toggle Pill */}
          <button
            type="button"
            onClick={handleToggle}
            disabled={loading}
            title={isOptedIn ? 'Publicly Listed on Leaderboard (click to toggle)' : 'Private Mode (click to toggle)'}
            aria-label={isOptedIn ? 'Public Profile' : 'Private Profile'}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border shadow-xs cursor-pointer select-none',
              isOptedIn
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20'
                : 'bg-secondary/60 border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
            )}
          >
            {isOptedIn ? (
              <>
                <Eye className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Public</span>
              </>
            ) : (
              <>
                <EyeOff className="w-3.5 h-3.5 shrink-0" />
                <span>Private</span>
              </>
            )}
          </button>

          {/* Sophisticated Floating Popover Modals */}
          {cohortsList && (
            <LeaderboardPopoverModal
              isOpen={activeModal === 'cohorts'}
              onClose={() => setActiveModal(null)}
              title="Learning Cohorts"
              subtitle="Join peer spaces to compare consistency"
              icon={Users}
              iconClassName="bg-primary/10 text-primary"
              badgeText={`${cohortsList.length} Spaces`}
            >
              <CohortsSection initialCohorts={cohortsList} hideHeader />
            </LeaderboardPopoverModal>
          )}

          {friendEntries && currentUserId && (
            <LeaderboardPopoverModal
              isOpen={activeModal === 'friends'}
              onClose={() => setActiveModal(null)}
              title="Friend Accountability"
              subtitle="Study together and track each other's pace"
              icon={Shield}
              iconClassName="bg-emerald-500/10 text-emerald-500"
              badgeText={`${friendEntries.length} Friends`}
            >
              <FriendAccountabilitySection
                initialFriends={friendEntries}
                currentUserId={currentUserId}
                hideHeader
              />
            </LeaderboardPopoverModal>
          )}
        </div>
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
