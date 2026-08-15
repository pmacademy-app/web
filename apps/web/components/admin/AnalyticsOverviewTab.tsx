'use client'

import React from 'react'
import {
  Users,
  Activity,
  BookOpen,
  GraduationCap,
  Zap,
  Award,
  TrendingUp,
  UserCheck,
} from 'lucide-react'
import { AdminKpiCard } from './AdminKpiCard'
import { AdminLearnerActivityChart } from './AdminLearnerActivityChart'
import { AdminLearningActivityChart } from './AdminLearningActivityChart'
import { AdminFunnelChart } from './AdminFunnelChart'
import type { AdminExecutiveOverview } from '@/lib/admin/types'

interface AnalyticsOverviewTabProps {
  data: AdminExecutiveOverview
}

function formatTrend(val: number | null | undefined) {
  if (val === null || val === undefined) return undefined
  const positive = val >= 0
  const prefix = positive ? '+' : ''
  return {
    value: `${prefix}${val.toFixed(1)}%`,
    positive,
  }
}

export function AnalyticsOverviewTab({ data }: AnalyticsOverviewTabProps) {
  const { kpis, funnel, consolidatedSeries } = data

  return (
    <div className="space-y-6">
      {/* Primary KPI Grid with period trends */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminKpiCard
          title="Total Users"
          value={kpis.totalUsers.toLocaleString()}
          subtitle="All registered learners"
          trend={formatTrend(kpis.trends.totalUsers)}
          icon={Users}
          iconColor="text-admin-accent"
        />
        <AdminKpiCard
          title="Active Learners"
          value={kpis.activeLearners.toLocaleString()}
          subtitle="Active in selected range"
          trend={formatTrend(kpis.trends.activeLearners)}
          icon={Activity}
          iconColor="text-admin-info"
        />
        <AdminKpiCard
          title="New Users"
          value={kpis.newUsers.toLocaleString()}
          subtitle="Joined in selected range"
          trend={formatTrend(kpis.trends.newUsers)}
          icon={UserCheck}
          iconColor="text-admin-success"
        />
        <AdminKpiCard
          title="Lessons Completed"
          value={kpis.lessonsCompleted.toLocaleString()}
          subtitle="Completed in selected range"
          trend={formatTrend(kpis.trends.lessonsCompleted)}
          icon={BookOpen}
          iconColor="text-admin-warning"
        />
      </div>

      {/* Secondary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminKpiCard
          title="Course Completion"
          value={`${kpis.courseCompletionPct.toFixed(1)}%`}
          subtitle="All registered learners"
          icon={GraduationCap}
          iconColor="text-admin-accent"
        />
        <AdminKpiCard
          title="XP Earned"
          value={kpis.xpEarned.toLocaleString()}
          subtitle="Awarded in selected range"
          trend={formatTrend(kpis.trends.xpEarned)}
          icon={Zap}
          iconColor="text-admin-warning"
        />
        <AdminKpiCard
          title="Certificates Issued"
          value={kpis.certificatesIssued.toLocaleString()}
          subtitle="Issued in selected range"
          trend={formatTrend(kpis.trends.certificatesIssued)}
          icon={Award}
          iconColor="text-admin-success"
        />
        <AdminKpiCard
          title="Verified Users"
          value={kpis.verifiedUsers.toLocaleString()}
          subtitle={`${kpis.totalUsers > 0 ? Math.round((kpis.verifiedUsers / kpis.totalUsers) * 100) : 0}% verification rate`}
          icon={TrendingUp}
          iconColor="text-admin-info"
        />
      </div>

      {/* Funnel & Conversion Journey */}
      <AdminFunnelChart stages={funnel} />

      {/* Time-Series Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AdminLearnerActivityChart data={consolidatedSeries} />
        <AdminLearningActivityChart data={consolidatedSeries} />
      </div>
    </div>
  )
}
