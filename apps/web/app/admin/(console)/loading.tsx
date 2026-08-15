import React from 'react'

/**
 * Admin console loading state — skeleton matching the dashboard layout so
 * navigation feels instant and layout shift is minimized.
 */
export default function AdminConsoleLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading admin console">
      {/* Page header skeleton */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-admin-border pb-5">
        <div className="space-y-2">
          <div className="h-7 w-56 rounded-lg bg-admin-surface-raised border border-admin-border animate-pulse" />
          <div className="h-4 w-72 rounded bg-admin-surface-raised border border-admin-border animate-pulse" />
        </div>
        <div className="h-9 w-64 rounded-lg bg-admin-surface-raised border border-admin-border animate-pulse" />
      </div>

      {/* Attention skeleton */}
      <div className="p-5 rounded-xl bg-admin-surface border border-admin-border">
        <div className="h-4 w-40 rounded bg-admin-surface-raised border border-admin-border animate-pulse mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-admin-bg/60 border border-admin-border animate-pulse" />
          ))}
        </div>
      </div>

      {/* KPI grid skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="p-5 rounded-xl bg-admin-surface border border-admin-border space-y-3 animate-pulse"
          >
            <div className="h-3 w-24 rounded bg-admin-surface-raised border border-admin-border" />
            <div className="h-8 w-20 rounded bg-admin-surface-raised border border-admin-border" />
            <div className="h-3 w-32 rounded bg-admin-surface-raised border border-admin-border" />
          </div>
        ))}
      </div>

      {/* Charts skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[0, 1].map((i) => (
          <div key={i} className="p-5 rounded-xl bg-admin-surface border border-admin-border">
            <div className="h-4 w-40 rounded bg-admin-surface-raised border border-admin-border animate-pulse mb-4" />
            <div className="h-64 rounded-lg bg-admin-bg/40 border border-admin-border animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}