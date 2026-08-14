import React from 'react'
import Link from 'next/link'
import { BellRing, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AdminAttentionItem } from '@/lib/admin/types'

interface AdminAttentionCenterProps {
  items: AdminAttentionItem[]
}

const SEVERITY_STYLES: Record<AdminAttentionItem['severity'], { dot: string; badge: string }> = {
  critical: { dot: 'bg-admin-danger', badge: 'bg-admin-danger-soft text-admin-danger border-admin-danger/25' },
  warning: { dot: 'bg-admin-warning', badge: 'bg-admin-warning-soft text-admin-warning border-admin-warning/25' },
  healthy: { dot: 'bg-admin-success', badge: 'bg-admin-success-soft text-admin-success border-admin-success/25' },
}

export function AdminAttentionCenter({ items }: AdminAttentionCenterProps) {
  const hasAction = items.some((item) => item.count > 0)

  return (
    <div className="p-6 rounded-xl bg-admin-surface border border-admin-border space-y-4 shadow-xl">
      <div className="flex items-center justify-between border-b border-admin-border pb-4">
        <h2 className="text-sm font-bold text-admin-fg uppercase tracking-wider flex items-center gap-2">
          <BellRing className="w-4 h-4 text-admin-accent" />
          Attention Center
        </h2>
        <span className="text-[11px] font-mono text-admin-fg-muted">
          {items.filter((i) => i.count > 0).length} of {items.length} need review
        </span>
      </div>

      {!hasAction ? (
        <div className="p-4 rounded-lg bg-admin-success-soft border border-admin-success/25 flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-admin-success shrink-0" />
          <div>
            <p className="text-xs font-semibold text-admin-success">Everything looks good</p>
            <p className="text-[11px] text-admin-fg-muted">
              There are no important actions requiring your attention.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {items.map((item) => {
            const styles = SEVERITY_STYLES[item.severity]
            return (
              <div
                key={item.id}
                className="p-3 rounded-lg bg-admin-bg/60 border border-admin-border flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={cn('w-2 h-2 rounded-full shrink-0', styles.dot)} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-admin-fg truncate">{item.label}</p>
                    <p className="text-[11px] text-admin-fg-muted">{item.count} item{item.count === 1 ? '' : 's'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold border', styles.badge)}>
                    {item.count}
                  </span>
                  {item.count > 0 && (
                    <Link
                      href={item.href}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-admin-accent hover:underline"
                    >
                      {item.actionLabel}
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}