'use client'

import React from 'react'
import Link from 'next/link'
import { Trophy, Flame, Zap, ArrowUp, ArrowDown, Minus, ExternalLink, Shield } from 'lucide-react'
import { type LeaderboardEntry, getLeaderboardTier } from '@/lib/leaderboard'
import { cn } from '@/lib/utils'

interface LeaderboardTableProps {
  entries: LeaderboardEntry[]
  onCompare?: (entry: LeaderboardEntry) => void
}

export function LeaderboardTable({ entries, onCompare }: LeaderboardTableProps) {
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center space-y-3">
        <Trophy className="w-10 h-10 text-muted-foreground mx-auto opacity-50" />
        <h3 className="text-base font-bold font-serif text-foreground">No Rankings Recorded Yet</h3>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          Complete a lesson or quiz this week to appear on the consistency leaderboard!
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
      {/* Mobile card layout */}
      <div className="sm:hidden divide-y divide-border/60">
        {entries.map((entry) => {
          const isTop3 = entry.rank <= 3
          const tierInfo = getLeaderboardTier(entry.level, entry.totalXp ?? entry.xpEarned)
          return (
            <div
              key={entry.userId}
              className={cn('p-4 space-y-2.5', entry.isCurrentUser && 'bg-primary/5')}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'w-8 h-8 rounded-full border flex items-center justify-center font-bold text-xs shrink-0',
                    isTop3
                      ? ['text-amber-500 bg-amber-500/10 border-amber-500/30', 'text-slate-400 bg-slate-400/10 border-slate-400/30', 'text-amber-700 bg-amber-700/10 border-amber-700/30'][entry.rank - 1]
                      : 'text-muted-foreground border-border font-mono'
                  )}
                >
                  {entry.rank}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-foreground text-sm truncate">
                      {entry.name || `@${entry.username}`}
                    </span>
                    <span className={cn('text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border', tierInfo.badgeColor)}>
                      {tierInfo.tier}
                    </span>
                    {entry.isCurrentUser && (
                      <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-primary text-primary-foreground">
                        You
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground block truncate">
                    {entry.levelTitle} • Level {entry.level}
                  </span>
                </div>
                {entry.username && (
                  <Link
                    href={`/p/${entry.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 text-muted-foreground hover:text-foreground rounded-md transition-colors shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-muted/40 py-1.5">
                  <div className="text-[9px] text-muted-foreground uppercase font-semibold">Days</div>
                  <div className="text-xs font-bold font-mono text-emerald-500">{entry.daysStudied}/7</div>
                </div>
                <div className="rounded-lg bg-muted/40 py-1.5">
                  <div className="text-[9px] text-muted-foreground uppercase font-semibold">XP</div>
                  <div className="text-xs font-bold font-mono text-primary">+{entry.xpEarned}</div>
                </div>
                <div className="rounded-lg bg-muted/40 py-1.5">
                  <div className="text-[9px] text-muted-foreground uppercase font-semibold">Streak</div>
                  <div className="text-xs font-bold font-mono text-amber-500">{entry.currentStreak}d</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Desktop table layout */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <th className="py-3 px-4 w-16 text-center">Rank</th>
              <th className="py-3 px-4">Learner & Tier</th>
              <th className="py-3 px-4 text-center">Consistency (Days)</th>
              <th className="py-3 px-4 text-center">Lessons</th>
              <th className="py-3 px-4 text-center">Weekly XP</th>
              <th className="py-3 px-4 text-center">Streak</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60 text-xs">
            {entries.map((entry) => {
              const isTop3 = entry.rank <= 3
              const medalColors = [
                'text-amber-500 bg-amber-500/10 border-amber-500/30', // 1st Gold
                'text-slate-400 bg-slate-400/10 border-slate-400/30', // 2nd Silver
                'text-amber-700 bg-amber-700/10 border-amber-700/30', // 3rd Bronze
              ]
              const tierInfo = getLeaderboardTier(entry.level, entry.totalXp ?? entry.xpEarned)

              return (
                <tr
                  key={entry.userId}
                  className={cn(
                    'transition-colors hover:bg-muted/30',
                    entry.isCurrentUser && 'bg-primary/5 font-semibold'
                  )}
                >
                  {/* Rank Column */}
                  <td className="py-3 px-4 text-center font-serif font-bold">
                    <div className="flex items-center justify-center gap-1">
                      {isTop3 ? (
                        <div
                          className={cn(
                            'w-7 h-7 rounded-full border flex items-center justify-center font-bold text-xs shadow-xs',
                            medalColors[entry.rank - 1]
                          )}
                        >
                          {entry.rank}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground font-mono">#{entry.rank}</span>
                      )}

                      {/* Rank Change Arrow */}
                      {entry.positionChange > 0 && (
                        <span className="text-[10px] text-emerald-500 font-bold flex items-center" title={`Up ${entry.positionChange} ranks`}>
                          <ArrowUp className="w-3 h-3" />
                        </span>
                      )}
                      {entry.positionChange < 0 && (
                        <span className="text-[10px] text-rose-500 font-bold flex items-center" title={`Down ${Math.abs(entry.positionChange)} ranks`}>
                          <ArrowDown className="w-3 h-3" />
                        </span>
                      )}
                      {entry.positionChange === 0 && (
                        <span className="text-[10px] text-muted-foreground/50" title="Same rank">
                          <Minus className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Learner Info & Tier */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 text-primary font-bold flex items-center justify-center shrink-0 uppercase font-mono text-xs">
                        {entry.name ? entry.name[0] : (entry.username ? entry.username[0] : 'P')}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-foreground truncate">
                            {entry.name || `@${entry.username}`}
                          </span>
                          <span className={cn('text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border', tierInfo.badgeColor)}>
                            {tierInfo.tier}
                          </span>
                          {entry.isCurrentUser && (
                            <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-primary text-primary-foreground">
                              You
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground font-sans block truncate mt-0.5">
                          {entry.levelTitle} • Level {entry.level}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* Days Studied */}
                  <td className="py-3 px-4 text-center">
                    <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-bold font-mono text-xs">
                      <span>{entry.daysStudied} / 7 Days</span>
                    </div>
                  </td>

                  {/* Lessons Completed */}
                  <td className="py-3 px-4 text-center font-mono font-bold text-foreground">
                    {entry.lessonsCompleted}
                  </td>

                  {/* Weekly XP */}
                  <td className="py-3 px-4 text-center">
                    <span className="inline-flex items-center gap-1 font-mono font-bold text-primary">
                      <Zap className="w-3 h-3" /> +{entry.xpEarned}
                    </span>
                  </td>

                  {/* Streak */}
                  <td className="py-3 px-4 text-center">
                    <span className="inline-flex items-center gap-1 font-mono font-bold text-amber-500">
                      <Flame className="w-3.5 h-3.5" /> {entry.currentStreak}d
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {onCompare && !entry.isCurrentUser && (
                        <button
                          type="button"
                          onClick={() => onCompare(entry)}
                          className="px-2.5 py-1 rounded-md border border-border bg-background hover:bg-secondary text-[11px] font-semibold text-foreground transition-colors"
                        >
                          Compare
                        </button>
                      )}

                      {entry.username && (
                        <Link
                          href={`/p/${entry.username}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-muted-foreground hover:text-foreground rounded-md transition-colors"
                          title={`View @${entry.username}'s public portfolio`}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
