'use client'

import React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Medal, Award, Trophy, AlertTriangle } from 'lucide-react'
import { AdminPageShell } from './AdminPageShell'
import { AdminKpiCard } from './AdminKpiCard'
import { AdminSearchInput } from './AdminSearchInput'
import { AdminLoadWarning } from './AdminLoadWarning'
import { AdminEmptyState } from './AdminEmptyState'
import { AdminBadgeCard } from './AdminBadgeCard'
import { BadgeDetailDrawer } from './BadgeDetailDrawer'
import { BADGE_CATEGORIES } from '@/config/badges'
import type {
  AdminBadgeKpis,
  AdminBadgeOverview,
  AdminBadgeSortKey,
} from '@/lib/admin/achievements-aggregation'
import type { AdminBadgeDetail } from '@/lib/admin/achievements-service'

interface BadgesWorkspaceProps {
  initialBadges: AdminBadgeOverview[]
  kpis: AdminBadgeKpis
  loadFailed: boolean
  initialSearch: string
  initialCategory: string | null
  initialSortKey: AdminBadgeSortKey
  initialSortDir: 'asc' | 'desc'
  selectedBadgeKey: string | null
  selectedBadgeDetail: AdminBadgeDetail | null
}

export function BadgesWorkspace({
  initialBadges,
  kpis,
  loadFailed,
  initialSearch,
  initialCategory,
  initialSortKey,
  initialSortDir,
  selectedBadgeKey,
  selectedBadgeDetail,
}: BadgesWorkspaceProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const pushParams = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === '') next.delete(key)
      else next.set(key, value)
    }
    router.push(`/admin/achievements/badges${next.toString() ? `?${next.toString()}` : ''}`, { scroll: false })
  }

  const handleSearch = (value: string) => pushParams({ search: value || undefined })
  const handleCategory = (category: string | null) => pushParams({ category: category || undefined })
  const handleSort = (key: AdminBadgeSortKey) => {
    const nextDir = initialSortKey === key && initialSortDir === 'asc' ? 'desc' : 'asc'
    pushParams({ sort: key, sortDir: nextDir })
  }

  const handleSelectBadge = (key: string) => pushParams({ badge: key })
  const handleCloseDrawer = () => pushParams({ badge: undefined })

  return (
    <AdminPageShell
      title="Badges"
      description="Badge definitions, award counts and recent earners."
      icon={Medal}
      kpis={
        <>
          <AdminKpiCard
            title="Total Badges"
            value={kpis.totalBadges.toLocaleString()}
            subtitle="Configured badge definitions"
            icon={Medal}
            iconColor="text-admin-accent"
          />
          <AdminKpiCard
            title="Total Awards"
            value={kpis.totalAwards.toLocaleString()}
            subtitle="Badges earned by learners"
            icon={Award}
            iconColor="text-admin-success"
          />
          <AdminKpiCard
            title="Most Awarded"
            value={kpis.mostAwarded ? kpis.mostAwarded.name : '—'}
            subtitle={kpis.mostAwarded ? `${kpis.mostAwarded.count.toLocaleString()} learners` : 'No badges earned yet'}
            icon={Trophy}
            iconColor="text-admin-warning"
          />
        </>
      }
      toolbar={
        <>
          <AdminSearchInput
            value={initialSearch}
            onValueChange={handleSearch}
            placeholder="Search badges by name or description..."
            aria-label="Search badges"
            className="flex-1 min-w-52"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleCategory(null)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors ${
                !initialCategory
                  ? 'bg-admin-accent-soft text-admin-accent border border-admin-accent/25'
                  : 'bg-admin-surface text-admin-fg-muted hover:text-admin-fg border border-admin-border'
              }`}
            >
              All
            </button>
            {BADGE_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors ${
                  initialCategory === cat.id
                    ? 'bg-admin-accent-soft text-admin-accent border border-admin-accent/25'
                    : 'bg-admin-surface text-admin-fg-muted hover:text-admin-fg border border-admin-border'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </>
      }
    >
      {loadFailed && (
        <AdminLoadWarning message="Live badge award counts could not be loaded. Showing definitions only." />
      )}

      <div className="flex items-center gap-2 text-xs text-admin-fg-subtle font-mono">
        <span>{initialBadges.length.toLocaleString()} badges</span>
        <span className="text-admin-fg-subtle/50">·</span>
        <button
          type="button"
          onClick={() => handleSort('awardCount')}
          aria-pressed={initialSortKey === 'awardCount'}
          className={`transition-colors ${initialSortKey === 'awardCount' ? 'text-admin-accent font-bold' : 'hover:text-admin-fg'}`}
        >
          Sort by awards {initialSortKey === 'awardCount' ? (initialSortDir === 'asc' ? '↑' : '↓') : ''}
        </button>
        <button
          type="button"
          onClick={() => handleSort('name')}
          aria-pressed={initialSortKey === 'name'}
          className={`transition-colors ${initialSortKey === 'name' ? 'text-admin-accent font-bold' : 'hover:text-admin-fg'}`}
        >
          Sort by name {initialSortKey === 'name' ? (initialSortDir === 'asc' ? '↑' : '↓') : ''}
        </button>
      </div>

      {initialBadges.length === 0 ? (
        <AdminEmptyState
          icon={AlertTriangle}
          title="No badges found"
          description="No badge definitions match your active search or category filter."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {initialBadges.map((badge) => (
            <AdminBadgeCard key={badge.key} badge={badge} onSelect={() => handleSelectBadge(badge.key)} />
          ))}
        </div>
      )}

      <BadgeDetailDrawer
        badgeKey={selectedBadgeKey}
        badge={selectedBadgeDetail}
        isOpen={Boolean(selectedBadgeKey)}
        onClose={handleCloseDrawer}
      />
    </AdminPageShell>
  )
}