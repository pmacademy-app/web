'use client'

import React from 'react'
import { Activity, AlertTriangle } from 'lucide-react'
import { AdminDrawer } from './AdminDrawer'
import { AdminSystemStatusBadge } from './AdminSystemStatusBadge'
import { AdminEmptyState } from './AdminEmptyState'
import { AdminDetailItem } from './AdminDetailItem'
import { useIsMounted } from '@/lib/admin/use-is-mounted'
import type { AdminSystemServiceDetail } from '@/lib/admin/types'

interface AdminServiceDetailDrawerProps {
  detail: AdminSystemServiceDetail | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Service detail drawer (spec §7.3): current status, last check, relevant
 * metrics and recent failures. Data is computed server-side, so the drawer
 * opens instantly with no fetch.
 */
export function AdminServiceDetailDrawer({ detail, open, onOpenChange }: AdminServiceDetailDrawerProps) {
  const mounted = useIsMounted()

  const formatDateTime = (iso: string) => {
    if (!mounted || !iso) return ''
    try {
      return new Date(iso).toLocaleString()
    } catch {
      return iso
    }
  }

  return (
    <AdminDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={detail?.label || 'Service'}
      description={detail?.summary}
      size="md"
    >
      {detail ? (
        <div className="space-y-6">
          {/* Status */}
          <div className="flex items-center justify-between gap-3 p-4 rounded-xl bg-admin-bg/60 border border-admin-border">
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-admin-fg-subtle uppercase tracking-wider">Current Status</p>
              <p className="text-xs text-admin-fg-muted mt-1">
                Last checked {formatDateTime(detail.lastChecked)}
              </p>
            </div>
            <AdminSystemStatusBadge status={detail.status} />
          </div>

          {/* Metrics */}
          {detail.metrics.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-admin-fg uppercase tracking-wider mb-3">Metrics</h3>
              <div className="grid grid-cols-2 gap-3">
                {detail.metrics.map((m) => (
                  <AdminDetailItem key={m.label} label={m.label} value={<span className="font-mono text-sm font-semibold text-admin-fg">{m.value}</span>} />
                ))}
              </div>
            </div>
          )}

          {/* Recent failures */}
          <div>
            <h3 className="text-xs font-bold text-admin-fg uppercase tracking-wider mb-3">Recent Failures</h3>
            {detail.recentErrors.length === 0 ? (
              <AdminEmptyState
                icon={Activity}
                title="No recent failures"
                description="No operational errors have been recorded for this service."
              />
            ) : (
              <div className="space-y-2">
                {detail.recentErrors.map((err) => (
                  <div key={err.id} className="p-3 rounded-lg bg-admin-bg/60 border border-admin-border">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-admin-danger flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> {err.severity}
                      </span>
                      <span className="text-[10px] font-mono text-admin-fg-muted">
                        {formatDateTime(err.timestamp)}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-admin-fg mt-1.5 font-mono">{err.operation}</p>
                    <p className="text-[11px] text-admin-fg-muted mt-0.5 break-all">{err.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {detail.note && (
            <div className="p-3 rounded-lg bg-admin-info-soft border border-admin-info/25 text-[11px] text-admin-fg leading-relaxed">
              {detail.note}
            </div>
          )}
        </div>
      ) : null}
    </AdminDrawer>
  )
}