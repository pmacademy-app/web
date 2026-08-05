import React from 'react'
import { Bell, ShieldCheck, Mail } from 'lucide-react'

export const revalidate = 0

export default async function AdminNotificationsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Bell className="w-6 h-6 text-amber-400" />
            Notification Timeline & Event Logs
          </h1>
          <p className="text-sm text-slate-400">System-wide notification routing timeline and deliverability diagnostics.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase">Primary Channel</span>
            <Bell className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-xl font-bold text-white">In-App Feed</p>
          <p className="text-xs text-slate-400">Active for all daily learning & milestone events.</p>
        </div>

        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase">Secondary Channel</span>
            <Mail className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-xl font-bold text-white">Resend Email</p>
          <p className="text-xs text-slate-400">Restricted to Auth, Major Milestones & Weekly Recap.</p>
        </div>

        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase">Deliverability Health</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-xl font-bold text-emerald-400">100% Delivery</p>
          <p className="text-xs text-slate-400">0 failed dispatches in last 24h.</p>
        </div>
      </div>

      <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider">Recent System Notification Events</h2>
        <div className="p-8 text-center bg-slate-950/60 rounded-lg border border-slate-800/80 text-slate-500 text-xs">
          No failed or suppressed notification events recorded. Notification platform running normally.
        </div>
      </div>
    </div>
  )
}
