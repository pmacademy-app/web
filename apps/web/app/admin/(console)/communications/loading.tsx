import React from 'react'

/**
 * Communications workspace loading state — skeleton matching the tab layout.
 */
export default function AdminCommunicationsLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading communications workspace">
      {/* Page header skeleton */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-admin-border pb-5">
        <div className="space-y-2">
          <div className="h-7 w-56 rounded-lg bg-admin-surface-raised border border-admin-border animate-pulse" />
          <div className="h-4 w-80 rounded bg-admin-surface-raised border border-admin-border animate-pulse" />
        </div>
        <div className="h-9 w-40 rounded-lg bg-admin-surface-raised border border-admin-border animate-pulse" />
      </div>

      {/* Tabs skeleton */}
      <div className="flex gap-6 border-b border-admin-border pb-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-4 w-20 rounded bg-admin-surface-raised border border-admin-border animate-pulse" />
        ))}
      </div>

      {/* KPI grid skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="p-5 rounded-xl bg-admin-surface border border-admin-border space-y-3 animate-pulse">
            <div className="h-3 w-24 rounded bg-admin-surface-raised border border-admin-border" />
            <div className="h-8 w-20 rounded bg-admin-surface-raised border border-admin-border" />
            <div className="h-3 w-32 rounded bg-admin-surface-raised border border-admin-border" />
          </div>
        ))}
      </div>

      {/* Content skeleton */}
      <div className="p-5 rounded-xl bg-admin-surface border border-admin-border">
        <div className="h-4 w-40 rounded bg-admin-surface-raised border border-admin-border animate-pulse mb-4" />
        <div className="h-64 rounded-lg bg-admin-bg/40 border border-admin-border animate-pulse" />
      </div>
    </div>
  )
}