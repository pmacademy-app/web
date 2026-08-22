'use client'

import React, { useState } from 'react'
import { Star, MessageSquare, Check, Clock, Lightbulb, CheckCircle2, XCircle, Mail, User } from 'lucide-react'
import { AdminDataTable, Column } from './AdminDataTable'
import { AdminDrawer } from './AdminDrawer'
import { AdminEmptyState } from './AdminEmptyState'
import { AdminStatusBadge } from './AdminStatusBadge'
import { useAdminToast } from './admin-toast'

export interface AdminFeedbackItem {
  id: string
  userId: string | null
  authorName: string
  authorEmail: string | null
  userExists: boolean
  category: string
  sourceEvent: string
  content: string
  rating: number | null
  status: string
  createdAt: string
}

export function FeedbackListView({ initialFeedback }: { initialFeedback: AdminFeedbackItem[] }) {
  const [feedbackList, setFeedbackList] = useState<AdminFeedbackItem[]>(initialFeedback)
  const [selected, setSelected] = useState<AdminFeedbackItem | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const { toast } = useAdminToast()

  const handleStatusChange = async (feedbackId: string, newStatus: string) => {
    setIsUpdating(true)
    try {
      const res = await fetch(`/api/admin/feedback/${feedbackId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_status', status: newStatus }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast(`Feedback marked as ${newStatus}.`, 'success')
        setFeedbackList((prev) =>
          prev.map((item) => (item.id === feedbackId ? { ...item, status: newStatus } : item))
        )
        if (selected && selected.id === feedbackId) {
          setSelected((prev) => (prev ? { ...prev, status: newStatus } : null))
        }
      } else {
        toast(data.error || 'Failed to update status.', 'error')
      }
    } catch {
      toast('Network error updating feedback status.', 'error')
    } finally {
      setIsUpdating(false)
    }
  }

  const columns: Column<AdminFeedbackItem>[] = [
    {
      header: 'Author',
      cell: (item) => (
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5">
            <p className="font-bold text-admin-fg text-xs truncate max-w-[160px]">{item.authorName}</p>
            {!item.userId ? (
              <span className="text-[9px] px-1 py-0.2 rounded bg-admin-surface text-admin-fg-subtle border border-admin-border">Anon</span>
            ) : !item.userExists ? (
              <span className="text-[9px] px-1 py-0.2 rounded bg-admin-danger/10 text-admin-danger border border-admin-danger/20">Deleted</span>
            ) : null}
          </div>
          {item.authorEmail ? (
            <p className="text-[11px] text-admin-fg-muted font-mono truncate max-w-[180px]">{item.authorEmail}</p>
          ) : (
            <p className="text-[10px] text-admin-fg-subtle font-mono">{item.category}</p>
          )}
        </div>
      ),
    },
    {
      header: 'Category',
      cell: (item) => (
        <span className="px-2 py-0.5 rounded bg-admin-surface-raised text-admin-accent font-mono text-[10px] border border-admin-border capitalize">
          {item.category.replace('_', ' ')}
        </span>
      ),
    },
    {
      header: 'Source',
      cell: (item) => (
        <span className="px-2 py-0.5 rounded bg-admin-surface-raised text-admin-fg-muted font-mono text-[10px] border border-admin-border">
          {item.sourceEvent}
        </span>
      ),
    },
    {
      header: 'Rating',
      cell: (item) =>
        item.rating !== null ? (
          <span className="inline-flex items-center gap-1 text-admin-warning font-bold text-xs">
            <Star className="w-3.5 h-3.5 fill-admin-warning/30" />
            {item.rating}/5
          </span>
        ) : (
          <span className="text-admin-fg-subtle">—</span>
        ),
    },
    {
      header: 'Status',
      cell: (item) => (
        <AdminStatusBadge
          status={item.status === 'new' ? 'pending' : item.status === 'resolved' ? 'published' : item.status === 'dismissed' ? 'archived' : 'info'}
          label={item.status.toUpperCase()}
        />
      ),
    },
    {
      header: 'Submitted',
      cell: (item) => (
        <span className="text-admin-fg-muted font-mono text-[11px]">
          {new Date(item.createdAt).toLocaleDateString()}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <AdminDataTable
        columns={columns}
        data={feedbackList}
        keyExtractor={(item) => item.id}
        onRowClick={setSelected}
        rowAriaLabel={(item) => `Open feedback from ${item.authorName}`}
        emptyTitle="No product feedback found"
        emptyDescription="Feedback submitted by learners will appear here."
      />

      <AdminDrawer
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
        title="Product Feedback"
        description={selected ? `From ${selected.authorName}` : undefined}
        size="md"
      >
        {selected ? (
          <div className="space-y-5">
            {/* Metadata Header */}
            <div className="p-3 rounded-xl bg-admin-surface-raised border border-admin-border space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-admin-accent" />
                  <span className="text-xs font-bold text-admin-fg">{selected.authorName}</span>
                </div>
                <AdminStatusBadge
                  status={selected.status === 'new' ? 'pending' : selected.status === 'resolved' ? 'published' : selected.status === 'dismissed' ? 'archived' : 'info'}
                  label={selected.status.toUpperCase()}
                />
              </div>
              {selected.authorEmail && (
                <div className="flex items-center gap-1.5 text-xs text-admin-fg-muted font-mono">
                  <Mail className="w-3.5 h-3.5" />
                  <a href={`mailto:${selected.authorEmail}`} className="hover:text-admin-accent hover:underline">
                    {selected.authorEmail}
                  </a>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-admin-surface-raised text-admin-accent font-mono text-[10px] border border-admin-border">
                {selected.category}
              </span>
              <span className="px-2 py-0.5 rounded bg-admin-surface-raised text-admin-fg-muted font-mono text-[10px] border border-admin-border">
                {selected.sourceEvent}
              </span>
            </div>

            {selected.rating !== null && (
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={`w-4 h-4 ${n <= (selected.rating || 0) ? 'fill-admin-warning/40 text-admin-warning' : 'text-admin-fg-subtle'}`}
                  />
                ))}
                <span className="text-xs font-bold text-admin-fg ml-1">{selected.rating}/5</span>
              </div>
            )}

            <div className="rounded-xl bg-admin-surface-raised border border-admin-border p-4">
              <p className="text-sm text-admin-fg leading-relaxed whitespace-pre-wrap">{selected.content}</p>
            </div>

            {/* Status Actions */}
            <div className="space-y-2 pt-2 border-t border-admin-border">
              <p className="text-xs font-semibold text-admin-fg-muted uppercase tracking-wider">Set Status</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <button
                  type="button"
                  disabled={isUpdating || selected.status === 'reviewed'}
                  onClick={() => handleStatusChange(selected.id, 'reviewed')}
                  className="px-2.5 py-1.5 rounded-lg border border-admin-border bg-admin-surface hover:bg-admin-surface-raised text-xs font-medium text-admin-fg flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"
                >
                  <Clock className="w-3.5 h-3.5 text-admin-info" /> Reviewed
                </button>
                <button
                  type="button"
                  disabled={isUpdating || selected.status === 'planned'}
                  onClick={() => handleStatusChange(selected.id, 'planned')}
                  className="px-2.5 py-1.5 rounded-lg border border-admin-border bg-admin-surface hover:bg-admin-surface-raised text-xs font-medium text-admin-fg flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"
                >
                  <Lightbulb className="w-3.5 h-3.5 text-admin-warning" /> Planned
                </button>
                <button
                  type="button"
                  disabled={isUpdating || selected.status === 'resolved'}
                  onClick={() => handleStatusChange(selected.id, 'resolved')}
                  className="px-2.5 py-1.5 rounded-lg border border-admin-border bg-admin-surface hover:bg-admin-surface-raised text-xs font-medium text-admin-fg flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-admin-success" /> Resolved
                </button>
                <button
                  type="button"
                  disabled={isUpdating || selected.status === 'dismissed'}
                  onClick={() => handleStatusChange(selected.id, 'dismissed')}
                  className="px-2.5 py-1.5 rounded-lg border border-admin-border bg-admin-surface hover:bg-admin-surface-raised text-xs font-medium text-admin-fg flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"
                >
                  <XCircle className="w-3.5 h-3.5 text-admin-danger" /> Dismiss
                </button>
              </div>
            </div>

            <p className="text-[11px] font-mono text-admin-fg-muted">
              Submitted {new Date(selected.createdAt).toLocaleString()}
            </p>
          </div>
        ) : (
          <AdminEmptyState
            icon={MessageSquare}
            title="No feedback selected"
            description="Select a feedback item to view its details."
          />
        )}
      </AdminDrawer>
    </div>
  )
}