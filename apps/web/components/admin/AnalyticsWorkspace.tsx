'use client'

import React, { Suspense, useOptimistic, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  BookOpen,
  Zap,
  Award,
  Download,
  TrendingUp,
} from 'lucide-react'
import { AdminRangeSelector } from './AdminRangeSelector'
import { AdminLoadWarning } from './AdminLoadWarning'
import { AnalyticsOverviewTab } from './AnalyticsOverviewTab'
import { AnalyticsLearnersTab } from './AnalyticsLearnersTab'
import { AnalyticsLearningTab } from './AnalyticsLearningTab'
import { AnalyticsGrowthTab } from './AnalyticsGrowthTab'
import {
  AnalyticsEngagementTabLazy as AnalyticsEngagementTab,
  AnalyticsOutcomesTabLazy as AnalyticsOutcomesTab,
} from './charts-lazy'
import type { AdminAnalyticsTab, AdminAnalyticsWorkspaceData } from '@/lib/admin/types'

interface AnalyticsWorkspaceProps {
  data: AdminAnalyticsWorkspaceData
}

const TABS: Array<{
  key: AdminAnalyticsTab
  label: string
  icon: React.ElementType
  description: string
}> = [
  {
    key: 'overview',
    label: 'Overview',
    icon: LayoutDashboard,
    description: 'Executive KPIs, conversion funnel and multi-metric trends',
  },
  {
    key: 'learners',
    label: 'Learners',
    icon: Users,
    description: 'DAU/WAU/MAU, user acquisition, levels and streak distributions',
  },
  {
    key: 'learning',
    label: 'Learning',
    icon: BookOpen,
    description: 'Curriculum drop-offs, course completion and quiz performance',
  },
  {
    key: 'engagement',
    label: 'Engagement & XP',
    icon: Zap,
    description: 'Daily XP velocity, activity source breakdown and flashcard review habits',
  },
  {
    key: 'outcomes',
    label: 'Outcomes',
    icon: Award,
    description: 'Certificate issuance velocity, capstone reviews and portfolio adoption',
  },
  {
    key: 'growth',
    label: 'Growth',
    icon: TrendingUp,
    description: 'Celebrations, referrals, public capstone pages and Fellow requests',
  },
]

function isKnownTab(value: string | null | undefined): value is AdminAnalyticsTab {
  return !!value && TABS.some((t) => t.key === value)
}

export function AnalyticsWorkspace({ data }: AnalyticsWorkspaceProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const currentTab: AdminAnalyticsTab = isKnownTab(tabParam)
    ? tabParam
    : isKnownTab(data.tab)
      ? data.tab
      : 'overview'
  // A tab change is a server load, and `currentTab` only moves when it commits. Until then the
  // clicked tab is shown as selected and the panel as busy, so a slow load still answers the click.
  const [isPending, startTransition] = useTransition()
  const [selectedTab, setSelectedTab] = useOptimistic<AdminAnalyticsTab>(currentTab)

  const handleExportCsv = () => {
    // Generate simple CSV payload for current tab data
    const rows: string[][] = [
      ['Metric', 'Value', 'Context'],
      ['Range Key', data.range.key, `${data.range.start.toISOString()} to ${data.range.end.toISOString()}`],
      ['Total Users', String(data.overview.kpis.totalUsers), 'All-time'],
      ['Active Learners', String(data.overview.kpis.activeLearners), 'Selected Range'],
      ['Lessons Completed', String(data.overview.kpis.lessonsCompleted), 'Selected Range'],
      ['Course Completion %', `${data.overview.kpis.courseCompletionPct}%`, 'All-time'],
      ['XP Earned', String(data.overview.kpis.xpEarned), 'Selected Range'],
      ['Certificates Issued', String(data.overview.kpis.certificatesIssued), 'Selected Range'],
    ]

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `prodily_analytics_${currentTab}_${data.range.key}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-6">
      {/* Workspace Header Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Secondary Navigation Tabs */}
        <nav
          aria-label="Analytics Workspace Tabs"
          className="border-b border-admin-border flex gap-6 text-xs font-semibold overflow-x-auto"
        >
          {TABS.map(({ key, label, icon: Icon }) => {
            const isActive = selectedTab === key
            const params = new URLSearchParams(searchParams.toString())
            params.set('tab', key)
            const href = `${pathname}?${params.toString()}`
            return (
              <Link
                key={key}
                href={href}
                // Only in-app navigations get here (not Ctrl/Cmd-click or open in a new tab):
                // the same push the link would do, inside a transition this component can see.
                onNavigate={(e) => {
                  e.preventDefault()
                  startTransition(() => {
                    setSelectedTab(key)
                    router.push(href)
                  })
                }}
                aria-current={isActive ? 'page' : undefined}
                className={`pb-3 border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap rounded-t focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-accent/50 ${
                  isActive
                    ? 'border-admin-accent text-admin-accent font-bold'
                    : 'border-transparent text-admin-fg-muted hover:text-admin-fg'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Global Range & Actions */}
        <div className="flex items-center gap-3 shrink-0">
          <Suspense fallback={<div className="h-9 w-48 rounded-lg bg-admin-surface border border-admin-border" />}>
            <AdminRangeSelector />
          </Suspense>

          <button
            type="button"
            onClick={handleExportCsv}
            className="h-9 px-3 rounded-lg bg-admin-surface border border-admin-border hover:bg-admin-surface-raised text-admin-fg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-accent/50"
            title="Export CSV summary of current metrics"
          >
            <Download className="w-3.5 h-3.5 text-admin-fg-muted" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {data.failed && (
        <AdminLoadWarning message="Live analytics data could not be fully aggregated from the database. Showing cached or fallback numbers." />
      )}

      {/* Tab Panels: the loaded tab stays on screen, dimmed, while the next one loads. */}
      <div
        aria-busy={isPending}
        data-pending={isPending ? 'true' : undefined}
        className={`transition-opacity duration-150 motion-reduce:transition-none ${isPending ? 'opacity-60' : 'opacity-100'}`}
      >
        {currentTab === 'overview' && <AnalyticsOverviewTab data={data.overview} />}
        {currentTab === 'learners' && <AnalyticsLearnersTab data={data.learners} />}
        {currentTab === 'learning' && <AnalyticsLearningTab data={data.learning} />}
        {currentTab === 'engagement' && <AnalyticsEngagementTab data={data.engagement} />}
        {currentTab === 'outcomes' && <AnalyticsOutcomesTab data={data.outcomes} />}
        {currentTab === 'growth' && <AnalyticsGrowthTab data={data.growth} />}
      </div>
    </div>
  )
}
