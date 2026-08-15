'use client'

import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { AdminRetryButton } from './AdminRetryButton'

/**
 * Compact warning banner shown above static content when a live data query
 * failed (spec §63). The static content stays visible — only the live stats
 * are missing — so the banner explains what failed and offers a retry.
 */
export function AdminLoadWarning({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-admin-warning/30 bg-admin-warning-soft/40 px-4 py-3"
    >
      <div className="flex items-center gap-2 min-w-0">
        <AlertTriangle className="w-4 h-4 text-admin-warning shrink-0" />
        <p className="text-xs font-semibold text-admin-fg">{message}</p>
      </div>
      <AdminRetryButton />
    </div>
  )
}