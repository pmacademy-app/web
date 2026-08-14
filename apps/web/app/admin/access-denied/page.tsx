import React from 'react'
import Link from 'next/link'
import { ShieldAlert, ArrowLeft, Lock } from 'lucide-react'

export const metadata = {
  title: 'Access Denied',
  description: 'Administrator privileges are required to access this area.',
}

export default function AccessDeniedPage() {
  return (
    <div className="admin-console min-h-screen bg-admin-bg text-admin-fg flex items-center justify-center p-4 antialiased selection:bg-admin-accent/30 selection:text-admin-accent">
      <div className="max-w-md w-full p-8 rounded-2xl bg-admin-surface border border-admin-border space-y-6 text-center shadow-2xl backdrop-blur">
        <div className="w-14 h-14 rounded-2xl bg-admin-danger/10 border border-admin-danger/20 text-admin-danger flex items-center justify-center mx-auto shadow-inner">
          <ShieldAlert className="w-7 h-7" />
        </div>

        <div className="space-y-2">
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-admin-danger/10 text-admin-danger border border-admin-danger/20">
            HTTP 403 Forbidden
          </span>
          <h1 className="text-2xl font-bold text-admin-fg tracking-tight">Access Restricted</h1>
          <p className="text-xs text-admin-fg-muted leading-relaxed">
            Your authenticated user account does not possess administrator authorizations to view the Operations Control Center.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-admin-bg/60 border border-admin-border/80 text-left text-xs space-y-2 text-admin-fg-muted">
          <p className="font-semibold text-admin-fg flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-admin-accent" />
            Security Policy & Access Requests
          </p>
          <p className="text-admin-fg-subtle text-[11px] leading-normal">
            If you are a team member requiring admin access, contact your platform operations administrator to register your email in the system configuration.
          </p>
        </div>

        <div className="pt-2">
          <Link
            href="/dashboard"
            className="w-full py-2.5 px-4 rounded-xl bg-admin-surface-raised hover:bg-admin-surface text-admin-fg-muted hover:text-admin-fg font-semibold text-xs transition-colors inline-flex items-center justify-center gap-2 border border-admin-border"
          >
            <ArrowLeft className="w-4 h-4" /> Return to Learner Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
