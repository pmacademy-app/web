import React from 'react'
import { BarChart3, TrendingUp, BookOpen, Zap } from 'lucide-react'
import { AdminConsoleService } from '@/lib/admin/service'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminKpiCard } from '@/components/admin/AdminKpiCard'

export const revalidate = 0

export default async function AdminAnalyticsPage() {
  const summary = await AdminConsoleService.getDashboardSummary()

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Operational Analytics & Growth"
        description="Learner acquisition trends, lesson completion velocity, and platform XP distribution."
        icon={BarChart3}
        iconColor="text-amber-400"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <AdminKpiCard
          title="Total User Growth"
          value={summary.totalUsers}
          subtitle={`+${summary.newSignups24h} signups in last 24h`}
          icon={TrendingUp}
          iconColor="text-emerald-400"
          trend={{ value: `+${summary.newSignups24h}`, positive: true }}
        />
        <AdminKpiCard
          title="Lesson Completion Velocity"
          value={summary.totalLessonsCompleted}
          subtitle="Completed lesson sessions"
          icon={BookOpen}
          iconColor="text-amber-400"
        />
        <AdminKpiCard
          title="XP Distribution"
          value={summary.totalXpAwarded.toLocaleString()}
          subtitle="Total XP earned across platform"
          icon={Zap}
          iconColor="text-purple-400"
        />
      </div>
    </div>
  )
}
