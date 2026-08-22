'use client'

import React, { useState } from 'react'
import { AdminDrawer } from './AdminDrawer'
import { AdminDetailItem } from './AdminDetailItem'
import { AdminErrorSeverityBadge, AdminErrorStatusBadge } from './AdminErrorBadges'
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import type { AdminErrorGroup } from '@/lib/admin/types'

interface AdminErrorDetailDrawerProps {
  group: AdminErrorGroup | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onStatusChange?: (fingerprint: string, status: 'acknowledged' | 'resolved') => void
}

/**
 * Error detail drawer (spec §7.5): full message, severity, lifecycle status,
 * area, occurrence counts, grouping fingerprint, and status actions.
 */
export function AdminErrorDetailDrawer({ group, open, onOpenChange, onStatusChange }: AdminErrorDetailDrawerProps) {
  const [updating, setUpdating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleUpdateStatus = async (newStatus: 'acknowledged' | 'resolved') => {
    if (!group) return
    setUpdating(newStatus)
    setError(null)
    try {
      const res = await fetch('/api/admin/system/errors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint: group.fingerprint, newStatus }),
      })
      const data = await res.json()
      if (data.success) {
        onStatusChange?.(group.fingerprint, newStatus)
        onOpenChange(false)
      } else {
        setError(data.error || 'Failed to update status.')
      }
    } catch {
      setError('Network error while updating error status.')
    } finally {
      setUpdating(null)
    }
  }

  return (
    <AdminDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Error Details"
      description={group?.operation}
      size="md"
    >
      {group ? (
        <div className="space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="p-4 rounded-xl bg-admin-bg/60 border border-admin-border">
            <p className="text-[10px] font-bold text-admin-fg-subtle uppercase tracking-wider mb-1.5">Message</p>
            <p className="text-xs font-mono text-admin-fg break-all">{group.message}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <AdminDetailItem label="Severity" value={<AdminErrorSeverityBadge severity={group.severity} />} />
            <AdminDetailItem label="Status" value={<AdminErrorStatusBadge status={group.status} />} />
            <AdminDetailItem
              label="Area"
              value={
                <span className="px-2 py-0.5 rounded bg-admin-surface-raised text-admin-fg-muted text-[10px] font-mono uppercase">
                  {group.category}
                </span>
              }
            />
            <AdminDetailItem label="Occurrences" value={<span className="font-mono text-sm font-semibold text-admin-fg">{group.occurrences}</span>} />
            <AdminDetailItem label="First Seen" value={<span className="font-mono text-[11px] text-admin-fg-muted">{new Date(group.firstSeen).toLocaleString()}</span>} />
            <AdminDetailItem label="Last Seen" value={<span className="font-mono text-[11px] text-admin-fg-muted">{new Date(group.lastSeen).toLocaleString()}</span>} />
          </div>

          <div className="p-3 rounded-lg bg-admin-surface-raised border border-admin-border">
            <p className="text-[10px] font-bold text-admin-fg-subtle uppercase tracking-wider mb-1">Fingerprint</p>
            <p className="font-mono text-[11px] text-admin-fg-muted break-all">{group.fingerprint}</p>
          </div>

          {/* Action buttons */}
          <div className="pt-4 border-t border-admin-border flex items-center gap-3">
            {group.status !== 'acknowledged' && group.status !== 'resolved' && (
              <button
                type="button"
                disabled={updating !== null}
                onClick={() => void handleUpdateStatus('acknowledged')}
                className="flex-1 py-2 px-3 text-xs font-semibold rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {updating === 'acknowledged' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Acknowledge</span>
              </button>
            )}
            {group.status !== 'resolved' && (
              <button
                type="button"
                disabled={updating !== null}
                onClick={() => void handleUpdateStatus('resolved')}
                className="flex-1 py-2 px-3 text-xs font-semibold rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {updating === 'resolved' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>Resolve</span>
              </button>
            )}
          </div>
        </div>
      ) : null}
    </AdminDrawer>
  )
}