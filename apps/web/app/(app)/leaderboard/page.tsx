import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createServiceRoleClient } from '@/lib/supabase'
import { getServerUser } from '@/lib/auth'
import { getWeeklyLeaderboard, getFriendLeaderboard, getCohortsData } from '@/lib/leaderboard-db'
import { LeaderboardHeader } from '@/components/leaderboard/LeaderboardHeader'
import { LeaderboardTable } from '@/components/leaderboard/LeaderboardTable'
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
  const [weeklyPayload, friendEntries, cohortsList] = await Promise.all([
    getWeeklyLeaderboard(supabase, user.id),
    getFriendLeaderboard(supabase, user.id),
    getCohortsData(supabase, user.id),
  ])

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
            <Trophy className="w-5 h-5 text-primary" /> Global Consistency Rankings (Week of {weeklyPayload.weekStart})
          </h2>
          <span className="text-xs text-muted-foreground font-mono">
            {entries.length} Active Learners Listed
          </span>
        </div>

        <LeaderboardTable entries={entries} />
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
