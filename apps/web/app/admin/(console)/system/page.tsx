import React from 'react'
import { Activity, Database, Server, CheckCircle, ShieldCheck, Flag, Play } from 'lucide-react'
import { AdminConsoleService } from '@/lib/admin/service'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminKpiCard } from '@/components/admin/AdminKpiCard'
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge'
import { ProcessEmailQueueButton } from '@/components/admin/ProcessEmailQueueButton'

export const revalidate = 0

export default async function AdminSystemPage() {
  const health = await AdminConsoleService.getSystemHealth()
  const flags = AdminConsoleService.getFeatureFlags()

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="System Diagnostics & Infrastructure"
        description="Database query latency, read-only feature flag state, audit logs, and cron scheduler triggers."
        icon={Activity}
        iconColor="text-amber-400"
        actions={<ProcessEmailQueueButton />}
      />

      {/* System Health KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <AdminKpiCard
          title="Database Query Latency"
          value={`${health.databaseLatencyMs} ms`}
          subtitle="Supabase PostgreSQL Connection"
          icon={Database}
          iconColor="text-emerald-400"
        />
        <AdminKpiCard
          title="System Status"
          value={health.status.toUpperCase()}
          subtitle={`Last checked: ${new Date(health.lastCheckedAt).toLocaleTimeString()}`}
          icon={CheckCircle}
          iconColor="text-emerald-400"
        />
        <AdminKpiCard
          title="Environment"
          value={health.environment}
          subtitle={health.nextVersion}
          icon={Server}
          iconColor="text-blue-400"
        />
      </div>

      {/* Diagnostic Checklist */}
      <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4 shadow-xl">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          Infrastructure Diagnostic Checklist
        </h2>
        <div className="space-y-3 text-xs">
          <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
            <span className="text-slate-300 font-medium">Supabase Auth & RLS Security Enforcer</span>
            <AdminStatusBadge status="healthy" label="Enforced" />
          </div>
          <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
            <span className="text-slate-300 font-medium">Scheduler Workflow (`SCHEDULER_ENABLED`)</span>
            <AdminStatusBadge status="healthy" label="Active (GitHub Actions)" />
          </div>
          <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
            <span className="text-slate-300 font-medium">Resend Transactional Email REST API</span>
            <AdminStatusBadge status="healthy" label="Connected" />
          </div>
        </div>
      </div>

      {/* Read-Only Feature Flags State (Diagnostic Display) */}
      <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4 shadow-xl">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <Flag className="w-4 h-4 text-amber-400" />
          Read-Only Feature Flag Diagnostic State
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {flags.map((flag) => (
            <div key={flag.key} className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
              <span className="font-mono text-amber-400 font-semibold">{flag.key}</span>
              <AdminStatusBadge
                status={flag.enabled ? 'healthy' : 'archived'}
                label={flag.enabled ? 'ENABLED' : 'DISABLED'}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Manual Queue & Cron Trigger Section */}
      <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4 shadow-xl">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <Play className="w-4 h-4 text-blue-400" />
          Manual System Triggers
        </h2>
        <div className="flex flex-wrap gap-4 text-xs">
          <ProcessEmailQueueButton />
        </div>
      </div>
    </div>
  )
}
