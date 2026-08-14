import React from 'react'
import Link from 'next/link'
import {
  Users,
  BookOpen,
  Mail,
  Award,
  Activity,
  Zap,
  TrendingUp,
  ShieldCheck,
} from 'lucide-react'
import { AdminConsoleService } from '@/lib/admin/service'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminKpiCard } from '@/components/admin/AdminKpiCard'
import { AdminDashboardRefreshButton } from '@/components/admin/AdminDashboardRefreshButton'
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge'

export const revalidate = 0

export default async function AdminDashboardPage() {
  const summary = await AdminConsoleService.getDashboardSummary()
  const health = await AdminConsoleService.getSystemHealth()

  return (
    <div className="space-y-8">
      {/* Standard Header */}
      <AdminPageHeader
        title="Operations Control Center"
        description="Real-time operational metrics, platform health, user activity, and system queue monitoring."
        icon={Activity}
        actions={
          <div className="flex items-center gap-2">
            <span className="text-xs text-admin-fg-muted font-mono hidden sm:inline">
              Last Refreshed: {new Date().toLocaleTimeString()}
            </span>
            <AdminDashboardRefreshButton />
          </div>
        }
      />

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminKpiCard
          title="Total Registered Users"
          value={summary.totalUsers}
          subtitle={`+${summary.newSignups24h} new in last 24h`}
          icon={Users}
          trend={{ value: `+${summary.newSignups24h}`, positive: true }}
        />
        <AdminKpiCard
          title="Lessons Completed"
          value={summary.totalLessonsCompleted}
          subtitle="90 compiled curriculum lessons"
          icon={BookOpen}
          iconColor="text-admin-success"
        />
        <AdminKpiCard
          title="Total XP Awarded"
          value={summary.totalXpAwarded.toLocaleString()}
          subtitle="Platform-wide learner XP"
          icon={Zap}
          iconColor="text-admin-info"
        />
        <AdminKpiCard
          title="Email Queue Pending"
          value={summary.queuePendingCount}
          subtitle="Awaiting dispatcher pickup"
          icon={Mail}
          iconColor="text-admin-warning"
          badgeText={summary.queuePendingCount === 0 ? 'Clear' : 'Active'}
        />
      </div>

      {/* Main Grid: Secondary Metrics & Operations Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Operations Activity Summary */}
        <div className="lg:col-span-2 p-6 rounded-xl bg-admin-surface border border-admin-border space-y-5 shadow-xl">
          <div className="flex items-center justify-between border-b border-admin-border pb-4">
            <h2 className="text-sm font-bold text-admin-fg uppercase tracking-wider flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-admin-accent" />
              Platform Milestone Summary
            </h2>
            <Link
              href="/admin/analytics"
              className="text-xs font-semibold text-admin-accent hover:underline"
            >
              View Analytics →
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-admin-bg/60 border border-admin-border space-y-1">
              <span className="text-[11px] font-medium text-admin-fg-muted uppercase">Certificates Issued</span>
              <p className="text-2xl font-bold text-admin-fg flex items-center gap-2">
                <Award className="w-4 h-4 text-admin-accent" />
                {summary.totalCertificatesIssued}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-admin-bg/60 border border-admin-border space-y-1">
              <span className="text-[11px] font-medium text-admin-fg-muted uppercase">Public Portfolios</span>
              <p className="text-2xl font-bold text-admin-fg">{summary.totalPublicPortfolios}</p>
            </div>
            <div className="p-4 rounded-lg bg-admin-bg/60 border border-admin-border space-y-1">
              <span className="text-[11px] font-medium text-admin-fg-muted uppercase">System Latency</span>
              <p className="text-2xl font-bold text-admin-success">{health.databaseLatencyMs} ms</p>
            </div>
          </div>
        </div>

        {/* System Health Checklist */}
        <div className="p-6 rounded-xl bg-admin-surface border border-admin-border space-y-5 shadow-xl">
          <div className="flex items-center justify-between border-b border-admin-border pb-4">
            <h2 className="text-sm font-bold text-admin-fg uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-admin-success" />
              System Status
            </h2>
            <AdminStatusBadge status={health.status} />
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-lg bg-admin-bg/60 border border-admin-border flex items-center justify-between">
              <span className="text-admin-fg-muted font-medium">Supabase Auth & RLS</span>
              <AdminStatusBadge status="healthy" label="Enforced" />
            </div>
            <div className="p-3 rounded-lg bg-admin-bg/60 border border-admin-border flex items-center justify-between">
              <span className="text-admin-fg-muted font-medium">Scheduler Workflow</span>
              <AdminStatusBadge status="healthy" label="Active" />
            </div>
            <div className="p-3 rounded-lg bg-admin-bg/60 border border-admin-border flex items-center justify-between">
              <span className="text-admin-fg-muted font-medium">Resend Email API</span>
              <AdminStatusBadge status="healthy" label="Ready" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
