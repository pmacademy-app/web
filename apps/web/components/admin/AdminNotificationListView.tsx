'use client'

import React from 'react'
import { Bell, Info } from 'lucide-react'
import { AdminDataTable, Column } from './AdminDataTable'
import { AdminStatusBadge } from './AdminStatusBadge'
import { AdminSection } from './AdminSection'
import type { AdminNotificationEventItem } from '@/lib/admin/communications-service'

interface AdminNotificationListViewProps {
  events: AdminNotificationEventItem[]
}

export function AdminNotificationListView({ events }: AdminNotificationListViewProps) {
  const columns: Column<AdminNotificationEventItem>[] = [
    {
      header: 'Event Type',
      cell: (event) => (
        <span className="font-mono text-[11px] text-admin-accent font-semibold">{event.eventType}</span>
      ),
    },
    {
      header: 'User',
      cell: (event) =>
        event.userId ? (
          <span className="font-mono text-[11px] text-admin-fg-muted truncate block max-w-[180px]">{event.userId}</span>
        ) : (
          <span className="text-[11px] text-admin-fg-subtle">—</span>
        ),
    },
    {
      header: 'Channels',
      cell: (event) =>
        event.channelsNotified.length > 0 ? (
          <span className="text-[11px] text-admin-fg">{event.channelsNotified.join(', ')}</span>
        ) : (
          <span className="text-[11px] text-admin-fg-subtle">None</span>
        ),
    },
    {
      header: 'Outcome',
      cell: (event) =>
        event.skippedReason ? (
          <AdminStatusBadge status="warning" label="Skipped" />
        ) : (
          <AdminStatusBadge status="healthy" label="Processed" />
        ),
    },
    {
      header: 'Created',
      cell: (event) => (
        <span className="font-mono text-[11px] text-admin-fg-muted">
          {new Date(event.createdAt).toLocaleString()}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <AdminSection
        title="Notification Events"
        icon={Bell}
        meta={`${events.length} recent events`}
        bodyClassName="space-y-4"
      >
        <AdminDataTable
          columns={columns}
          data={events}
          keyExtractor={(event) => event.id}
          emptyTitle="No notification events yet"
          emptyDescription="Events dispatched through the notification platform will appear here for diagnostics."
        />
      </AdminSection>

      <div className="p-4 rounded-xl bg-admin-info-soft border border-admin-info/25 flex items-start gap-3">
        <Info className="w-4 h-4 text-admin-info shrink-0 mt-0.5" />
        <div className="text-[11px] text-admin-fg leading-relaxed space-y-1">
          <p className="font-bold text-admin-info uppercase tracking-wider">Notification Management</p>
          <p>
            Creating, scheduling and sending in-app notifications is not yet available — the notification
            platform currently dispatches events automatically from learning activity. This view is a
            read-only diagnostic of those events.
          </p>
        </div>
      </div>
    </div>
  )
}