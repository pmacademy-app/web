import React from 'react'
import { cn } from '@/lib/utils'

/**
 * Suspense fallbacks for the streamed overview blocks (Admin R6 B3).
 *
 * Each skeleton matches the footprint of the block it stands in for, so the page does
 * not shift when a block resolves. They are static placeholders: the pulse is limited
 * to `motion-safe` and the admin reduced-motion rule turns it off entirely.
 */
function SkeletonCard({ className, label }: { className: string; label?: string }) {
  return (
    <div
      {...(label ? { role: 'status', 'aria-label': `Loading ${label}` } : { 'aria-hidden': true })}
      className={cn(
        'w-full rounded-xl border border-admin-border bg-admin-surface/40 motion-safe:animate-pulse',
        className
      )}
    />
  )
}

export function OverviewAttentionSkeleton() {
  return <SkeletonCard className="h-[11rem]" label="attention items" />
}

export function OverviewKpisSkeleton() {
  return (
    <div role="status" aria-label="Loading key metrics" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 8 }, (_, index) => (
        <SkeletonCard key={index} className="h-[8.5rem]" />
      ))}
    </div>
  )
}

export function OverviewChartsSkeleton() {
  return (
    <div role="status" aria-label="Loading activity charts" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <SkeletonCard className="h-[22rem]" />
      <SkeletonCard className="h-[22rem]" />
    </div>
  )
}

export function OverviewFunnelSkeleton() {
  return <SkeletonCard className="h-[26rem]" label="learning funnel" />
}

export function OverviewRecentActivitySkeleton() {
  return <SkeletonCard className="h-[26rem]" label="recent activity" />
}

export function OverviewSystemSnapshotSkeleton() {
  return <SkeletonCard className="h-[30rem]" label="system snapshot" />
}
