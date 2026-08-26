'use client'

import React, { useState, useTransition } from 'react'
import { Send, Plus, Play, XCircle, Clock, CheckCircle, AlertTriangle, RotateCcw, Eye } from 'lucide-react'
import { AdminCreateBroadcastModal } from './AdminCreateBroadcastModal'
import type { BroadcastRecord, BroadcastListResult } from '@/lib/admin/broadcast-service'

interface AdminBroadcastsViewProps {
  initialData: BroadcastListResult | null
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft:     { label: 'Draft',     color: 'text-admin-fg-muted bg-admin-surface-raised border-admin-border',  icon: Send },
  scheduled: { label: 'Scheduled', color: 'text-admin-info bg-admin-info-soft border-admin-info/25',            icon: Clock },
  sending:   { label: 'Sending',   color: 'text-admin-warning bg-admin-warning-soft border-admin-warning/25',  icon: RotateCcw },
  paused:    { label: 'Paused',    color: 'text-admin-warning bg-admin-warning-soft border-admin-warning/25',  icon: AlertTriangle },
  completed: { label: 'Completed', color: 'text-admin-success bg-admin-success-soft border-admin-success/25',  icon: CheckCircle },
  failed:    { label: 'Failed',    color: 'text-admin-danger bg-admin-danger-soft border-admin-danger/25',     icon: AlertTriangle },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${cfg.color}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  )
}

function ProgressBar({ sent, total }: { sent: number; total: number | null }) {
  if (!total) return <span className="text-admin-fg-subtle text-xs">—</span>
  const pct = Math.min(100, Math.round((sent / total) * 100))
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-1.5 rounded-full bg-admin-surface-raised overflow-hidden">
        <div className="h-full bg-admin-success rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-admin-fg-muted font-mono">{sent}/{total}</span>
    </div>
  )
}

