import React from 'react'
import { Activity } from 'lucide-react'
import { AnalyticsService } from '@/lib/admin/analytics-service'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AnalyticsWorkspace } from '@/components/admin/AnalyticsWorkspace'
import type { AdminAnalyticsTab, AdminDateRangeKey } from '@/lib/admin/types'

export const revalidate = 0

/** Known tabs. `?tab=` is validated against this so cache keys stay bounded. */
const ANALYTICS_TABS = ['overview', 'learners', 'learning', 'engagement', 'outcomes', 'growth'] as const satisfies readonly AdminAnalyticsTab[]

function parseTab(value: string | string[] | undefined): AdminAnalyticsTab {
  return typeof value === 'string' && (ANALYTICS_TABS as readonly string[]).includes(value)
    ? (value as AdminAnalyticsTab)
    : 'overview'
}

/** Known ranges. `?range=` is validated the same way; anything else is the default 30 days. */
const ANALYTICS_RANGES = ['today', '7d', '30d', '90d', 'custom'] as const satisfies readonly AdminDateRangeKey[]

function parseRange(value: string | string[] | undefined): AdminDateRangeKey {
  return typeof value === 'string' && (ANALYTICS_RANGES as readonly string[]).includes(value)
    ? (value as AdminDateRangeKey)
    : '30d'
}

interface AdminAnalyticsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function AdminAnalyticsPage({ searchParams }: AdminAnalyticsPageProps) {
  const params = await searchParams
  const range = parseRange(params.range)
  // A repeated param (`?from=a&from=b`) arrives as an array and is dropped.
  const from = typeof params.from === 'string' ? params.from : null
  const to = typeof params.to === 'string' ? params.to : null
  const tab = parseTab(params.tab)

  const data = await AnalyticsService.getAnalyticsWorkspaceData({
    rangeKey: range,
    from,
    to,
    tab,
  })

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Analytics & Insights"
        description="Real-time growth, curriculum progression, learner engagement, and platform performance metrics."
        icon={Activity}
      />

      <AnalyticsWorkspace data={data} />
    </div>
  )
}
