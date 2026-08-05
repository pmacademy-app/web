import React from 'react'
import { Flag, CheckCircle, XCircle } from 'lucide-react'
import { AdminConsoleService } from '@/lib/admin/service'

export const revalidate = 0

export default async function AdminFeatureFlagsPage() {
  const flags = AdminConsoleService.getFeatureFlags()

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Flag className="w-6 h-6 text-amber-400" />
            Runtime Feature Flags
          </h1>
          <p className="text-sm text-slate-400">Control platform capabilities, notification limits, and scheduled features in real time.</p>
        </div>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[10px] font-bold border-b border-slate-800">
              <tr>
                <th className="px-5 py-3.5">Feature Flag Key</th>
                <th className="px-5 py-3.5">State</th>
                <th className="px-5 py-3.5">Last Updated</th>
                <th className="px-5 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {flags.map((flag) => (
                <tr key={flag.key} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-5 py-4 font-mono font-bold text-amber-400">{flag.key}</td>
                  <td className="px-5 py-4">
                    {flag.enabled ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle className="w-3.5 h-3.5" /> ENABLED
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                        <XCircle className="w-3.5 h-3.5" /> DISABLED
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-slate-400 text-[11px] font-mono">
                    {new Date(flag.updatedAt).toLocaleString()}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      className={`px-3 py-1 rounded text-[11px] font-bold border transition-colors ${
                        flag.enabled
                          ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/30'
                          : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      }`}
                    >
                      {flag.enabled ? 'Disable Flag' : 'Enable Flag'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
