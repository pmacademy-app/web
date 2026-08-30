'use client'

import React, { useState } from 'react'
import {
  Bell,
  Plus,
  Send,
  Calendar,
  Search,
  CheckCircle2,
  Clock,
  Pause,
  Play,
  Trash2,
  Edit2,
  ChevronDown,
  ChevronUp,
  Info,
  Sparkles,
} from 'lucide-react'
import { AdminKpiCard } from './AdminKpiCard'
import { AdminStatusBadge } from './AdminStatusBadge'
import { AdminSection } from './AdminSection'
import { AdminDataTable, Column } from './AdminDataTable'
import { useAdminToast } from './admin-toast'
import { AdminCreateInAppNotificationModal } from './AdminCreateInAppNotificationModal'
import { AdminEditInAppNotificationModal } from './AdminEditInAppNotificationModal'
import type { InAppBroadcastItem } from '@/lib/admin/in-app-manager-service'
import type { AdminNotificationEventItem } from '@/lib/admin/communications-service'

interface AdminInAppNotificationViewProps {
  initialBroadcasts: InAppBroadcastItem[]
  initialMetrics: {
    totalCreated: number
    totalDelivered: number
    totalRead: number
    averageReadRate: number
    scheduledCount: number
    draftCount: number
  }
  diagnosticEvents: AdminNotificationEventItem[]
}

const STATUS_FILTERS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'completed', label: 'Completed' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'draft', label: 'Drafts' },
  { key: 'paused', label: 'Paused' },
  { key: 'cancelled', label: 'Cancelled' },
]

