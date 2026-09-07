'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, ShieldX, RotateCcw, Loader2, Check } from 'lucide-react'
import { useAdminToast } from '@/components/admin/admin-toast'

export interface UserPortfolioVerificationToggleProps {
  userId: string
  initialIsVerified: boolean
  initialOverride: 'verified' | 'rejected' | null | undefined
  userEmail: string
}

/**
 * Admin control for Portfolio Verification. Unlike PM Fellow (a pure
 * grant/revoke toggle), verification is AUTOMATIC by default — this control
 * only sets or clears an override, mirroring UserFellowToggle's pattern.
 */
export function UserPortfolioVerificationToggle({
  userId,
  initialIsVerified,
  initialOverride,
  userEmail,
}: UserPortfolioVerificationToggleProps) {
  const { toast } = useAdminToast()
  const router = useRouter()
  const [isVerified, setIsVerified] = useState(initialIsVerified)
  const [override, setOverride] = useState<'verified' | 'rejected' | null>(initialOverride ?? null)
  const [loading, setLoading] = useState<'verified' | 'rejected' | 'auto' | null>(null)
  const [success, setSuccess] = useState(false)

  const applyOverride = async (next: 'verified' | 'rejected' | null, action: 'verified' | 'rejected' | 'auto') => {
    setLoading(action)
    setSuccess(false)

    try {
      const res = await fetch(`/api/admin/users/${userId}/portfolio-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ override: next }),
      })

      const data = await res.json()
      if (res.ok && data.success) {
        setOverride(next)
        setIsVerified(next === 'verified' ? true : next === 'rejected' ? false : isVerified)
        setSuccess(true)
        toast(
          next === null
            ? `Portfolio verification for ${userEmail} restored to automatic evaluation.`
            : `Portfolio verification for ${userEmail} manually set to "${next}".`,
          'success'
        )
        setTimeout(() => setSuccess(false), 3000)
        router.refresh()
      } else {
        toast(data.error || 'Failed to update portfolio verification.', 'error')
      }
    } catch {
      toast('Network error updating portfolio verification.', 'error')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="p-3.5 rounded-xl bg-admin-surface border border-admin-border space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`p-1.5 rounded-lg border shrink-0 ${
              isVerified
                ? 'bg-admin-success-soft text-admin-success border-admin-success/25'
                : 'bg-admin-surface-raised text-admin-fg-muted border-admin-border'
            }`}
          >
            {isVerified ? <ShieldCheck className="w-4 h-4" /> : <ShieldX className="w-4 h-4" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-admin-fg">Portfolio Verification</span>
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                  isVerified
                    ? 'bg-admin-success-soft text-admin-success border-admin-success/30'
                    : 'bg-admin-surface-raised text-admin-fg-muted border-admin-border'
                }`}
              >
                {isVerified ? 'Verified' : 'Not Verified'}
              </span>
              {override && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border bg-admin-warning-soft text-admin-warning border-admin-warning/30">
                  Admin override
                </span>
              )}
            </div>
            <p className="text-[11px] text-admin-fg-muted mt-0.5">
              {override
                ? 'Automatic re-evaluation is paused while an override is active.'
                : 'Automatic — computed live from profile completeness.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {override !== null && (
            <button
              type="button"
              onClick={() => applyOverride(null, 'auto')}
              disabled={loading !== null}
              title="Restore automatic evaluation"
              className="px-2 py-1 rounded text-[11px] font-semibold border bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-fg-muted border-admin-border transition-all inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              {loading === 'auto' ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
              Reset to Auto
            </button>
          )}
          {override !== 'verified' && (
            <button
              type="button"
              onClick={() => applyOverride('verified', 'verified')}
              disabled={loading !== null}
              title="Manually verify this portfolio"
              className="px-2 py-1 rounded text-[11px] font-semibold border bg-admin-success-soft hover:bg-admin-success/20 text-admin-success border-admin-success/25 transition-all inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              {loading === 'verified' ? <Loader2 className="w-3 h-3 animate-spin" /> : success && loading === null ? <Check className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
              Verify
            </button>
          )}
          {override !== 'rejected' && (
            <button
              type="button"
              onClick={() => applyOverride('rejected', 'rejected')}
              disabled={loading !== null}
              title="Manually remove verification from this portfolio"
              className="px-2 py-1 rounded text-[11px] font-semibold border bg-admin-danger-soft hover:bg-admin-danger/20 text-admin-danger border-admin-danger/25 transition-all inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              {loading === 'rejected' ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldX className="w-3 h-3" />}
              Reject
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
