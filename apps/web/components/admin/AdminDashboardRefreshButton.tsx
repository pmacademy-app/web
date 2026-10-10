'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { apiPost } from '@/lib/api/client'

const MIN_SPIN_MS = 600

/**
 * Drops the cached dashboard sections (tag `admin-dashboard`) and re-renders the page,
 * so the numbers are fresh rather than up to 90s old. If the revalidate call fails the
 * page still refreshes, showing whatever the cache holds.
 */
export function AdminDashboardRefreshButton() {
  const router = useRouter()
  const [posting, setPosting] = useState(false)
  const [isPending, startTransition] = useTransition()
  const refreshing = posting || isPending

  const handleRefresh = async () => {
    if (refreshing) return
    setPosting(true)
    const started = Date.now()
    const result = await apiPost('/api/admin/cache/revalidate', { tag: 'admin-dashboard' })
    if (!result.ok) {
      console.warn('[AdminDashboardRefreshButton] cache revalidate failed:', result.error.code)
    }
    startTransition(() => {
      router.refresh()
    })
    // Keep the spin visible briefly so a fast refresh still reads as feedback.
    const remaining = MIN_SPIN_MS - (Date.now() - started)
    setTimeout(() => setPosting(false), Math.max(0, remaining))
  }

  return (
    <button
      type="button"
      onClick={handleRefresh}
      disabled={refreshing}
      aria-label="Refresh operational metrics"
      aria-busy={refreshing}
      className="p-2 rounded-lg bg-admin-surface border border-admin-border hover:border-admin-border-strong text-admin-fg-muted hover:text-admin-fg transition-colors cursor-pointer disabled:opacity-50"
    >
      <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-admin-accent' : ''}`} />
    </button>
  )
}
