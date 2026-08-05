import React from 'react'
import Link from 'next/link'
import { ShieldAlert, ArrowLeft, Lock } from 'lucide-react'

export const metadata = {
  title: 'Access Denied | PM Academy Admin Console',
  description: 'Administrator privileges are required to access this area.',
}

export default function AccessDeniedPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 antialiased selection:bg-amber-500/30 selection:text-amber-200">
      <div className="max-w-md w-full p-8 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-6 text-center shadow-2xl backdrop-blur">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto shadow-inner">
          <ShieldAlert className="w-7 h-7" />
        </div>

        <div className="space-y-2">
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20">
            HTTP 403 Forbidden
          </span>
          <h1 className="text-2xl font-bold text-white tracking-tight">Access Restricted</h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            Your authenticated user account does not possess administrator authorizations to view the Operations Control Center.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 text-left text-xs space-y-2 text-slate-300">
          <p className="font-semibold text-white flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            Security Policy & Access Requests
          </p>
          <p className="text-slate-400 text-[11px] leading-normal">
            If you are a team member requiring admin access, contact your platform operations administrator to register your email in the system configuration.
          </p>
        </div>

        <div className="pt-2">
          <Link
            href="/dashboard"
            className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold text-xs transition-colors inline-flex items-center justify-center gap-2 border border-slate-700"
          >
            <ArrowLeft className="w-4 h-4" /> Return to Learner Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
