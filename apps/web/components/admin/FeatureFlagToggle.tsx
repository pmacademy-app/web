'use client'

import React, { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { AdminToggle } from './AdminToggle'
import { useAdminToast } from '@/components/admin/admin-toast'

export interface FeatureFlagToggleProps {
  flagKey: string
  initialEnabled: boolean
  disabled?: boolean
}

export function FeatureFlagToggle({ flagKey, initialEnabled, disabled = false }: FeatureFlagToggleProps) {
  const { toast } = useAdminToast()
  const [enabled, setEnabled] = useState(initialEnabled)
  const [loading, setLoading] = useState(false)

  const handleToggle = async (nextState: boolean) => {
    if (disabled || loading) return
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
    <div className="inline-flex items-center gap-2">
      {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-admin-accent" />}
      <AdminToggle
        pressed={enabled}
        onPressedChange={handleToggle}
        disabled={loading || disabled}
        aria-label={`Toggle feature flag ${flagKey}`}
      />
    </div>
  )
}
