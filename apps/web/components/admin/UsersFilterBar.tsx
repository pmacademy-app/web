'use client'

import React from 'react'
import { SlidersHorizontal, RotateCcw } from 'lucide-react'
import { AdminDatePicker } from './AdminDatePicker'
import { describeUserFilter } from '@/lib/admin/users-aggregation'
import type { AdminUserFilters } from '@/lib/admin/types'
import { cn } from '@/lib/utils'

interface UsersFilterBarProps {
  filters: AdminUserFilters
  onFiltersChange: (filters: AdminUserFilters) => void
  onClear: () => void
}

const selectClass =
  'h-9 rounded-lg border border-admin-border bg-admin-surface px-2.5 text-xs text-admin-fg transition-colors outline-none focus-visible:border-admin-accent/60 focus-visible:ring-2 focus-visible:ring-admin-accent/30'

const ACTIVITY_DAYS_OPTIONS = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
  { value: '60', label: '60 days' },
  { value: '90', label: '90 days' },
]

/**
 * Users workspace filter bar — verification / role / activity / progress /
 * onboarding / level / joined / last-active filters. All state lives in the URL via
 * `onFiltersChange`; the parent (UsersWorkspace) serializes it into search
 * params so every filter combination is deep-linkable and server-rendered.
 *
 * All filters applied here are server-side and correctly enforced in the
 * shared `user-filter-query.ts` layer.
 */
export function UsersFilterBar({ filters, onFiltersChange, onClear }: UsersFilterBarProps) {
  const [expanded, setExpanded] = React.useState(false)
  const activeChips = describeUserFilter(filters)
  const hasActiveFilters = activeChips.length > 0

  const set = (patch: Partial<AdminUserFilters>) => onFiltersChange({ ...filters, ...patch })

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className={cn(
            'inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-xs font-semibold transition-colors cursor-pointer',
            expanded || hasActiveFilters
              ? 'bg-admin-accent-soft text-admin-accent border-admin-accent/25'
              : 'bg-admin-surface text-admin-fg-muted border-admin-border hover:text-admin-fg'
          )}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filters
          {hasActiveFilters && (
            <span className="px-1.5 rounded-full bg-admin-accent text-admin-accent-fg text-[10px] font-bold">
              {activeChips.length}
            </span>
          )}
        </button>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-admin-border bg-admin-surface text-xs font-semibold text-admin-fg-muted hover:text-admin-danger hover:border-admin-danger/30 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Clear all
          </button>
        )}

        {activeChips.map((chip) => (
          <span
            key={chip}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-admin-surface-raised border border-admin-border text-[11px] font-semibold text-admin-fg-muted"
          >
            {chip}
          </span>
        ))}
      </div>

      {expanded && (
        <div className="space-y-4 p-4 rounded-xl bg-admin-surface border border-admin-border">
          {/* Row 1 — Basic account filters */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            <label className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-admin-fg-subtle">Verification</span>
              <select
                value={filters.verification || ''}
                onChange={(e) => set({ verification: (e.target.value || undefined) as AdminUserFilters['verification'] })}
                className={cn(selectClass, 'w-full')}
              >
                <option value="">All</option>
                <option value="verified">Verified</option>
                <option value="unverified">Unverified</option>
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-admin-fg-subtle">Role</span>
              <select
                value={filters.role || ''}
                onChange={(e) => set({ role: (e.target.value || undefined) as AdminUserFilters['role'] })}
                className={cn(selectClass, 'w-full')}
              >
                <option value="">All</option>
                <option value="admin">Admins</option>
                <option value="learner">Learners</option>
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-admin-fg-subtle">Progress</span>
              <select
                value={filters.progress || ''}
                onChange={(e) => set({ progress: (e.target.value || undefined) as AdminUserFilters['progress'] })}
                className={cn(selectClass, 'w-full')}
              >
                <option value="">All</option>
                <option value="none">No progress</option>
                <option value="started">In progress</option>
                <option value="completed">Completed</option>
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-admin-fg-subtle">Onboarding</span>
              <select
                value={filters.onboardingStatus || ''}
                onChange={(e) => set({ onboardingStatus: (e.target.value || undefined) as AdminUserFilters['onboardingStatus'] })}
                className={cn(selectClass, 'w-full')}
              >
                <option value="">All</option>
                <option value="completed">Completed</option>
                <option value="incomplete">Incomplete</option>
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-admin-fg-subtle">Min level</span>
              <input
                type="number"
                min={1}
                value={filters.minLevel ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === '') { set({ minLevel: undefined }); return }
                  const n = Number.parseInt(v, 10)
                  set({ minLevel: Number.isFinite(n) && n >= 1 ? n : undefined })
                }}
                placeholder="Any"
                className={cn(selectClass, 'w-full')}
              />
            </label>
          </div>

          {/* Row 2 — Activity period */}
          <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <label className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-admin-fg-subtle">Active in last</span>
              <select
                value={filters.activeLastDays !== undefined ? String(filters.activeLastDays) : (filters.activity === 'active' ? '30' : '')}
                onChange={(e) => {
                  const v = e.target.value
                  if (!v) { set({ activity: undefined, activeLastDays: undefined }); return }
                  set({ activity: undefined, activeLastDays: Number(v) })
                }}
                className={cn(selectClass, 'w-full')}
              >
                <option value="">Any</option>
                {ACTIVITY_DAYS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-admin-fg-subtle">Inactive for</span>
              <select
                value={filters.inactiveLastDays !== undefined ? String(filters.inactiveLastDays) : (filters.activity === 'inactive' ? '30' : '')}
                onChange={(e) => {
                  const v = e.target.value
                  if (!v) { set({ activity: undefined, inactiveLastDays: undefined }); return }
                  set({ activity: undefined, inactiveLastDays: Number(v) })
                }}
                className={cn(selectClass, 'w-full')}
              >
                <option value="">Any</option>
                {ACTIVITY_DAYS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-admin-fg-subtle">Joined</span>
              <div className="flex items-center gap-1.5">
                <AdminDatePicker
                  value={filters.joinedFrom || ''}
                  onValueChange={(v) => set({ joinedFrom: v || undefined })}
                  aria-label="Joined from"
                  className="flex-1"
                />
                <span className="text-admin-fg-subtle text-xs">→</span>
                <AdminDatePicker
                  value={filters.joinedTo || ''}
                  onValueChange={(v) => set({ joinedTo: v || undefined })}
                  aria-label="Joined to"
                  className="flex-1"
                />
              </div>
            </label>

            <label className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-admin-fg-subtle">Last active</span>
              <div className="flex items-center gap-1.5">
                <AdminDatePicker
                  value={filters.activeFrom || ''}
                  onValueChange={(v) => set({ activeFrom: v || undefined })}
                  aria-label="Last active from"
                  className="flex-1"
                />
                <span className="text-admin-fg-subtle text-xs">→</span>
                <AdminDatePicker
                  value={filters.activeTo || ''}
                  onValueChange={(v) => set({ activeTo: v || undefined })}
                  aria-label="Last active to"
                  className="flex-1"
                />
              </div>
            </label>
          </div>
        </div>
      )}
    </div>
  )
}