import React from 'react'
import { Activity, Database, Server, CheckCircle, ShieldCheck, Flag, Play } from 'lucide-react'
import { AdminConsoleService } from '@/lib/admin/service'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminKpiCard } from '@/components/admin/AdminKpiCard'
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge'
import { ProcessEmailQueueButton } from '@/components/admin/ProcessEmailQueueButton'
import { AdminSystemAlertsView } from '@/components/admin/AdminSystemAlertsView'

export const revalidate = 0

export default async function AdminSystemPage() {
  const health = await AdminConsoleService.getSystemHealth()
  const flags = AdminConsoleService.getFeatureFlags()

  const hasResendKey = Boolean(process.env.RESEND_API_KEY)
  const hasCronSecret = Boolean(process.env.CRON_SECRET)
  const hasVercelToken = Boolean(process.env.VERCEL_API_TOKEN)
  const hasSupabaseMgmt = Boolean(process.env.SUPABASE_MANAGEMENT_API_KEY)

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="System Diagnostics & Infrastructure"
        description="Database query latency, application health, system alerts log, and cron scheduler triggers."
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
          title="Application Status"
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

      {/* System Errors & Alerts Section */}
      <AdminSystemAlertsView />

      {/* External Platform Infrastructure Integration Status */}
      <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4 shadow-xl">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          External Platform Integration & Telemetry Status
        </h2>
        <div className="space-y-3 text-xs">
          <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-slate-300 font-medium block">Supabase PostgreSQL Database</span>
              <span className="text-[11px] text-slate-500">
                Live SQL ping latency query ({health.databaseLatencyMs} ms)
              </span>
            </div>
            <AdminStatusBadge
              status="healthy"
              label="Connected & Monitored (Live Ping)"
            />
          </div>

          <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-slate-300 font-medium block">Resend Transactional Email REST API</span>
              <span className="text-[11px] text-slate-500">
                {hasResendKey ? 'RESEND_API_KEY present — Outbound error logger instrumented' : 'Requires RESEND_API_KEY in environment'}
              </span>
            </div>
            <AdminStatusBadge
              status={hasResendKey ? 'degraded' : 'archived'}
              label={hasResendKey ? 'API Key Present (No Status Monitored)' : 'Not Configured'}
            />
          </div>

          <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-slate-300 font-medium block">GitHub Actions Cron Scheduler</span>
              <span className="text-[11px] text-slate-500">
                {hasCronSecret ? 'CRON_SECRET present — Authorization instrumented' : 'Requires CRON_SECRET in repository secrets'}
              </span>
            </div>
            <AdminStatusBadge
              status={hasCronSecret ? 'degraded' : 'archived'}
              label={hasCronSecret ? 'Secret Present (No Telemetry Polled)' : 'Not Configured'}
            />
          </div>

          <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-slate-300 font-medium block">Vercel Deployment Platform</span>
              <span className="text-[11px] text-slate-500">
                {hasVercelToken ? 'VERCEL_API_TOKEN present' : 'Requires VERCEL_API_TOKEN for Vercel REST telemetry'}
              </span>
            </div>
            <AdminStatusBadge
              status={hasVercelToken ? 'degraded' : 'archived'}
              label={hasVercelToken ? 'Token Present (No Logs Polled)' : 'Not Configured'}
            />
          </div>

          <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-slate-300 font-medium block">Supabase Management API</span>
              <span className="text-[11px] text-slate-500">
                {hasSupabaseMgmt ? 'SUPABASE_MANAGEMENT_API_KEY present' : 'Requires SUPABASE_MANAGEMENT_API_KEY'}
              </span>
            </div>
            <AdminStatusBadge
              status={hasSupabaseMgmt ? 'degraded' : 'archived'}
              label={hasSupabaseMgmt ? 'Key Present (No Management API Polled)' : 'Not Connected'}
            />
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
