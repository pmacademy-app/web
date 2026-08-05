import React from 'react'
import { Bell, ShieldCheck, Mail } from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminKpiCard } from '@/components/admin/AdminKpiCard'
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge'

export const revalidate = 0

export default async function AdminNotificationsPage() {
  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Notification System & Timeline"
        description="Event dispatcher telemetry, in-app notification center activity, and channel routing status."
        icon={Bell}
        iconColor="text-amber-400"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <AdminKpiCard title="Primary Channel" value="In-App" subtitle="Real-time drawer notifications" icon={Bell} iconColor="text-amber-400" />
        <AdminKpiCard title="Secondary Channel" value="Email Engine" subtitle="Auth, Milestones & Weekly Recap" icon={Mail} iconColor="text-blue-400" />
        <AdminKpiCard title="Dispatcher Status" value="Active" subtitle="Event-driven notification platform" icon={ShieldCheck} iconColor="text-emerald-400" />
      </div>

      <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4 shadow-xl">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider">Event Routing Matrix</h2>
        <div className="space-y-3 text-xs">
          <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
            <div>
              <p className="font-bold text-white">Daily Learning Events (`lesson.completed`, `streak.updated`, `badge.earned`)</p>
              <p className="text-slate-400">Routed exclusively to In-App Notification Center.</p>
            </div>
            <AdminStatusBadge status="published" label="In-App Only" />
          </div>

          <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
            <div>
              <p className="font-bold text-white">Major Milestones (`module.completed`, `certificate.generated`, `weekly_recap`)</p>
              <p className="text-slate-400">Routed to both In-App and Email Queue (respecting user preferences).</p>
            </div>
            <AdminStatusBadge status="healthy" label="In-App + Email" />
          </div>
        </div>
      </div>
    </div>
  )
}
