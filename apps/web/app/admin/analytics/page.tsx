import React from 'react'
import { BarChart3, TrendingUp } from 'lucide-react'
import { AdminConsoleService } from '@/lib/admin/service'

export const revalidate = 0

export default async function AdminAnalyticsPage() {
  const summary = await AdminConsoleService.getDashboardSummary()

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-amber-400" />
            Operational Analytics
          </h1>
          <p className="text-sm text-slate-400">User growth, learning completion velocity, and email performance metrics.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
          <span className="text-xs font-semibold text-slate-400 uppercase">User Growth</span>
          <p className="text-3xl font-extrabold text-white">{summary.totalUsers}</p>
          <div className="text-xs text-emerald-400 font-medium flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>+{summary.newSignups24h} new today</span>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
          <span className="text-xs font-semibold text-slate-400 uppercase">Lesson Activity</span>
          <p className="text-3xl font-extrabold text-emerald-400">{summary.totalLessonsCompleted}</p>
          <p className="text-xs text-slate-400 font-medium">Completed lesson sessions</p>
        </div>

        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
          <span className="text-xs font-semibold text-slate-400 uppercase">XP Velocity</span>
          <p className="text-3xl font-extrabold text-purple-400">{summary.totalXpAwarded.toLocaleString()}</p>
          <p className="text-xs text-purple-400/80 font-medium">Total earned across platform</p>
        </div>
      </div>
    </div>
  )
}
