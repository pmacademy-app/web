'use client'

import React from 'react'
import {
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react'
import type { PortfolioReadinessSummary } from '@/lib/portfolio-readiness'

interface PortfolioReadinessCardProps {
  readiness: PortfolioReadinessSummary
  username?: string
  isPublic?: boolean
}

export function PortfolioReadinessCard({
  readiness,
  username,
  isPublic = true,
}: PortfolioReadinessCardProps) {
  const { isReadyToShare, completedCount, totalCount, items, statusLabel, recommendation } = readiness

  const scrollToAnchor = (anchorId?: string) => {
    if (!anchorId) return
    const el = document.getElementById(anchorId)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.focus()
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-5 shadow-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold font-serif text-foreground flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <span>Portfolio Sharing Readiness</span>
            </h3>
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                isReadyToShare
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
                  : statusLabel === 'Needs Attention'
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25'
                  : 'bg-muted text-muted-foreground border-border'
              }`}
            >
              {statusLabel}
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {recommendation}
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto shrink-0">
          <span className="text-xs font-mono font-semibold text-muted-foreground">
            {completedCount} of {totalCount} completed
          </span>
          {isReadyToShare && username && isPublic && (
            <a
              href={`/p/${encodeURIComponent(username)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 text-xs font-bold transition-colors"
            >
              <span>View Public Page</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {/* Checklist Items Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {items.map((item) => {
          return (
            <div
              key={item.id}
              className={`p-3.5 rounded-xl border transition-all flex items-start justify-between gap-3 ${
                item.isComplete
                  ? 'border-border/60 bg-background/50'
                  : item.importance === 'essential'
                  ? 'border-amber-500/30 bg-amber-500/5'
                  : 'border-border/80 bg-card/40'
              }`}
            >
              <div className="flex items-start gap-2.5 min-w-0">
                {item.isComplete ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle
                    className={`w-4 h-4 shrink-0 mt-0.5 ${
                      item.importance === 'essential' ? 'text-amber-500' : 'text-muted-foreground'
                    }`}
                  />
                )}
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-foreground">
                      {item.label}
                    </span>
                    {item.importance === 'essential' && !item.isComplete && (
                      <span className="text-[9px] uppercase font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                        Required
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    {item.description}
                  </p>
                </div>
              </div>

              {!item.isComplete && item.actionAnchor && (
                <button
                  type="button"
                  onClick={() => scrollToAnchor(item.actionAnchor)}
                  className="text-primary hover:underline text-[11px] font-bold shrink-0 inline-flex items-center gap-0.5 mt-0.5"
                >
                  <span>Edit</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Guidance Note */}
      <div className="p-3.5 rounded-xl bg-muted/40 border border-border text-[11px] text-muted-foreground flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
        <span>
          <strong>Early-Career Note:</strong> Applied portfolio projects and case studies are fully evaluated as legitimate proof-of-work. You do not need corporate employment history or client logos to have a share-ready portfolio.
        </span>
      </div>
    </div>
  )
}
