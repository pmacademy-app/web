import React from 'react'
import { Settings, ShieldCheck } from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge'

export const revalidate = 0

export default async function AdminSettingsPage() {
  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Admin Console Security Settings"
        description="Role-Based Access Control (RBAC) rules, API guard configuration, and audit logging parameters."
        icon={Settings}
        iconColor="text-amber-400"
      />

      <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4 shadow-xl">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          Access Control Policy Enforcer
        </h2>
        <div className="space-y-3 text-xs text-slate-300">
          <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
            <div>
              <p className="font-bold text-white">Middleware Route Interceptor (`proxy.ts`)</p>
              <p className="text-slate-400">Restricts all `/admin/*` paths to authenticated users with `is_admin = true`.</p>
            </div>
            <AdminStatusBadge status="healthy" label="Active" />
          </div>

          <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
            <div>
              <p className="font-bold text-white">Server-Side API Security Guard (`requireAdminUser`)</p>
              <p className="text-slate-400">Verifies JWT token signature and database `is_admin` flag on every `/api/admin/*` endpoint.</p>
            </div>
            <AdminStatusBadge status="healthy" label="Active" />
          </div>
        </div>
      </div>
    </div>
  )
}
