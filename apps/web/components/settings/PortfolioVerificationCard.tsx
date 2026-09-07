import React from 'react'
import { ShieldCheck, ShieldX, CheckCircle2, Circle } from 'lucide-react'
import type { PortfolioVerificationStatus } from '@/lib/portfolio-readiness'
import { cn } from '@/lib/utils'

interface PortfolioVerificationCardProps {
  verification: PortfolioVerificationStatus
  hasAvatar: boolean
  hasBio: boolean
}

/**
 * Displays Automatic Portfolio Verification status. Unlike PM Fellow, there is
 * no request/approve action here — verification is computed live from the
 * same profile data as the readiness checklist above, and becomes active the
 * moment all criteria are met (or is set by an admin override).
 */
export function PortfolioVerificationCard({ verification, hasAvatar, hasBio }: PortfolioVerificationCardProps) {
  const { isVerified, source, linkCount } = verification

  const criteria = [
    { label: 'At least 2 of 3 social/portfolio links', met: linkCount >= 2, detail: `${linkCount} of 3 added` },
    { label: 'Profile photo added', met: hasAvatar },
    { label: 'Profile headline & bio written', met: hasBio },
  ]

  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-xs">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              'p-1.5 rounded-lg border',
              isVerified ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-muted border-border'
            )}
          >
            {isVerified ? (
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
            ) : (
              <ShieldX className="w-4 h-4 text-muted-foreground" />
            )}
          </span>
          <div>
            <h3 className="text-sm font-bold font-serif text-foreground">Portfolio Verification</h3>
            <p className="text-xs text-muted-foreground">
              Automatic — no approval needed once your profile meets every requirement below.
            </p>
          </div>
        </div>
        <span
          className={cn(
            'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0',
            isVerified
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
              : 'bg-muted text-muted-foreground border-border'
          )}
        >
          {isVerified ? 'Verified' : 'Not Verified'}
        </span>
      </div>

      {source === 'admin_rejected' && (
        <p className="text-[11px] text-muted-foreground bg-muted/40 border border-border rounded-lg p-2.5">
          An admin has removed verification from this portfolio. It will not automatically re-verify until an admin restores it.
        </p>
      )}
      {source === 'admin_verified' && (
        <p className="text-[11px] text-muted-foreground bg-muted/40 border border-border rounded-lg p-2.5">
          An admin has manually verified this portfolio.
        </p>
      )}

      <div className="space-y-1.5">
        {criteria.map((c) => (
          <div key={c.label} className="flex items-center gap-2 text-xs">
            {c.met ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            ) : (
              <Circle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            )}
            <span className={c.met ? 'text-foreground' : 'text-muted-foreground'}>{c.label}</span>
            {c.detail && <span className="text-muted-foreground font-mono text-[10px] ml-auto">{c.detail}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
