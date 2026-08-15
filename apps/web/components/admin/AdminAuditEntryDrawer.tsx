'use client'

import React from 'react'
import { AdminDrawer } from './AdminDrawer'
import { AdminDetailItem } from './AdminDetailItem'
import type { AdminAuditEntry } from '@/lib/admin/types'

interface AdminAuditEntryDrawerProps {
  entry: AdminAuditEntry | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Audit entry detail drawer (spec §7.6): actor, action, target and any
 * structured context captured with the entry.
 */
export function AdminAuditEntryDrawer({ entry, open, onOpenChange }: AdminAuditEntryDrawerProps) {
  return (
    <AdminDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Audit Entry"
      description={entry ? `${entry.action} · ${entry.targetResource}` : undefined}
      size="md"
    >
      {entry ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <AdminDetailItem label="Admin" value={<span className="text-xs text-admin-fg">{entry.adminEmail}</span>} />
            <AdminDetailItem
              label="Action"
              value={<span className="font-mono text-[11px] text-admin-accent font-semibold">{entry.action}</span>}
            />
            <AdminDetailItem label="Target" value={<span className="text-xs text-admin-fg">{entry.targetResource}</span>} />
            <AdminDetailItem
              label="Target ID"
              value={
                entry.targetId ? (
                  <span className="font-mono text-[11px] text-admin-fg-muted break-all">{entry.targetId}</span>
                ) : (
                  <span className="text-xs text-admin-fg-subtle">—</span>
                )
              }
            />
            <AdminDetailItem
              label="Timestamp"
              value={<span className="font-mono text-[11px] text-admin-fg-muted">{new Date(entry.createdAt).toLocaleString()}</span>}
            />
            <AdminDetailItem
              label="Status"
              value={<span className="text-xs text-admin-fg">Recorded</span>}
            />
          </div>

          {entry.details && (
            <div>
              <p className="text-[10px] font-bold text-admin-fg-subtle uppercase tracking-wider mb-1.5">Context</p>
              <pre className="p-3 rounded-lg bg-admin-bg/60 border border-admin-border text-[11px] font-mono text-admin-fg-muted overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(entry.details, null, 2)}
              </pre>
            </div>
          )}
        </div>
      ) : null}
    </AdminDrawer>
  )
}