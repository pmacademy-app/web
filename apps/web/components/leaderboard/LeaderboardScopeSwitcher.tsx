'use client'

import React, { useState, useCallback } from 'react'
import { Globe2, Users, Shield, Loader2, AlertTriangle, RotateCw } from 'lucide-react'
import { LeaderboardTable } from './LeaderboardTable'
import type { LeaderboardEntry } from '@/lib/leaderboard'
import type { CohortItemPayload } from '@/lib/leaderboard-db'
import { cn } from '@/lib/utils'

type Scope = 'global' | 'cohort' | 'friends'

interface CohortScopeState {
  entries: LeaderboardEntry[]
  personalEntry: LeaderboardEntry | null
  cohortName: string | null
}

interface LeaderboardScopeSwitcherProps {
  globalEntries: LeaderboardEntry[]
  globalPersonalEntry: LeaderboardEntry | null
  weekStart: string
  joinedCohorts: CohortItemPayload[]
  friendEntries: LeaderboardEntry[]
}

export function LeaderboardScopeSwitcher({
  globalEntries,
  globalPersonalEntry,
  weekStart,
  joinedCohorts,
  friendEntries,
}: LeaderboardScopeSwitcherProps) {
  const [scope, setScope] = useState<Scope>('global')
  const [selectedCohortId, setSelectedCohortId] = useState<string | null>(joinedCohorts[0]?.id ?? null)
  const [cohortCache, setCohortCache] = useState<Record<string, CohortScopeState>>({})
  const [loadingCohortId, setLoadingCohortId] = useState<string | null>(null)
  const [cohortError, setCohortError] = useState<string | null>(null)

  const fetchCohortLeaderboard = useCallback(async (cohortId: string) => {
    setLoadingCohortId(cohortId)
    setCohortError(null)
    try {
      const res = await fetch(`/api/leaderboard?scope=cohort&cohortId=${encodeURIComponent(cohortId)}`)
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to load cohort rankings.')
      }
      setCohortCache((prev) => ({
        ...prev,
        [cohortId]: {
          entries: data.entries,
          personalEntry: data.personalEntry,
          cohortName: data.cohortName,
        },
      }))
    } catch (err) {
      setCohortError(err instanceof Error ? err.message : 'Failed to load cohort rankings.')
    } finally {
      setLoadingCohortId(null)
    }
  }, [])

  const handleScopeChange = (nextScope: Scope) => {
    setScope(nextScope)
    if (nextScope === 'cohort' && selectedCohortId && !cohortCache[selectedCohortId]) {
      fetchCohortLeaderboard(selectedCohortId)
    }
  }

  const handleCohortSelect = (cohortId: string) => {
    setSelectedCohortId(cohortId)
    if (!cohortCache[cohortId]) {
      fetchCohortLeaderboard(cohortId)
    }
  }

  const activeCohort = selectedCohortId ? cohortCache[selectedCohortId] : undefined
  const isLoadingCohort = scope === 'cohort' && selectedCohortId === loadingCohortId

  const tabs: { key: Scope; label: string; icon: React.ElementType }[] = [
    { key: 'global', label: 'Global', icon: Globe2 },
    { key: 'cohort', label: 'Cohort', icon: Users },
    { key: 'friends', label: 'Friends', icon: Shield },
  ]

  let activeEntries: LeaderboardEntry[] = globalEntries
  let activePersonalEntry: LeaderboardEntry | null = globalPersonalEntry
  let emptyStateOverride: { title: string; description: string } | undefined

  if (scope === 'cohort') {
    if (joinedCohorts.length === 0) {
      activeEntries = []
      emptyStateOverride = {
        title: 'Join a Cohort to See Cohort Rankings',
        description: 'You are not currently a member of any cohort. Join a learning cohort below to unlock cohort-scoped rankings.',
      }
    } else if (activeCohort) {
      activeEntries = activeCohort.entries
      activePersonalEntry = activeCohort.personalEntry
    } else {
      activeEntries = []
    }
  } else if (scope === 'friends') {
    activeEntries = friendEntries
    activePersonalEntry = friendEntries.find((e) => e.isCurrentUser) ?? null
    if (friendEntries.length <= 1) {
      emptyStateOverride = {
        title: 'No Friends Added Yet',
        description: 'Add study friends below to compare your weekly consistency with people you know.',
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div className="inline-flex items-center gap-1 p-1 rounded-xl border border-border bg-muted/40 w-full sm:w-auto overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = scope === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleScopeChange(tab.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors',
                  isActive
                    ? 'bg-background text-foreground shadow-xs border border-border'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {scope === 'cohort' && joinedCohorts.length > 1 && (
          <select
            value={selectedCohortId ?? ''}
            onChange={(e) => handleCohortSelect(e.target.value)}
            className="text-xs font-semibold px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {joinedCohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}

        {activePersonalEntry && (
          <span className="text-xs font-mono font-bold text-primary shrink-0">
            Your Rank: #{activePersonalEntry.rank}
          </span>
        )}
      </div>

      {scope === 'cohort' && isLoadingCohort ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center space-y-3">
          <Loader2 className="w-6 h-6 text-primary mx-auto animate-spin" />
          <p className="text-xs text-muted-foreground">Loading cohort rankings…</p>
        </div>
      ) : scope === 'cohort' && cohortError ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-8 text-center space-y-3">
          <AlertTriangle className="w-6 h-6 text-rose-500 mx-auto" />
          <p className="text-xs text-rose-600 dark:text-rose-400">{cohortError}</p>
          <button
            type="button"
            onClick={() => selectedCohortId && fetchCohortLeaderboard(selectedCohortId)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold hover:bg-secondary transition-colors"
          >
            <RotateCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      ) : emptyStateOverride ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center space-y-3">
          <Users className="w-8 h-8 text-muted-foreground mx-auto opacity-50" />
          <h3 className="text-base font-bold font-serif text-foreground">{emptyStateOverride.title}</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">{emptyStateOverride.description}</p>
        </div>
      ) : (
        <LeaderboardTable entries={activeEntries} />
      )}

      <p className="text-[10px] text-muted-foreground font-mono">
        {scope === 'global' && `Global rankings — Week of ${weekStart}`}
        {scope === 'cohort' && activeCohort?.cohortName && `${activeCohort.cohortName} — Week of ${weekStart}`}
        {scope === 'friends' && `Friends rankings — Week of ${weekStart}`}
      </p>
    </div>
  )
}
