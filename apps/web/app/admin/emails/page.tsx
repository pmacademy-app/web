import React from 'react'
import { Mail, RefreshCw, Send, CheckCircle2, AlertCircle, Clock } from 'lucide-react'
import { AdminConsoleService } from '@/lib/admin/service'

export const revalidate = 0

export default async function AdminEmailQueuePage() {
  const queue = await AdminConsoleService.getEmailQueueOverview()

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Mail className="w-6 h-6 text-amber-400" />
            Email Queue & Deliverability
          </h1>
          <p className="text-sm text-slate-400">Monitor queue status, process pending batches, and retry failed emails.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg transition-colors">
            <Send className="w-3.5 h-3.5" />
            Process Queue Now
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
            <span>Pending</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-extrabold text-white mt-2">{queue.pendingCount}</p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
            <span>Processing</span>
            <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
          </div>
          <p className="text-2xl font-extrabold text-blue-400 mt-2">{queue.processingCount}</p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
            <span>Delivered</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-extrabold text-emerald-400 mt-2">{queue.deliveredCount}</p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
            <span>Failed</span>
            <AlertCircle className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-2xl font-extrabold text-rose-400 mt-2">{queue.failedCount}</p>
        </div>
      </div>

      <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider">Queue Delivery Stream</h2>
        <div className="p-8 text-center bg-slate-950/60 rounded-lg border border-slate-800/80 text-slate-500 text-xs">
          No pending or failed emails in queue. All transactional notifications delivered.
        </div>
      </div>
    </div>
  )
}