export function AdminInAppNotificationView({
  initialBroadcasts,
  initialMetrics,
  diagnosticEvents,
}: AdminInAppNotificationViewProps) {
  const { toast } = useAdminToast()

  const [broadcasts, setBroadcasts] = useState<InAppBroadcastItem[]>(initialBroadcasts)
  const [metrics, setMetrics] = useState(initialMetrics)
  const [activeStatus, setActiveStatus] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editingBroadcast, setEditingBroadcast] = useState<InAppBroadcastItem | null>(null)
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)

  // Filter items based on status & search
  const filteredBroadcasts = broadcasts.filter((b) => {
    if (activeStatus !== 'all' && b.status !== activeStatus) return false
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      if (!b.title.toLowerCase().includes(q) && !b.body.toLowerCase().includes(q)) {
        return false
      }
    }
    return true
  })

  // Action handlers
  const handleExecuteNow = async (id: string) => {
    setActionLoadingId(id)
    try {
      const res = await fetch(`/api/admin/notifications/in-app/${id}/execute`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Execution failed')
      }

      toast(`Notification dispatched to ${json.delivered} learners!`, 'success')
      setBroadcasts((prev) =>
        prev.map((b) =>
          b.id === id
            ? {
                ...b,
                status: 'completed',
                sentAt: new Date().toISOString(),
                totalTargeted: json.targeted,
                totalDelivered: json.delivered,
              }
            : b
        )
      )
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Execution failed', 'error')
    } finally {
      setActionLoadingId(null)
    }
  }

  const handlePause = async (id: string) => {
    setActionLoadingId(id)
    try {
      const res = await fetch(`/api/admin/notifications/in-app/${id}/pause`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Pause failed')

      toast('Scheduled notification paused.', 'success')
      setBroadcasts((prev) => prev.map((b) => (b.id === id ? { ...b, status: 'paused' } : b)))
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Pause failed', 'error')
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleResume = async (id: string) => {
    setActionLoadingId(id)
    try {
      const res = await fetch(`/api/admin/notifications/in-app/${id}/resume`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Resume failed')

      toast('Scheduled notification resumed.', 'success')
      setBroadcasts((prev) => prev.map((b) => (b.id === id ? { ...b, status: 'scheduled' } : b)))
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Resume failed', 'error')
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleCancel = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this scheduled notification?')) return
    setActionLoadingId(id)
    try {
      const res = await fetch(`/api/admin/notifications/in-app/${id}/cancel`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Cancel failed')

      toast('Notification cancelled.', 'success')
      setBroadcasts((prev) => prev.map((b) => (b.id === id ? { ...b, status: 'cancelled', scheduledAt: null } : b)))
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Cancel failed', 'error')
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this notification record?')) return
    setActionLoadingId(id)
    try {
      const res = await fetch(`/api/admin/notifications/in-app/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Delete failed')

      toast('Notification deleted.', 'success')
      setBroadcasts((prev) => prev.filter((b) => b.id !== id))
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Delete failed', 'error')
    } finally {
      setActionLoadingId(null)
    }
  }

  const columns: Column<InAppBroadcastItem>[] = [
    {
      header: 'Notification',
      cell: (item) => (
        <div className="space-y-1 max-w-sm">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-xs text-admin-fg">{item.title}</span>
            {item.actionUrl && (
              <span className="text-[10px] text-admin-fg-muted font-mono px-1.5 py-0.2 rounded bg-admin-surface-raised">
                {item.actionUrl}
              </span>
            )}
          </div>
          <p className="text-[11px] text-admin-fg-muted line-clamp-1">{item.body}</p>
        </div>
      ),
    },
    {
      header: 'Audience',
      cell: (item) => {
        let badgeText = 'All Learners'
        if (item.audience === 'cohort') badgeText = 'Cohort'
        if (item.audience === 'individual') badgeText = 'User'
        if (item.audience === 'filtered') badgeText = 'Filtered'
        return (
          <span className="px-2 py-0.5 text-[11px] font-semibold rounded bg-admin-surface-raised border border-admin-border text-admin-fg">
            {badgeText}
          </span>
        )
      },
    },
    {
      header: 'Priority',
      cell: (item) => {
        const p = item.priority
        const color =
          p === 'urgent'
            ? 'text-red-400 border-red-500/25 bg-red-500/10'
            : p === 'high'
            ? 'text-amber-400 border-amber-500/25 bg-amber-500/10'
            : p === 'medium'
            ? 'text-blue-400 border-blue-500/25 bg-blue-500/10'
            : 'text-slate-400 border-slate-500/25 bg-slate-500/10'

        return (
          <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded border ${color}`}>
            {p}
          </span>
        )
      },
    },
    {
      header: 'Timing & Dates',
      cell: (item) => (
        <div className="text-[11px] space-y-0.5">
          {item.sentAt ? (
            <div className="text-admin-fg">
              <span className="text-admin-fg-muted">Sent: </span>
              {new Date(item.sentAt).toLocaleDateString()}
            </div>
          ) : item.scheduledAt ? (
            <div className="text-admin-accent flex items-center gap-1 font-mono">
              <Clock className="w-3 h-3" />
              {new Date(item.scheduledAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          ) : (
            <div className="text-admin-fg-subtle">Draft</div>
          )}
          {item.expiresAt && (
            <div className="text-[10px] text-admin-fg-subtle">
              Exp: {new Date(item.expiresAt).toLocaleDateString()}
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'Status',
      cell: (item) => {
        switch (item.status) {
          case 'completed':
            return <AdminStatusBadge status="healthy" label="Delivered" />
          case 'scheduled':
            return <AdminStatusBadge status="warning" label="Scheduled" />
          case 'sending':
            return <AdminStatusBadge status="warning" label="Sending..." />
          case 'paused':
            return <AdminStatusBadge status="neutral" label="Paused" />
          case 'cancelled':
            return <AdminStatusBadge status="error" label="Cancelled" />
          default:
            return <AdminStatusBadge status="neutral" label="Draft" />
        }
      },
    },
    {
      header: 'Delivered / Read',
      cell: (item) => (
        <div className="space-y-1 min-w-[100px]">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-admin-fg font-semibold">{item.totalDelivered}</span>
            <span className="text-admin-fg-muted">{item.readRate}% read</span>
          </div>
          {item.totalDelivered > 0 && (
            <div className="w-full bg-admin-surface-raised h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-admin-accent h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, item.readRate)}%` }}
              />
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'Actions',
      cell: (item) => {
        const isLoading = actionLoadingId === item.id

        return (
          <div className="flex items-center gap-1.5">
            {(item.status === 'draft' || item.status === 'scheduled' || item.status === 'sending' || item.status === 'failed') && (
              <button
                type="button"
                disabled={isLoading}
                onClick={() => handleExecuteNow(item.id)}
                className="p-1 rounded bg-admin-accent-soft text-admin-accent hover:bg-admin-accent hover:text-admin-accent-fg transition-colors cursor-pointer"
                title={item.status === 'sending' || item.status === 'failed' ? 'Retry Dispatch' : 'Send Immediately'}
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            )}

            {item.status !== 'cancelled' && (
              <button
                type="button"
                disabled={isLoading}
                onClick={() => setEditingBroadcast(item)}
                className="p-1 rounded text-admin-fg-muted hover:text-admin-fg hover:bg-admin-surface-raised transition-colors cursor-pointer"
                title="Edit Notification"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            )}

            {item.status === 'scheduled' && (
              <button
                type="button"
                disabled={isLoading}
                onClick={() => handlePause(item.id)}
                className="p-1 rounded text-amber-400 hover:bg-amber-400/10 transition-colors cursor-pointer"
                title="Pause Schedule"
              >
                <Pause className="w-3.5 h-3.5" />
              </button>
            )}

            {item.status === 'paused' && (
              <button
                type="button"
                disabled={isLoading}
                onClick={() => handleResume(item.id)}
                className="p-1 rounded text-admin-accent hover:bg-admin-accent-soft transition-colors cursor-pointer"
                title="Resume Schedule"
              >
                <Play className="w-3.5 h-3.5" />
              </button>
            )}

            {(item.status === 'scheduled' || item.status === 'sending' || item.status === 'failed') && (
              <button
                type="button"
                disabled={isLoading}
                onClick={() => handleCancel(item.id)}
                className="p-1 rounded text-red-400 hover:bg-red-400/10 transition-colors cursor-pointer"
                title="Cancel Notification"
              >
                <Clock className="w-3.5 h-3.5" />
              </button>
            )}

            {(item.status === 'draft' || item.status === 'cancelled' || item.status === 'failed') && (
              <button
                type="button"
                disabled={isLoading}
                onClick={() => handleDelete(item.id)}
                className="p-1 rounded text-red-400 hover:bg-red-400/10 transition-colors cursor-pointer"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )
      },
    },
  ]

  const diagnosticColumns: Column<AdminNotificationEventItem>[] = [
    {
      header: 'Event Type',
      cell: (event) => (
        <span className="font-mono text-[11px] text-admin-accent font-semibold">{event.eventType}</span>
      ),
    },
    {
      header: 'User ID',
      cell: (event) => (
        <span className="font-mono text-[11px] text-admin-fg-muted truncate block max-w-[160px]">
          {event.userId || '—'}
        </span>
      ),
    },
    {
      header: 'Channels',
      cell: (event) => (
        <span className="text-[11px] text-admin-fg">{event.channelsNotified.join(', ') || 'None'}</span>
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
      header: 'Timestamp',
      cell: (event) => (
        <span className="font-mono text-[11px] text-admin-fg-muted">
          {new Date(event.createdAt).toLocaleString()}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <AdminKpiCard
          title="Total In-App Dispatches"
          value={metrics.totalCreated}
          subtitle="Admin notification campaigns"
          icon={Bell}
        />
        <AdminKpiCard
          title="In-App Delivered"
          value={metrics.totalDelivered}
          subtitle="Total inbox deliveries"
          icon={Send}
        />
        <AdminKpiCard
          title="Total Read"
          value={metrics.totalRead}
          subtitle="Opened by learners"
          icon={CheckCircle2}
        />
        <AdminKpiCard
          title="Average Read Rate"
          value={`${metrics.averageReadRate}%`}
          subtitle="Learner open engagement"
          icon={Sparkles}
        />
        <AdminKpiCard
          title="Scheduled Alerts"
          value={metrics.scheduledCount}
          subtitle="Awaiting future delivery"
          icon={Calendar}
        />
      </div>

      {/* Main Operational Section */}
      <AdminSection
        title="In-App Notification Manager"
        icon={Bell}
        actions={
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-admin-accent text-admin-accent-fg hover:bg-admin-accent/90 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" /> Create In-App Notification
          </button>
        }
        bodyClassName="space-y-4"
      >
        {/* Controls: Search + Filter tabs */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-admin-border pb-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {STATUS_FILTERS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveStatus(tab.key)}
                className={`px-3 py-1 text-xs rounded-lg transition-colors cursor-pointer ${
                  activeStatus === tab.key
                    ? 'bg-admin-accent-soft text-admin-accent font-semibold border border-admin-accent/30'
                    : 'text-admin-fg-muted hover:text-admin-fg'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative max-w-xs w-full">
            <Search className="w-3.5 h-3.5 text-admin-fg-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notifications..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-admin-surface-raised border border-admin-border rounded-lg text-admin-fg placeholder:text-admin-fg-subtle focus:outline-none focus:border-admin-accent"
            />
          </div>
        </div>

        {/* In-App Broadcasts Table */}
        <AdminDataTable
          columns={columns}
          data={filteredBroadcasts}
          keyExtractor={(item) => item.id}
          emptyTitle="No in-app notifications found"
          emptyDescription="Create a new in-app notification to dispatch direct alerts, announcements, and reminders to learners."
        />
      </AdminSection>

      {/* Diagnostics Collapsible */}
      <div className="border border-admin-border rounded-xl bg-admin-surface overflow-hidden">
        <button
          type="button"
          onClick={() => setShowDiagnostics(!showDiagnostics)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-admin-surface-raised/40 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-admin-info" />
            <div>
              <span className="text-xs font-bold text-admin-fg">Automated Event Trigger Diagnostics</span>
              <p className="text-[11px] text-admin-fg-muted">
                Inspect low-level notification dispatcher events triggered by learner curriculum activity
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-admin-fg-subtle">{diagnosticEvents.length} events logged</span>
            {showDiagnostics ? <ChevronUp className="w-4 h-4 text-admin-fg-muted" /> : <ChevronDown className="w-4 h-4 text-admin-fg-muted" />}
          </div>
        </button>

        {showDiagnostics && (
          <div className="p-4 border-t border-admin-border space-y-3">
            <AdminDataTable
              columns={diagnosticColumns}
              data={diagnosticEvents}
              keyExtractor={(e) => e.id}
              emptyTitle="No diagnostic events"
              emptyDescription="Curriculum and achievement events will appear here in real-time."
            />
          </div>
        )}
      </div>

      {/* Modals */}
      <AdminCreateInAppNotificationModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={(newItem) => {
          setBroadcasts((prev) => [newItem, ...prev])
          setMetrics((prev) => ({
            ...prev,
            totalCreated: prev.totalCreated + 1,
            totalDelivered: newItem.status === 'completed' ? prev.totalDelivered + newItem.totalDelivered : prev.totalDelivered,
            scheduledCount: newItem.status === 'scheduled' ? prev.scheduledCount + 1 : prev.scheduledCount,
          }))
        }}
      />

      <AdminEditInAppNotificationModal
        open={Boolean(editingBroadcast)}
        onClose={() => setEditingBroadcast(null)}
        broadcast={editingBroadcast}
        onUpdated={(updated) => {
          setBroadcasts((prev) => prev.map((b) => (b.id === updated.id ? updated : b)))
        }}
      />
    </div>
  )
}
