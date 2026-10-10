import React from 'react'
import { Users, UserCheck, UserPlus, ShieldCheck, BookOpen, GraduationCap, Zap, Award } from 'lucide-react'
import { loadDashboardKpis } from '@/lib/admin/dashboard-service'
import { AdminKpiCard } from '@/components/admin/AdminKpiCard'
import { AdminLoadWarning } from '@/components/admin/AdminLoadWarning'
import type { OverviewRangeProps } from './types'

function trend(value: number | null, positiveIsGood = true) {
  if (value === null || value === 0) return undefined
  const isPositive = value > 0
  const good = positiveIsGood ? isPositive : !isPositive
  return { value: `${isPositive ? '+' : ''}${value}%`, positive: good }
}

/** The 8-card KPI grid for the selected range. */
export async function OverviewKpis({ rangeKey, from, to }: OverviewRangeProps) {
  const { kpis, failed } = await loadDashboardKpis(rangeKey, from, to)

  return (
    <div className="space-y-3">
      {failed && <AdminLoadWarning message="Key metrics could not be loaded. Showing zeros until they do." />}
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
    </div>
  )
}
