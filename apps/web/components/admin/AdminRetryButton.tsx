'use client'

import React from 'react'
import { useRouter } from 'next/navigation'

/**
 * "Try Again" button that re-runs the current server component (spec §63).
 *
 * Client component so it can call `router.refresh()` from server-rendered
 * pages and workspaces that render error / warning states.
 */
export function AdminRetryButton({ label = 'Try Again' }: { label?: string }) {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => router.refresh()}
      className="px-3 py-1.5 rounded-lg bg-admin-accent text-admin-accent-fg text-xs font-bold hover:bg-admin-accent/90 transition-colors cursor-pointer"
    >
      {label}
    </button>
  )
}