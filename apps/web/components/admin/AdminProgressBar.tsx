import React from 'react'
import { cn } from '@/lib/utils'

/**
 * Admin progress bar — thin, rounded progress indicator with optional label.
 * Used for course progress and per-module completion in the Users workspace.
 */
export function AdminProgressBar({
  value,
  label,
  className,
  barClassName,
  showValue = true,
}: {
  /** 0–100 percentage. */
  value: number
  /** Optional left-aligned label text. */
  label?: string
  className?: string
  barClassName?: string
  showValue?: boolean
}) {
  const clamped = Math.min(100, Math.max(0, value))

  return (
    <div className={cn('space-y-1.5', className)}>
      {(label || showValue) && (
        <div className="flex items-center justify-between gap-2">
          {label && <span className="text-xs font-semibold text-admin-fg-muted truncate">{label}</span>}
          {showValue && (
            <span className="text-[11px] font-mono font-bold text-admin-fg-subtle shrink-0">
              {clamped.toFixed(1)}%
            </span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || 'Progress'}
        className="h-1.5 w-full overflow-hidden rounded-full bg-admin-surface-raised border border-admin-border"
      >
        <div
          className={cn(
            'h-full rounded-full bg-gradient-to-r from-admin-accent to-admin-info transition-all duration-500',
            barClassName
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}