import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Admin error state — shown when data failed to load.
 */
export function AdminErrorState({
  title = 'Something went wrong',
  description = 'We could not load this data. Please try again.',
  error,
  onRetry,
  className,
}: {
  title?: string
  description?: string
  error?: string | null
  onRetry?: () => void
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-admin-danger/25 bg-admin-danger-soft/40 px-6 py-14 text-center',
        className
      )}
    >
      <div className="p-3 rounded-xl bg-admin-danger-soft border border-admin-danger/25">
        <AlertTriangle className="w-6 h-6 text-admin-danger stroke-[1.5]" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-bold text-admin-fg">{title}</p>
        <p className="max-w-sm text-xs text-admin-fg-muted">{description}</p>
        {error && (
          <p className="mx-auto max-w-md rounded-lg bg-admin-surface px-3 py-2 font-mono text-[11px] text-admin-danger break-all">
            {error}
          </p>
        )}
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 rounded-lg border border-admin-border bg-admin-surface px-4 py-1.5 text-xs font-semibold text-admin-fg transition-colors hover:bg-admin-surface-raised"
        >
          Try again
        </button>
      )}
    </div>
  )
}
