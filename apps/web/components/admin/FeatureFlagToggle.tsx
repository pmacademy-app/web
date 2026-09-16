'use client'

import React, { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { AdminToggle } from './AdminToggle'
import { useAdminToast } from '@/components/admin/admin-toast'
import { apiPatch } from '@/lib/api/client'

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
      const result = await apiPatch<{ success: boolean; error?: string }>('/api/admin/feature-flags', {
        key: flagKey,
        enabled: nextState,
      })

      if (result.ok && result.data.success) {
        setEnabled(nextState)
        toast(`Feature flag "${flagKey}" ${nextState ? 'enabled' : 'disabled'}.`, 'success')
      } else {
        const errorMsg = !result.ok ? result.error.message : (result.data.error || 'Failed to toggle feature flag.')
        toast(errorMsg, 'error')
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
