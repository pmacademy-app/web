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

/**
 * Users workspace filter bar — verification / role / activity / progress /
 * level / joined / last-active filters. All state lives in the URL via
 * `onFiltersChange`; the parent (UsersWorkspace) serializes it into search
 * params so every filter combination is deep-linkable and server-rendered.
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
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 p-4 rounded-xl bg-admin-surface border border-admin-border">
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
            <span className="text-[10px] font-bold uppercase tracking-wider text-admin-fg-subtle">Activity</span>
            <select
              value={filters.activity || ''}
              onChange={(e) => set({ activity: (e.target.value || undefined) as AdminUserFilters['activity'] })}
              className={cn(selectClass, 'w-full')}
            >
              <option value="">All</option>
              <option value="active">Active (30d)</option>
              <option value="inactive">Inactive (30d)</option>
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
            <span className="text-[10px] font-bold uppercase tracking-wider text-admin-fg-subtle">Min level</span>
            <input
              type="number"
              min={1}
              value={filters.minLevel ?? ''}
              onChange={(e) => {
                const v = e.target.value
                if (v === '') {
                  set({ minLevel: undefined })
                  return
                }
                // Only apply a valid positive level — don't coerce "0" or
                // garbage input into a filter.
                const n = Number.parseInt(v, 10)
                set({ minLevel: Number.isFinite(n) && n >= 1 ? n : undefined })
              }}
              placeholder="Any"
              className={cn(selectClass, 'w-full')}
            />
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

          <label className="space-y-1.5 col-span-2 md:col-span-3 xl:col-span-6">
            <span className="text-[10px] font-bold uppercase tracking-wider text-admin-fg-subtle">Last active</span>
            <div className="flex items-center gap-1.5 max-w-md">
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
      )}
    </div>
  )
}