'use client'

import React, { useState } from 'react'
import { Loader2 } from 'lucide-react'

export interface FeatureFlagToggleProps {
  flagKey: string
  initialEnabled: boolean
}

export function FeatureFlagToggle({ flagKey, initialEnabled }: FeatureFlagToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [loading, setLoading] = useState(false)

  const handleToggle = async () => {
    const nextState = !enabled
    setLoading(true)

    try {
      const res = await fetch('/api/admin/feature-flags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: flagKey,
          enabled: nextState,
        }),
      })

      const data = await res.json()
      if (res.ok && data.success) {
        setEnabled(nextState)
      } else {
        alert(data.error || 'Failed to toggle feature flag.')
      }
    } catch {
      alert('Network error toggling feature flag.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`px-3 py-1 rounded text-[11px] font-bold border transition-colors inline-flex items-center gap-1.5 ${
        enabled
          ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/30'
          : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
      }`}
    >
      {loading && <Loader2 className="w-3 h-3 animate-spin" />}
      <span>{enabled ? 'Disable Flag' : 'Enable Flag'}</span>
    </button>
  )
}
