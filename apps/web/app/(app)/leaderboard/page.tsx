import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createServiceRoleClient } from '@/lib/supabase'
import { getServerUser } from '@/lib/auth'
import { getWeeklyLeaderboard, getFriendLeaderboard, getCohortsData } from '@/lib/leaderboard-db'
import { calculateRankings } from '@/lib/leaderboard'
import { LeaderboardHeader } from '@/components/leaderboard/LeaderboardHeader'
import { LeaderboardScopeSwitcher } from '@/components/leaderboard/LeaderboardScopeSwitcher'
import { FriendAccountabilitySection } from '@/components/leaderboard/FriendAccountabilitySection'
import { CohortsSection } from '@/components/leaderboard/CohortsSection'
import { Trophy } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Consistency Leaderboard & Cohorts',
  description:
    'Weekly product management learning consistency rankings, study streak accountability, friend comparisons, and cohorts.',
}

export default async function LeaderboardPage() {
  const user = await getServerUser()
  if (!user) {
    redirect('/login')
  }

  const supabase = createServiceRoleClient()
  const [weeklyPayload, cohortsList] = await Promise.all([
    getWeeklyLeaderboard(supabase, user.id),
    getCohortsData(supabase, user.id),
  ])
  const friendEntries = await getFriendLeaderboard(supabase, user.id, weeklyPayload.entries)
  // Re-rank friends locally (rank #1..N among friends) rather than showing raw global rank —
  // this is a pure in-memory recompute over the already-fetched entries, no extra query.
  const friendScopedEntries = calculateRankings(friendEntries, user.id)

  const { isOptedIn, entries, personalEntry } = weeklyPayload

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Header & Personal Metrics */}
      <LeaderboardHeader
        personalEntry={personalEntry}
        initialOptedIn={isOptedIn}
      />

      {/* Main Leaderboard Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold font-serif text-foreground flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" /> Consistency Rankings
          </h2>
          <span className="text-xs text-muted-foreground font-mono">
            {entries.length} Active Learners Listed
          </span>
        </div>

        <LeaderboardScopeSwitcher
          globalEntries={entries}
          globalPersonalEntry={personalEntry}
          weekStart={weeklyPayload.weekStart}
          joinedCohorts={cohortsList.filter((c) => c.isMember)}
          friendEntries={friendScopedEntries}
        />
      </div>

      {/* Cohorts & Friends Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
        {/* Cohorts Section */}
        <CohortsSection initialCohorts={cohortsList} />

        {/* Friends Accountability Section */}
        <FriendAccountabilitySection
          initialFriends={friendEntries}
          currentUserId={user.id}
        />
      </div>
    </div>
  )
}
