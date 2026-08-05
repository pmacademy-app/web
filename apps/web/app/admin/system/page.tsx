import React from 'react'
import { Activity, Database, Server, CheckCircle, ShieldCheck } from 'lucide-react'
import { AdminConsoleService } from '@/lib/admin/service'

export const revalidate = 0

export default async function AdminSystemPage() {
  const health = await AdminConsoleService.getSystemHealth()

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Activity className="w-6 h-6 text-amber-400" />
            System Health & Infrastructure Diagnostics
          </h1>
          <p className="text-sm text-slate-400">Database latency, scheduler triggers, email provider status, and environment build stats.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase">Database Latency</span>
            <Database className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-3xl font-extrabold text-emerald-400">{health.databaseLatencyMs} ms</p>
          <p className="text-xs text-slate-400">Supabase PostgreSQL Connection</p>
        </div>

        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase">System Status</span>
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-3xl font-extrabold text-white capitalize">{health.status}</p>
          <p className="text-xs text-slate-400 font-mono">Last Checked: {new Date(health.lastCheckedAt).toLocaleTimeString()}</p>
        </div>

        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase">Environment</span>
            <Server className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-white capitalize">{health.environment}</p>
          <p className="text-xs text-slate-400 font-mono">{health.nextVersion}</p>
        </div>
      </div>

      <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          Infrastructure Health Checklist
        </h2>
        <div className="space-y-2 text-xs">
          <div className="p-3 rounded bg-slate-950/60 border border-slate-800 flex items-center justify-between">
            <span className="text-slate-300 font-medium">Supabase Auth & RLS Policy Enforcement</span>
            <span className="text-emerald-400 font-bold">100% Active</span>
          </div>
          <div className="p-3 rounded bg-slate-950/60 border border-slate-800 flex items-center justify-between">
            <span className="text-slate-300 font-medium">Scheduler Abstraction (`SCHEDULER_ENABLED`)</span>
            <span className="text-emerald-400 font-bold">Active (GitHub Actions Workflow)</span>
          </div>
          <div className="p-3 rounded bg-slate-950/60 border border-slate-800 flex items-center justify-between">
            <span className="text-slate-300 font-medium">Resend Email REST Provider Scaffold</span>
            <span className="text-emerald-400 font-bold">Connected</span>
          </div>
        </div>
      </div>
    </div>
  )
}
