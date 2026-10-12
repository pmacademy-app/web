'use client'

import dynamic from 'next/dynamic'

/**
 * Client-only, on-demand wrappers for the admin views that pull in recharts (Admin R6 B2).
 *
 * recharts is large and the charts render nothing useful on the server (they wait for mount), so
 * each one is split into its own chunk and loaded after hydration. `ssr: false` is only allowed in
 * a client module, which is why these live here rather than in the server pages that use them.
 *
 * Each skeleton has a fixed height close to the loaded view, so the swap does not shift layout.
 */

function ChartSkeleton({ className, label }: { className: string; label: string }) {
  return (
    <div
      role="status"
      aria-label={`Loading ${label}`}
      className={`w-full rounded-2xl border border-admin-border bg-admin-surface/20 motion-safe:animate-pulse ${className}`}
    />
  )
}

export const AdminLearnerActivityChartLazy = dynamic(
  () => import('./AdminLearnerActivityChart').then((mod) => mod.AdminLearnerActivityChart),
  { ssr: false, loading: () => <ChartSkeleton className="h-[22rem]" label="learner activity chart" /> },
)

export const AdminLearningActivityChartLazy = dynamic(
  () => import('./AdminLearningActivityChart').then((mod) => mod.AdminLearningActivityChart),
  { ssr: false, loading: () => <ChartSkeleton className="h-[22rem]" label="learning activity chart" /> },
)

export const AdminEmailDashboardLazy = dynamic(
  () => import('./AdminEmailDashboard').then((mod) => mod.AdminEmailDashboard),
  { ssr: false, loading: () => <ChartSkeleton className="h-[48rem]" label="email dashboard" /> },
)

export const AnalyticsEngagementTabLazy = dynamic(
  () => import('./AnalyticsEngagementTab').then((mod) => mod.AnalyticsEngagementTab),
  { ssr: false, loading: () => <ChartSkeleton className="h-[40rem]" label="engagement analytics" /> },
)

export const AnalyticsOutcomesTabLazy = dynamic(
  () => import('./AnalyticsOutcomesTab').then((mod) => mod.AnalyticsOutcomesTab),
  { ssr: false, loading: () => <ChartSkeleton className="h-[40rem]" label="outcomes analytics" /> },
)
