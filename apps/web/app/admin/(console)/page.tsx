import React, { Suspense } from 'react'
import { Activity } from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminDashboardRefreshButton } from '@/components/admin/AdminDashboardRefreshButton'
import { AdminRangeSelector } from '@/components/admin/AdminRangeSelector'
import { OverviewAttention } from '@/components/admin/overview/OverviewAttention'
import { OverviewKpis } from '@/components/admin/overview/OverviewKpis'
import { OverviewCharts } from '@/components/admin/overview/OverviewCharts'
import { OverviewFunnel } from '@/components/admin/overview/OverviewFunnel'
import { OverviewRecentActivity } from '@/components/admin/overview/OverviewRecentActivity'
import { OverviewSystemSnapshot } from '@/components/admin/overview/OverviewSystemSnapshot'
import { OverviewNorthStarTile, OverviewNorthStarTileSkeleton } from '@/components/admin/OverviewNorthStarTile'
import {
  OverviewAttentionSkeleton,
  OverviewChartsSkeleton,
  OverviewFunnelSkeleton,
  OverviewKpisSkeleton,
  OverviewRecentActivitySkeleton,
  OverviewSystemSnapshotSkeleton,
} from '@/components/admin/overview/OverviewSkeletons'
import type { AdminDateRangeKey } from '@/lib/admin/types'

export const revalidate = 0

interface AdminDashboardPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

/**
 * Admin overview. The header and range selector render at once; every data block loads
 * through its own cached loader behind its own Suspense boundary, so a slow or failing
 * section never holds up (or blanks) the rest of the page.
 */
export default async function AdminDashboardPage({ searchParams }: AdminDashboardPageProps) {
  const params = await searchParams
  const rangeKey = (params.range as AdminDateRangeKey) || '30d'
  const from = typeof params.from === 'string' ? params.from : null
  const to = typeof params.to === 'string' ? params.to : null
  const range = { rangeKey, from, to }
  // Range-scoped blocks remount on a range change, so their skeleton shows while the new range loads.
  const rangeKeyId = `${rangeKey}|${from ?? ''}|${to ?? ''}`

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={`${greeting}, Admin`}
        description="Here's what needs your attention today."
        icon={Activity}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Suspense fallback={<div className="h-9 w-56 rounded-lg bg-admin-surface border border-admin-border" />}>
              <AdminRangeSelector />
            </Suspense>
            <AdminDashboardRefreshButton />
          </div>
        }
      />

      <Suspense key={`attention:${rangeKeyId}`} fallback={<OverviewAttentionSkeleton />}>
        <OverviewAttention {...range} />
      </Suspense>

      {/* Not range-scoped: always this week against last week. */}
      <Suspense fallback={<OverviewNorthStarTileSkeleton />}>
        <OverviewNorthStarTile />
      </Suspense>

      <Suspense key={`kpis:${rangeKeyId}`} fallback={<OverviewKpisSkeleton />}>
        <OverviewKpis {...range} />
      </Suspense>

      <Suspense key={`charts:${rangeKeyId}`} fallback={<OverviewChartsSkeleton />}>
        <OverviewCharts {...range} />
      </Suspense>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Suspense fallback={<OverviewFunnelSkeleton />}>
          <OverviewFunnel />
        </Suspense>
        <Suspense fallback={<OverviewRecentActivitySkeleton />}>
          <OverviewRecentActivity />
        </Suspense>
      </div>

      {/* Last on the page: it is the slowest loader (Auth admin probe). */}
      <Suspense fallback={<OverviewSystemSnapshotSkeleton />}>
        <OverviewSystemSnapshot />
      </Suspense>
    </div>
  )
}
