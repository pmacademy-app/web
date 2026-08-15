'use client'

import React, { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

/**
 * Admin console error boundary. Uses `unstable_retry` (Next.js 16.2) to
 * re-fetch and re-render the failed segment.
 */
export default function AdminConsoleError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    // Log to the configured error reporting service.
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-admin-danger/25 bg-admin-danger-soft/40 px-6 py-16 text-center">
      <div className="p-3 rounded-xl bg-admin-danger-soft border border-admin-danger/25">
        <AlertTriangle className="w-6 h-6 text-admin-danger stroke-[1.5]" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-bold text-admin-fg">Something went wrong</p>
        <p className="max-w-sm text-xs text-admin-fg-muted">
          We could not load this page. Please try again.
        </p>
        {error.digest && (
          <p className="mx-auto max-w-md rounded-lg bg-admin-surface px-3 py-2 font-mono text-[11px] text-admin-fg-muted break-all">
            Error ID: {error.digest}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={unstable_retry}
        className="mt-1 rounded-lg border border-admin-border bg-admin-surface px-4 py-1.5 text-xs font-semibold text-admin-fg transition-colors hover:bg-admin-surface-raised"
      >
        Try again
      </button>
    </div>
  )
}