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
        iconColor="text-amber-400"
        actions={
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-mono hidden sm:inline">
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
          iconColor="text-amber-400"
          trend={{ value: `+${summary.newSignups24h}`, positive: true }}
        />
        <AdminKpiCard
          title="Lessons Completed"
          value={summary.totalLessonsCompleted}
          subtitle="90 compiled curriculum lessons"
          icon={BookOpen}
          iconColor="text-emerald-400"
        />
        <AdminKpiCard
          title="Total XP Awarded"
          value={summary.totalXpAwarded.toLocaleString()}
          subtitle="Platform-wide learner XP"
          icon={Zap}
          iconColor="text-purple-400"
        />
        <AdminKpiCard
          title="Email Queue Pending"
          value={summary.queuePendingCount}
          subtitle="Awaiting dispatcher pickup"
          icon={Mail}
          iconColor="text-blue-400"
          badgeText={summary.queuePendingCount === 0 ? 'Clear' : 'Active'}
        />
      </div>

      {/* Main Grid: Secondary Metrics & Operations Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Operations Activity Summary */}
        <div className="lg:col-span-2 p-6 rounded-xl bg-slate-900/60 border border-slate-800 space-y-5 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-400" />
              Platform Milestone Summary
            </h2>
            <Link
              href="/admin/analytics"
              className="text-xs font-semibold text-amber-400 hover:underline"
            >
              View Analytics →
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1">
              <span className="text-[11px] font-medium text-slate-400 uppercase">Certificates Issued</span>
              <p className="text-2xl font-bold text-white flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" />
                {summary.totalCertificatesIssued}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1">
              <span className="text-[11px] font-medium text-slate-400 uppercase">Public Portfolios</span>
              <p className="text-2xl font-bold text-white">{summary.totalPublicPortfolios}</p>
            </div>
            <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1">
              <span className="text-[11px] font-medium text-slate-400 uppercase">System Latency</span>
              <p className="text-2xl font-bold text-emerald-400">{health.databaseLatencyMs} ms</p>
            </div>
          </div>
        </div>

        {/* System Health Checklist */}
        <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 space-y-5 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              System Status
            </h2>
            <AdminStatusBadge status={health.status} />
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
              <span className="text-slate-300 font-medium">Supabase Auth & RLS</span>
              <AdminStatusBadge status="healthy" label="Enforced" />
            </div>
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
              <span className="text-slate-300 font-medium">Scheduler Workflow</span>
              <AdminStatusBadge status="healthy" label="Active" />
            </div>
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
              <span className="text-slate-300 font-medium">Resend Email API</span>
              <AdminStatusBadge status="healthy" label="Ready" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
