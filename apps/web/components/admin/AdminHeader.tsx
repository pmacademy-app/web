'use client'

import React from 'react'
import { ShieldCheck, Activity } from 'lucide-react'

export function AdminHeader() {
  return (
    <header className="h-16 bg-slate-900/80 backdrop-blur border-b border-slate-800 px-6 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <span className="flex h-2 w-2 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <span className="text-xs font-mono text-emerald-400 font-medium">System Online</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-xs text-slate-300">
          <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-semibold text-slate-200">Admin Mode Active</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Activity className="w-3.5 h-3.5 text-slate-500" />
          <span>Next.js 16 App Router</span>
        </div>
      </div>
    </header>
  )
}
