'use client'

import React from 'react'
import { ShieldCheck, CheckCircle2 } from 'lucide-react'

interface VerificationBadgeProps {
  certificateCode: string
  issuedAt: string
}

export function VerificationBadge({ certificateCode, issuedAt }: VerificationBadgeProps) {
  const formattedDate = new Date(issuedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div className="no-print rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-center justify-between gap-4 text-emerald-500 animate-in fade-in duration-300">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-500 shrink-0">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-1.5 font-bold text-xs">
            <CheckCircle2 className="w-4 h-4" />
            <span>Official PM Academy Credential Verified</span>
          </div>
          <p className="text-[11px] opacity-90 mt-0.5 font-sans">
            Immutable proof of completion. Issued on {formattedDate}.
          </p>
        </div>
      </div>

      <div className="text-right font-mono text-[11px] font-bold text-emerald-500 shrink-0 hidden sm:block">
        Code: {certificateCode}
      </div>
    </div>
  )
}
