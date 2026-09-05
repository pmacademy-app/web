'use client'

import React, { useEffect, useState } from 'react'
import { Award, Loader2, CheckCircle2, Clock, XCircle, AlertCircle, Sparkles } from 'lucide-react'
import type { PortfolioReadinessSummary } from '@/lib/portfolio-readiness'
import type { FellowRequestUiState } from '@/lib/fellow'

interface FellowStatePayload {
  state: FellowRequestUiState
  canSubmit: boolean
  isEligible: boolean
  readiness: PortfolioReadinessSummary
  latestRequest: {
    status: 'pending' | 'approved' | 'rejected'
    requestedAt: string
    rejectionReason: string | null
  } | null
}

/**
 * Pure network call with no React state coupling — safe to invoke from anywhere
 * (mount effect, retry handler, post-submit refresh) without risking the
 * "setState synchronously within an effect" pitfall.
 */
async function fetchFellowState(): Promise<{ ok: true; data: FellowStatePayload } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/fellow-requests')
    const json = await res.json()
    if (!res.ok || !json.success) {
      return { ok: false, error: json.error || 'Failed to load Fellow status.' }
    }
    return { ok: true, data: json as FellowStatePayload }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to load Fellow status.' }
  }
}

export function FellowRequestCard() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<FellowStatePayload | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justSubmitted, setJustSubmitted] = useState(false)

  useEffect(() => {
    let isMounted = true
    fetchFellowState().then((result) => {
      if (!isMounted) return
      if (result.ok) {
        setData(result.data)
        setError(null)
      } else {
        setError(result.error)
      }
      setLoading(false)
    })
    return () => {
      isMounted = false
    }
  }, [])

  const handleRetry = () => {
    setLoading(true)
    setError(null)
    fetchFellowState().then((result) => {
      if (result.ok) {
        setData(result.data)
        setError(null)
      } else {
        setError(result.error)
      }
      setLoading(false)
    })
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/fellow-requests', { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to submit Fellow request.')
      }
      setJustSubmitted(true)
      const refreshed = await fetchFellowState()
      if (refreshed.ok) {
        setData(refreshed.data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit Fellow request.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 flex items-center gap-3 text-xs text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
        <span>Checking PM Fellow eligibility…</span>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 space-y-3">
        <div className="flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400">
          <AlertCircle className="w-4 h-4" />
          <span>{error || 'Failed to load Fellow status.'}</span>
        </div>
        <button
          type="button"
          onClick={handleRetry}
          className="text-xs font-semibold text-primary hover:underline"
        >
          Retry
        </button>
      </div>
    )
  }

  const missingItems = data.readiness.items.filter((i) => !i.isComplete)

  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-xs">
      <div className="flex items-center gap-2.5 border-b border-border pb-4">
        <span className="p-1.5 rounded-lg bg-primary/10 border border-primary/20">
          <Award className="w-4 h-4 text-primary" />
        </span>
        <div>
          <h3 className="text-sm font-bold font-serif text-foreground">PM Fellow Status</h3>
          <p className="text-xs text-muted-foreground">
            A distinction awarded to learners with a fully complete, portfolio-ready profile.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {data.state === 'approved' && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
          <div>
            <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">You are a PM Fellow</p>
            <p className="text-[11px] text-muted-foreground">Your Fellow badge is live on your public portfolio.</p>
          </div>
        </div>
      )}

      {data.state === 'pending' && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center gap-3">
          <Clock className="w-5 h-5 text-amber-500 shrink-0" />
          <div>
            <p className="text-xs font-bold text-amber-600 dark:text-amber-400">Request Submitted</p>
            <p className="text-[11px] text-muted-foreground">
              {data.latestRequest?.requestedAt
                ? `Submitted ${new Date(data.latestRequest.requestedAt).toLocaleDateString()}. `
                : ''}
              An admin will review your request soon.
            </p>
          </div>
        </div>
      )}

      {data.state === 'rejected' && (
        <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-1">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs font-bold text-foreground">Previous Request Not Approved</p>
          </div>
          {data.latestRequest?.rejectionReason && (
            <p className="text-[11px] text-muted-foreground pl-6">{data.latestRequest.rejectionReason}</p>
          )}
          <p className="text-[11px] text-muted-foreground pl-6">
            Complete every item below to become eligible to request again.
          </p>
        </div>
      )}

      {(data.state === 'not_eligible' || data.state === 'eligible' || data.state === 'rejected') && missingItems.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Remaining Requirements ({data.readiness.completedCount}/{data.readiness.totalCount})
          </p>
          <ul className="space-y-1">
            {missingItems.map((item) => (
              <li key={item.id} className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-muted-foreground/60" />
                {item.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.state === 'eligible' && (
        <div className="space-y-3">
          {justSubmitted ? (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Fellow request submitted successfully.
            </div>
          ) : (
            <>
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-foreground flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary shrink-0" />
                Your portfolio meets every requirement — you&apos;re eligible to request PM Fellow status.
              </div>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Award className="w-3.5 h-3.5" />}
                Request PM Fellow
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
