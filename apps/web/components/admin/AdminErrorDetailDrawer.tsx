'use client'

import React from 'react'
import { AdminDrawer } from './AdminDrawer'
import { AdminDetailItem } from './AdminDetailItem'
import { AdminErrorSeverityBadge, AdminErrorStatusBadge } from './AdminErrorBadges'
import type { AdminErrorGroup } from '@/lib/admin/types'

interface AdminErrorDetailDrawerProps {
  group: AdminErrorGroup | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Error detail drawer (spec §7.5): full message, severity, lifecycle status,
 * area, occurrence counts and the grouping fingerprint.
 */
export function AdminErrorDetailDrawer({ group, open, onOpenChange }: AdminErrorDetailDrawerProps) {
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
        </div>
      ) : null}
    </AdminDrawer>
  )
}