export function AdminBroadcastsView({ initialData }: AdminBroadcastsViewProps) {
  const [showCreate, setShowCreate] = useState(false)
  const [broadcasts, setBroadcasts] = useState<BroadcastRecord[]>(initialData?.broadcasts ?? [])
  const [total] = useState(initialData?.total ?? 0)
  const [executing, setExecuting] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [actionMsg, setActionMsg] = useState<{ id: string; msg: string; type: 'success' | 'error' } | null>(null)

  const refresh = () => {
    startTransition(async () => {
      const res = await fetch('/api/admin/emails/broadcasts')
      const json = await res.json()
      if (json.data?.broadcasts) setBroadcasts(json.data.broadcasts)
    })
  }

  const handleExecute = async (id: string) => {
    setExecuting(id)
    setActionMsg(null)
    try {
      const res = await fetch(`/api/admin/emails/broadcasts/${id}/execute`, { method: 'POST' })
      const json = await res.json()
      if (json.success) {
        setActionMsg({ id, msg: `Batch sent: ${json.data.sent} emails, ${json.data.failed} failed. ${json.data.isComplete ? 'Broadcast complete!' : 'More batches remaining.'}`, type: 'success' })
        refresh()
      } else {
        setActionMsg({ id, msg: json.error || 'Execution failed.', type: 'error' })
      }
    } catch {
      setActionMsg({ id, msg: 'Network error.', type: 'error' })
    } finally {
      setExecuting(null)
    }
  }

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this broadcast? It will be moved back to draft.')) return
    setCancelling(id)
    try {
      const res = await fetch(`/api/admin/emails/broadcasts/${id}/cancel`, { method: 'POST' })
      const json = await res.json()
      if (json.success) refresh()
      else setActionMsg({ id, msg: json.error || 'Cancel failed.', type: 'error' })
    } catch {
      setActionMsg({ id, msg: 'Network error.', type: 'error' })
    } finally {
      setCancelling(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-admin-fg">Email Broadcasts</h2>
          <p className="text-xs text-admin-fg-muted mt-0.5">{total} total broadcasts</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-admin-accent text-admin-accent-fg text-xs font-bold hover:bg-admin-accent/90 transition-colors cursor-pointer"
          id="btn-new-broadcast"
        >
          <Plus className="w-4 h-4" />
          New Broadcast
        </button>
      </div>

      {/* Broadcast List */}
      {broadcasts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-admin-border text-center space-y-3">
          <Send className="w-8 h-8 text-admin-fg-subtle" />
          <p className="text-sm font-semibold text-admin-fg">No broadcasts yet</p>
          <p className="text-xs text-admin-fg-muted">Create your first email broadcast to target specific user segments.</p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-admin-accent text-admin-accent-fg text-xs font-bold hover:bg-admin-accent/90 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Create Broadcast
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-admin-border overflow-hidden bg-admin-surface shadow-xl">
          <table className="w-full text-xs">
            <thead className="bg-admin-bg/60 border-b border-admin-border">
              <tr>
                <th className="text-left px-4 py-3 font-bold text-admin-fg-muted uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 font-bold text-admin-fg-muted uppercase tracking-wider">Template</th>
                <th className="text-left px-4 py-3 font-bold text-admin-fg-muted uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 font-bold text-admin-fg-muted uppercase tracking-wider">Progress</th>
                <th className="text-left px-4 py-3 font-bold text-admin-fg-muted uppercase tracking-wider">Scheduled</th>
                <th className="text-right px-4 py-3 font-bold text-admin-fg-muted uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-admin-border">
              {broadcasts.map((b) => (
                <React.Fragment key={b.id}>
                  <tr className="hover:bg-admin-surface-raised/40 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-admin-fg">{b.name}</p>
                      {b.description && <p className="text-[11px] text-admin-fg-muted truncate max-w-48">{b.description}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-admin-fg-muted text-[11px] bg-admin-bg px-1.5 py-0.5 rounded">
                        {b.template_key}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={b.status} />
                    </td>
                    <td className="px-4 py-3">
                      <ProgressBar sent={b.sent_count} total={b.total_recipients} />
                      {(b.failed_count > 0) && (
                        <p className="text-[10px] text-admin-danger mt-0.5">{b.failed_count} failed</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-admin-fg-muted font-mono">
                      {b.scheduled_at ? new Date(b.scheduled_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {['draft', 'scheduled', 'sending', 'paused'].includes(b.status) && (
                          <button
                            id={`btn-execute-broadcast-${b.id.slice(0, 8)}`}
                            type="button"
                            onClick={() => handleExecute(b.id)}
                            disabled={executing === b.id}
                            title="Execute next batch"
                            className="inline-flex items-center gap-1 h-7 px-2.5 rounded bg-admin-success-soft border border-admin-success/25 text-admin-success text-[11px] font-semibold hover:bg-admin-success/20 transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            <Play className="w-3 h-3" />
                            {executing === b.id ? 'Sending…' : 'Execute'}
                          </button>
                        )}
                        {['draft', 'scheduled', 'paused'].includes(b.status) && (
                          <button
                            id={`btn-cancel-broadcast-${b.id.slice(0, 8)}`}
                            type="button"
                            onClick={() => handleCancel(b.id)}
                            disabled={cancelling === b.id}
                            title="Cancel broadcast"
                            className="inline-flex items-center gap-1 h-7 px-2.5 rounded bg-admin-surface-raised border border-admin-border text-admin-fg-muted text-[11px] font-semibold hover:text-admin-danger hover:border-admin-danger/30 transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            <XCircle className="w-3 h-3" />
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {actionMsg?.id === b.id && (
                    <tr>
                      <td colSpan={6} className="px-4 pb-3">
                        <div className={`p-2.5 rounded-lg text-xs font-medium ${actionMsg.type === 'success' ? 'bg-admin-success-soft text-admin-success border border-admin-success/25' : 'bg-admin-danger-soft text-admin-danger border border-admin-danger/25'}`}>
                          {actionMsg.msg}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Broadcast Modal */}
      {showCreate && (
        <AdminCreateBroadcastModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            refresh()
          }}
        />
      )}
    </div>
  )
}
