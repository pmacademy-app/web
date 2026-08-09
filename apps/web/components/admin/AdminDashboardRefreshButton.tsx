'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'

export function AdminDashboardRefreshButton() {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = () => {
    setRefreshing(true)
    router.refresh()
    setTimeout(() => {
      setRefreshing(false)
    }, 600)
  }

  return (
    <button
      type="button"
      onClick={handleRefresh}
      disabled={refreshing}
      aria-label="Refresh operational metrics"
      className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
    >
      <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-amber-400' : ''}`} />
    </button>
  )
}
