'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import {
  Trophy,
  Search,
  Zap,
  Flame,
  AlertTriangle,
  ExternalLink,
  Shield,
  Eye,
  EyeOff,
  Filter,
  CheckCircle2,
} from 'lucide-react'
import { AdminKpiCard } from './AdminKpiCard'
import { AdminPageHeader } from './AdminPageHeader'
import { AdminStatusBadge } from './AdminStatusBadge'
import { type AdminLeaderboardData, type AdminLeaderboardUser } from '@/lib/admin/leaderboard-admin-service'
import { getLeaderboardTier } from '@/lib/leaderboard'
import { cn } from '@/lib/utils'

interface AdminLeaderboardViewProps {
  initialData: AdminLeaderboardData
}

const TIERS = ['all', 'Fellow', 'Diamond', 'Gold', 'Silver', 'Bronze']

export function AdminLeaderboardView({ initialData }: AdminLeaderboardViewProps) {
  const [data, setData] = useState<AdminLeaderboardData>(initialData)
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState('all')
  const [showAnomaliesOnly, setShowAnomaliesOnly] = useState(false)

  const filteredEntries = data.entries.filter((entry) => {
    if (showAnomaliesOnly && !entry.isAnomaly) return false
    if (tierFilter !== 'all' && entry.tier?.toLowerCase() !== tierFilter.toLowerCase()) return false
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      const matchName = entry.name && entry.name.toLowerCase().includes(q)
      const matchUser = entry.username && entry.username.toLowerCase().includes(q)
      const matchEmail = entry.email && entry.email.toLowerCase().includes(q)
      if (!matchName && !matchUser && !matchEmail) return false
    }
    return true
  })

  const anomalyCount = data.entries.filter((e) => e.isAnomaly).length

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Leaderboard & Engagement"
        description="Monitor weekly XP velocity, user tier distribution, privacy opt-outs, and scoring anomalies."
        icon={Trophy}
      />

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminKpiCard
          title="Active Learners"
          value={data.totalLearners.toLocaleString()}
          subtitle={`Week of ${data.weekStart}`}
          icon={Trophy}
        />
        <AdminKpiCard
          title="Weekly XP Awarded"
          value={data.totalWeeklyXp.toLocaleString()}
          subtitle="Total XP in current weekly window"
          icon={Zap}
          iconColor="text-admin-accent"
        />
        <AdminKpiCard
          title="Opted-In Learners"
          value={data.entries.filter((e) => e.isOptedIn).length.toLocaleString()}
          subtitle="Publicly visible on leaderboard"
          icon={Eye}
          iconColor="text-admin-success"
        />
        <AdminKpiCard
          title="Flagged Anomalies"
          value={anomalyCount.toString()}
          subtitle={anomalyCount > 0 ? 'Review velocity spikes' : 'All scores normal'}
          icon={AlertTriangle}
          iconColor={anomalyCount > 0 ? 'text-admin-danger' : 'text-admin-fg-muted'}
        />
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-xl bg-admin-surface border border-admin-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto flex-1">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-4 h-4 text-admin-fg-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, @username, email..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-admin-bg border border-admin-border rounded-lg text-admin-fg placeholder:text-admin-fg-muted focus:outline-none focus:border-admin-accent"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-admin-fg-muted" />
            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
              className="text-xs bg-admin-bg border border-admin-border rounded-lg px-2.5 py-1.5 text-admin-fg focus:outline-none focus:border-admin-accent"
            >
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {t === 'all' ? 'All Tiers' : `${t} Tier`}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {anomalyCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAnomaliesOnly(!showAnomaliesOnly)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1.5',
                showAnomaliesOnly
                  ? 'bg-admin-danger/15 border-admin-danger/40 text-admin-danger'
                  : 'bg-admin-surface border-admin-border text-admin-fg-muted hover:text-admin-fg'
              )}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Anomalies Only ({anomalyCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* Leaderboard Table */}
      <div className="rounded-xl border border-admin-border bg-admin-surface overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-admin-border bg-admin-surface-raised/40 text-[11px] font-bold uppercase tracking-wider text-admin-fg-muted">
                <th className="py-3 px-4 w-16 text-center">Rank</th>
                <th className="py-3 px-4">Learner</th>
                <th className="py-3 px-4 text-center">Tier</th>
                <th className="py-3 px-4 text-center">Consistency (Days)</th>
                <th className="py-3 px-4 text-center">Lessons</th>
                <th className="py-3 px-4 text-center">Weekly XP</th>
                <th className="py-3 px-4 text-center">Streak</th>
                <th className="py-3 px-4 text-center">Privacy</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-admin-border/60 text-xs">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-admin-fg-muted">
                    No learners match the current search/filter criteria.
                  </td>
                </tr>
              ) : (
                filteredEntries.map((entry) => {
                  const tierInfo = getLeaderboardTier(entry.level, entry.totalXp ?? entry.xpEarned)

                  return (
                    <tr
                      key={entry.userId}
                      className={cn(
                        'transition-colors hover:bg-admin-surface-raised/40',
                        entry.isAnomaly && 'bg-admin-danger/5'
                      )}
                    >
                      <td className="py-3 px-4 text-center font-mono font-bold text-admin-fg">
                        #{entry.rank}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-admin-accent-soft text-admin-accent font-bold flex items-center justify-center shrink-0 uppercase text-[11px]">
                            {entry.name ? entry.name[0] : (entry.username ? entry.username[0] : 'U')}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-admin-fg truncate">
                                {entry.name || `@${entry.username}`}
                              </span>
                              {entry.isAnomaly && (
                                <span className="px-1.5 py-0.2 rounded bg-admin-danger/20 text-admin-danger text-[9px] font-bold" title={entry.anomalyReason || 'Anomaly'}>
                                  Anomaly
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-admin-fg-muted block truncate font-mono">
                              {entry.email || `@${entry.username}`}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span className={cn('text-[10px] font-bold uppercase px-2 py-0.5 rounded border', tierInfo.badgeColor)}>
                          {tierInfo.tier}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center font-mono font-semibold text-admin-fg">
                        {entry.daysStudied} / 7d
                      </td>

                      <td className="py-3 px-4 text-center font-mono font-semibold text-admin-fg">
                        {entry.lessonsCompleted}
                      </td>

                      <td className="py-3 px-4 text-center font-mono font-bold text-admin-accent">
                        +{entry.xpEarned}
                      </td>

                      <td className="py-3 px-4 text-center font-mono font-bold text-amber-400">
                        {entry.currentStreak}d
                      </td>

                      <td className="py-3 px-4 text-center">
                        {entry.isOptedIn ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-semibold">
                            <Eye className="w-3 h-3" /> Public
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] text-admin-fg-muted font-semibold">
                            <EyeOff className="w-3 h-3" /> Hidden
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/admin/users?userId=${entry.userId}`}
                            className="px-2.5 py-1 rounded bg-admin-bg hover:bg-admin-surface-raised text-[11px] font-semibold text-admin-fg border border-admin-border transition-colors"
                          >
                            Inspect
                          </Link>
                          {entry.username && (
                            <Link
                              href={`/p/${entry.username}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 text-admin-fg-muted hover:text-admin-fg rounded transition-colors"
                              title="View portfolio"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
