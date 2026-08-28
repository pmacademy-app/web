'use client'

import React, { useState } from 'react'
import { Users, Loader2, LogIn, LogOut, Check } from 'lucide-react'
import type { CohortItemPayload } from '@/lib/leaderboard-db'

interface CohortsSectionProps {
  initialCohorts: CohortItemPayload[]
}

export function CohortsSection({ initialCohorts }: CohortsSectionProps) {
  const [cohorts, setCohorts] = useState<CohortItemPayload[]>(initialCohorts)
  const [togglingSlug, setTogglingSlug] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleToggleMembership = async (cohortSlug: string, currentIsMember: boolean) => {
    setTogglingSlug(cohortSlug)
    setErrorMsg(null)

    const action = currentIsMember ? 'leave' : 'join'

    try {
      const res = await fetch('/api/cohorts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cohortSlug, action }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        setErrorMsg(data.error || `Failed to ${action} cohort.`)
        return
      }

      setCohorts((prev) =>
        prev.map((c) => {
          if (c.slug === cohortSlug) {
            const newMember = data.isMember
            return {
              ...c,
              isMember: newMember,
              memberCount: newMember ? c.memberCount + 1 : Math.max(0, c.memberCount - 1),
            }
          }
          return c
        })
      )
    } catch {
      setErrorMsg('Network error while updating cohort membership.')
    } finally {
      setTogglingSlug(null)
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-xs">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2 text-foreground font-bold font-serif text-base">
          <Users className="w-5 h-5 text-primary" /> Learning Cohorts
        </div>
        <span className="text-xs text-muted-foreground font-mono">
          {cohorts.length} Spaces
        </span>
      </div>

      {errorMsg && (
        <div className="p-2.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-xs">
          {errorMsg}
        </div>
      )}

      <div className="space-y-3">
        {cohorts.map((cohort) => {
          const isToggling = togglingSlug === cohort.slug

          return (
            <div
              key={cohort.id}
              className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-3 transition-colors hover:border-border"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold font-serif text-foreground">
                      {cohort.name}
                    </h3>
                    {cohort.isMember && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Joined
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
                    {cohort.memberCount} {cohort.memberCount === 1 ? 'Member' : 'Members'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggleMembership(cohort.slug, cohort.isMember)}
                  disabled={isToggling}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 disabled:opacity-50 ${
                    cohort.isMember
                      ? 'border border-border bg-background hover:bg-rose-500/10 hover:text-rose-600 hover:border-rose-500/30 text-muted-foreground'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90'
                  }`}
                >
                  {isToggling ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : cohort.isMember ? (
                    <LogOut className="w-3.5 h-3.5" />
                  ) : (
                    <LogIn className="w-3.5 h-3.5" />
                  )}
                  {cohort.isMember ? 'Leave Space' : 'Join Space'}
                </button>
              </div>

              <p className="text-xs text-muted-foreground leading-snug">
                {cohort.description}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
