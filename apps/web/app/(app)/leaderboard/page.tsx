import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getServerUser } from '@/lib/auth'
import { getWeeklyLeaderboard, getFriendLeaderboard, getCohortsData } from '@/lib/leaderboard-db'
import { LeaderboardHeader } from '@/components/leaderboard/LeaderboardHeader'
import { LeaderboardTable } from '@/components/leaderboard/LeaderboardTable'
import { Users, Shield, Trophy } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Consistency Leaderboard & Cohorts | PM Academy',
  description:
    'Weekly product management learning consistency rankings, study streak accountability, friend comparisons, and cohorts.',
}

export default async function LeaderboardPage() {
  const user = await getServerUser()
  if (!user) {
    redirect('/login')
  }

  const supabase = createServerSupabaseClient()
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
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2 text-foreground font-bold font-serif text-base">
              <Users className="w-5 h-5 text-primary" /> Learning Cohorts
            </div>
            <span className="text-xs text-muted-foreground">Community Spaces</span>
          </div>

          <div className="space-y-3">
            {cohortsList.map((cohort) => (
              <div
                key={cohort.id}
                className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold font-serif text-foreground">{cohort.name}</h3>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                    {cohort.memberCount} Members
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-snug">
                  {cohort.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Friends Accountability Section */}
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2 text-foreground font-bold font-serif text-base">
              <Shield className="w-5 h-5 text-emerald-500" /> Friend Accountability
            </div>
            <span className="text-xs text-muted-foreground font-mono">
              {friendEntries.length} Friends
            </span>
          </div>

          {friendEntries.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-xs text-muted-foreground italic">
                You haven&apos;t added any study friends yet. Add friends using their handle to compare weekly consistency!
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {friendEntries.map((f) => (
                <div
                  key={f.userId}
                  className="p-3 rounded-xl border border-border/60 bg-card/40 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground font-mono">#{f.rank}</span>
                    <span className="font-semibold text-foreground">{f.name || `@${f.username}`}</span>
                  </div>
                  <span className="font-mono text-emerald-500 font-bold">{f.daysStudied} / 7 Days</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
