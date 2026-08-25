import React, { Suspense } from 'react'
import {
  Users,
  UserCheck,
  UserPlus,
  ShieldCheck,
  BookOpen,
  GraduationCap,
  Zap,
  Award,
  Activity,
} from 'lucide-react'
import { DashboardService } from '@/lib/admin/dashboard-service'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminKpiCard } from '@/components/admin/AdminKpiCard'
import { AdminDashboardRefreshButton } from '@/components/admin/AdminDashboardRefreshButton'
import { AdminRangeSelector } from '@/components/admin/AdminRangeSelector'
import { AdminAttentionCenter } from '@/components/admin/AdminAttentionCenter'
import { AdminLearnerActivityChart } from '@/components/admin/AdminLearnerActivityChart'
import { AdminLearningActivityChart } from '@/components/admin/AdminLearningActivityChart'
import { AdminFunnelChart } from '@/components/admin/AdminFunnelChart'
import { AdminRecentActivityList } from '@/components/admin/AdminRecentActivityList'
import { AdminSystemSnapshot } from '@/components/admin/AdminSystemSnapshot'
import { AdminLoadWarning } from '@/components/admin/AdminLoadWarning'
import type { AdminDateRangeKey } from '@/lib/admin/types'

export const revalidate = 0

interface AdminDashboardPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function AdminDashboardPage({ searchParams }: AdminDashboardPageProps) {
  const params = await searchParams
  const range = (params.range as AdminDateRangeKey) || '30d'
  const from = typeof params.from === 'string' ? params.from : null
  const to = typeof params.to === 'string' ? params.to : null

  const data = await DashboardService.getDashboardData(range, from, to)
  const { kpis } = data

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  const trend = (value: number | null, positiveIsGood = true) => {
    if (value === null || value === 0) return undefined
    const isPositive = value > 0
    const good = positiveIsGood ? isPositive : !isPositive
    return { value: `${isPositive ? '+' : ''}${value}%`, positive: good }
  }

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

      {data.failed && (
        <AdminLoadWarning message="Live database metrics could not be fully loaded. Showing fallback metrics." />
      )}

      {/* Needs Attention */}
      <AdminAttentionCenter items={data.attention} />

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminKpiCard
          title="Total Users"
          value={kpis.totalUsers.toLocaleString()}
          subtitle="All-time registered accounts"
          icon={Users}
          trend={trend(kpis.trends.totalUsers)}
        />
        <AdminKpiCard
          title="Active Learners"
          value={kpis.activeLearners.toLocaleString()}
          subtitle="Earned XP in selected range"
          icon={UserCheck}
          iconColor="text-admin-success"
          trend={trend(kpis.trends.activeLearners)}
        />
        <AdminKpiCard
          title="New Users"
          value={kpis.newUsers.toLocaleString()}
          subtitle="Registered in selected range"
          icon={UserPlus}
          iconColor="text-admin-info"
          trend={trend(kpis.trends.newUsers)}
        />
        <AdminKpiCard
          title="Verified Users"
          value={kpis.verifiedUsers.toLocaleString()}
          subtitle="All-time verified accounts"
          icon={ShieldCheck}
          iconColor="text-admin-success"
          trend={trend(kpis.trends.verifiedUsers)}
        />
        <AdminKpiCard
          title="Lessons Completed"
          value={kpis.lessonsCompleted.toLocaleString()}
          subtitle="Completed lessons in range"
          icon={BookOpen}
          iconColor="text-admin-accent"
          trend={trend(kpis.trends.lessonsCompleted)}
        />
        <AdminKpiCard
          title="Course Completion"
          value={`${kpis.courseCompletionPct}%`}
          subtitle="Learners who finished the curriculum"
          icon={GraduationCap}
          iconColor="text-admin-warning"
          trend={trend(kpis.trends.courseCompletionPct)}
        />
        <AdminKpiCard
          title="XP Earned"
          value={kpis.xpEarned.toLocaleString()}
          subtitle="Total XP awarded in range"
          icon={Zap}
          iconColor="text-admin-info"
          trend={trend(kpis.trends.xpEarned)}
        />
        <AdminKpiCard
          title="Certificates Issued"
          value={kpis.certificatesIssued.toLocaleString()}
          subtitle="Certificates in range"
          icon={Award}
          iconColor="text-admin-success"
          trend={trend(kpis.trends.certificatesIssued)}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AdminLearnerActivityChart data={data.series} />
        <AdminLearningActivityChart data={data.series} />
      </div>

      {/* Funnel + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AdminFunnelChart stages={data.funnel} />
        <AdminRecentActivityList items={data.recentActivity} />
      </div>

      {/* System Snapshot */}
      <AdminSystemSnapshot items={data.systemSnapshot} />
    </div>
  )
}