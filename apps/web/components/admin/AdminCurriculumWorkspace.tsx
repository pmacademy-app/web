'use client'

import React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  BookOpen,
  Layers,
  HelpCircle,
  Layers as CardsIcon,
  Trophy,
} from 'lucide-react'
import { AdminPageShell } from './AdminPageShell'
import { AdminKpiCard } from './AdminKpiCard'
import { AdminSearchInput } from './AdminSearchInput'
import { AdminEmptyState } from './AdminEmptyState'
import { AdminModuleCard } from './AdminModuleCard'
import { AdminLoadWarning } from './AdminLoadWarning'
import { cn } from '@/lib/utils'
import type { AdminCurriculumKpis, AdminModuleOverview } from '@/lib/admin/types'

interface AdminCurriculumWorkspaceProps {
  initialModules: AdminModuleOverview[]
  initialKpis: AdminCurriculumKpis
  initialSearch: string
  /** True when the live completion query failed (renders a warning banner). */
  initialLoadFailed?: boolean
  totalLearners: number
  totalLessonsCompleted: number
}

/** Module activity filter (spec §4.2 "[Search] [Filters]"). */
type ActivityFilter = 'all' | 'started' | 'none'

const ACTIVITY_FILTERS: Array<{ key: ActivityFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'started', label: 'Has activity' },
  { key: 'none', label: 'No activity' },
]

function matchesActivityFilter(module: AdminModuleOverview, filter: ActivityFilter): boolean {
  if (filter === 'started') return module.learnersStarted > 0
  if (filter === 'none') return module.learnersStarted === 0
  return true
}

/**
 * Curriculum overview workspace (spec §4.2).
 *
 * Client wrapper owning the `?search=` / `?activity=` params — the server page
 * renders the initial data, this component handles search/filter round-trips
 * and navigation. Static content always renders; a failed live query shows a
 * warning banner above it instead of hiding the modules.
 */
export function AdminCurriculumWorkspace({
  initialModules,
  initialKpis,
  initialSearch,
  initialLoadFailed = false,
  totalLearners,
  totalLessonsCompleted,
}: AdminCurriculumWorkspaceProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const pushParams = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === '') next.delete(key)
      else next.set(key, value)
    }
    router.push(`/admin/curriculum${next.toString() ? `?${next.toString()}` : ''}`, { scroll: false })
  }

  const handleSearch = (value: string) => pushParams({ search: value || undefined })

  const activityParam = searchParams.get('activity')
  const activity: ActivityFilter =
    activityParam === 'started' || activityParam === 'none' ? activityParam : 'all'
  const handleActivity = (key: ActivityFilter) =>
    pushParams({ activity: key === 'all' ? undefined : key })

  const query = initialSearch.trim().toLowerCase()
  const filtered = initialModules.filter((m) => {
    const matchesSearch = query ? m.name.toLowerCase().includes(query) : true
    return matchesSearch && matchesActivityFilter(m, activity)
  })

  return (
    <AdminPageShell
      title="Curriculum"
      description={`Browse the ${initialModules.length}-module PM Academy curriculum, inspect lessons, and preview learner content.`}
      icon={BookOpen}
      kpiGridClassName="lg:grid-cols-5"
      kpis={
        <>
          <AdminKpiCard
            title="Modules"
            value={initialKpis.modules}
            subtitle="Curriculum modules"
            icon={Layers}
            iconColor="text-admin-accent"
          />
          <AdminKpiCard
            title="Lessons"
            value={initialKpis.lessons.toLocaleString()}
            subtitle="Total lessons"
            icon={BookOpen}
            iconColor="text-admin-info"
          />
          <AdminKpiCard
            title="Quiz Questions"
            value={initialKpis.quizzes.toLocaleString()}
            subtitle="Across all lessons"
            icon={HelpCircle}
            iconColor="text-admin-warning"
          />
          <AdminKpiCard
            title="Flashcards"
            value={initialKpis.flashcards.toLocaleString()}
            subtitle="Across all lessons"
            icon={CardsIcon}
            iconColor="text-admin-success"
          />
          <AdminKpiCard
            title="Capstones"
            value={initialKpis.capstones}
            subtitle="Module capstone projects"
            icon={Trophy}
            iconColor="text-admin-danger"
          />
        </>
      }
      toolbar={
        <>
          <AdminSearchInput
            value={initialSearch}
            onValueChange={handleSearch}
            placeholder="Search modules..."
            aria-label="Search modules"
            className="flex-1 min-w-52"
          />
          <div
            className="flex items-center gap-1 p-1 rounded-lg bg-admin-surface border border-admin-border"
            role="group"
            aria-label="Filter modules by activity"
          >
            {ACTIVITY_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => handleActivity(f.key)}
                aria-pressed={activity === f.key}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer',
                  activity === f.key
                    ? 'bg-admin-accent text-admin-accent-contrast'
                    : 'text-admin-fg-muted hover:text-admin-fg hover:bg-admin-surface-raised'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-admin-fg-subtle font-mono shrink-0">
            {filtered.length} of {initialModules.length} modules
          </span>
        </>
      }
    >
      {initialLoadFailed && (
        <AdminLoadWarning message="Live completion stats could not be fetched — showing curriculum content without them. Check that the database is reachable." />
      )}

      {filtered.length === 0 ? (
        <AdminEmptyState
          icon={BookOpen}
          title="No modules found"
          description="No modules match your active search or filters."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((module) => (
            <AdminModuleCard key={module.slug} module={module} href={`/admin/curriculum/${module.slug}`} />
          ))}
        </div>
      )}

      {!initialLoadFailed && (
        <p className="text-[11px] text-admin-fg-subtle font-mono">
          {totalLearners.toLocaleString()} learners have completed at least one lesson ·{' '}
          {totalLessonsCompleted.toLocaleString()} lessons completed in total
        </p>
      )}
    </AdminPageShell>
  )
}