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

interface AdminAnalyticsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function AdminAnalyticsPage({ searchParams }: AdminAnalyticsPageProps) {
  const params = await searchParams
  const range = (params.range as AdminDateRangeKey) || '30d'
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
