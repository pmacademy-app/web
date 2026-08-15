'use client'

import React, { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useAdminToast } from '@/components/admin/admin-toast'

export interface FeatureFlagToggleProps {
  flagKey: string
  initialEnabled: boolean
}

export function FeatureFlagToggle({ flagKey, initialEnabled }: FeatureFlagToggleProps) {
  const { toast } = useAdminToast()
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
        toast(`Feature flag "${flagKey}" ${nextState ? 'enabled' : 'disabled'}.`, 'success')
      } else {
        toast(data.error || 'Failed to toggle feature flag.', 'error')
      }
    } catch {
      toast('Network error toggling feature flag.', 'error')
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
          ? 'bg-admin-danger-soft hover:bg-admin-danger/20 text-admin-danger border-admin-danger/25'
          : 'bg-admin-success-soft hover:bg-admin-success/20 text-admin-success border-admin-success/25'
      }`}
    >
      {loading && <Loader2 className="w-3 h-3 animate-spin" />}
      <span>{enabled ? 'Disable Flag' : 'Enable Flag'}</span>
    </button>
  )
}
