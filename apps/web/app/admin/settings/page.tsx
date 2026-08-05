import React from 'react'
import { Settings, ShieldCheck } from 'lucide-react'

export const revalidate = 0

export default async function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Settings className="w-6 h-6 text-amber-400" />
            Admin Console Settings
          </h1>
          <p className="text-sm text-slate-400">Security preferences, RBAC configuration, and operational secrets.</p>
        </div>
      </div>

      <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          Access Control & Role Security
        </h2>
        <div className="space-y-3 text-xs text-slate-300">
          <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
            <div>
              <p className="font-bold text-white">Middleware RBAC Enforcer (`proxy.ts`)</p>
              <p className="text-slate-400">Restricts all `/admin` routes to users with `is_admin = true`.</p>
            </div>
            <span className="px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">
              Active
            </span>
          </div>

          <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
            <div>
              <p className="font-bold text-white">API Server Guard (`requireAdminUser`)</p>
              <p className="text-slate-400">Verifies JWT token and `is_admin` flag on every `/api/admin/*` endpoint.</p>
            </div>
            <span className="px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">
              Active
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
