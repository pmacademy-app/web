'use client'

import React, { useState } from 'react'
import { MessageSquare, CheckCircle, XCircle, Eye, EyeOff, Edit3, Check, X } from 'lucide-react'
import { AdminPageHeader } from './AdminPageHeader'
import { AdminDataTable, Column } from './AdminDataTable'
import { AdminStatusBadge } from './AdminStatusBadge'
import type { TestimonialItem } from '@/lib/admin/feedback-service'

interface FeedbackModerationViewProps {
  initialQueue: TestimonialItem[]
  /** When embedded in a parent workspace (e.g. Moderation tabs), hide the page header. */
  embedded?: boolean
}

export function FeedbackModerationView({ initialQueue, embedded = false }: FeedbackModerationViewProps) {
  // Schema note (spec §5.8 "Featured" display/action): testimonials have no
  // `featured` column — the schema only supports `is_published`. The spec's
  // "Featured" concept is mapped to the published state: the "Published on
  // Site" chip + Publish/Unpublish actions below are the accurate equivalent.
  // No "Feature" action is offered because the data model cannot represent it.
  const [queue, setQueue] = useState<TestimonialItem[]>(initialQueue)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editedText, setEditedText] = useState<string>('')

  const handleAction = async (id: string, action: 'approve' | 'publish' | 'unpublish' | 'reject' | 'edit', newContent?: string) => {
    setLoadingId(id)
    try {
      const res = await fetch(`/api/admin/feedback/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, updatedContent: newContent }),
      })
      const data = await res.json()

      if (data.success) {
        setQueue((prev) =>
          prev.map((item) => {
            if (item.id !== id) return item
            let updatedStatus = item.status
            let updatedPublished = item.isPublished
            let updatedText = item.content

            if (action === 'approve') updatedStatus = 'approved'
            if (action === 'publish') {
              updatedStatus = 'approved'
              updatedPublished = true
            }
            if (action === 'unpublish') updatedPublished = false
            if (action === 'reject') {
              updatedStatus = 'rejected'
              updatedPublished = false
            }
            if (newContent) updatedText = newContent

            return {
              ...item,
              status: updatedStatus,
              isPublished: updatedPublished,
              content: updatedText,
            }
          })
        )
      }
    } catch (err) {
      console.error('Moderation action failed:', err)
    } finally {
      setLoadingId(null)
      setEditingId(null)
    }
  }

  const filteredQueue = queue.filter((item) => {
    if (statusFilter === 'all') return true
    return item.status === statusFilter
  })

  const columns: Column<TestimonialItem>[] = [
    {
      header: 'Author / Student',
      cell: (item) => (
        <div>
          <p className="font-bold text-admin-fg text-xs">{item.authorName}</p>
          <p className="text-[11px] text-admin-fg-muted font-mono">{item.authorRole}</p>
        </div>
      ),
    },
    {
      header: 'Source Trigger',
      cell: (item) => (
        <span className="px-2 py-0.5 rounded bg-admin-surface-raised text-admin-accent font-mono text-[10px] border border-admin-border">
          {item.sourceEvent}
        </span>
      ),
    },
    {
      header: 'Testimonial Content',
      cell: (item) => (
        <div className="max-w-md">
          {editingId === item.id ? (
            <div className="space-y-2">
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                className="w-full text-xs p-2 rounded bg-admin-bg border border-admin-border text-admin-fg focus:outline-none focus:border-admin-accent"
                rows={3}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => handleAction(item.id, 'edit', editedText)}
                  className="px-2 py-1 bg-admin-success hover:bg-admin-success/90 text-admin-fg text-[10px] font-bold rounded flex items-center gap-1"
                >
                  <Check className="w-3 h-3" /> Save Content
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="px-2 py-1 bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-fg-muted text-[10px] font-bold rounded flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-admin-fg leading-relaxed italic">
              &ldquo;{item.content}&rdquo;
            </p>
          )}
        </div>
      ),
    },
    {
      header: 'Status',
      cell: (item) => (
        <div className="space-y-1">
          <AdminStatusBadge
            status={
              item.status === 'approved'
                ? 'healthy'
                : item.status === 'rejected'
                ? 'archived'
                : 'pending'
            }
            label={item.status.toUpperCase()}
          />
          {item.isPublished && (
            <span className="block px-1.5 py-0.5 rounded bg-admin-success-soft text-admin-success text-[9px] font-bold border border-admin-success/25 text-center">
              Published on Site
            </span>
          )}
        </div>
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
    {
      header: 'Actions',
      headerClassName: 'text-right',
      className: 'text-right',
      cell: (item) => {
        const isLoading = loadingId === item.id
        return (
          <div className="flex items-center justify-end gap-1.5">
            {/* Edit Content Button */}
            {editingId !== item.id && (
              <button
                onClick={() => {
                  setEditingId(item.id)
                  setEditedText(item.content)
                }}
                disabled={isLoading}
                title="Edit Testimonial Content"
                className="p-1.5 rounded bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-fg-muted hover:text-admin-fg border border-admin-border transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Approve / Reject Actions */}
            {item.status !== 'approved' && (
              <button
                onClick={() => handleAction(item.id, 'approve')}
                disabled={isLoading}
                title="Approve Testimonial"
                className="px-2 py-1 rounded bg-admin-success-soft hover:bg-admin-success/20 text-admin-success text-[10px] font-bold border border-admin-success/25 flex items-center gap-1 transition-colors"
              >
                <CheckCircle className="w-3 h-3" /> Approve
              </button>
            )}

            {/* Publish / Unpublish Actions */}
            {item.status === 'approved' && !item.isPublished && (
              <button
                onClick={() => handleAction(item.id, 'publish')}
                disabled={isLoading}
                title="Publish to Marketing Site"
                className="px-2 py-1 rounded bg-admin-info-soft hover:bg-admin-info/20 text-admin-info text-[10px] font-bold border border-admin-info/25 flex items-center gap-1 transition-colors"
              >
                <Eye className="w-3 h-3" /> Publish
              </button>
            )}

            {item.isPublished && (
              <button
                onClick={() => handleAction(item.id, 'unpublish')}
                disabled={isLoading}
                title="Unpublish from Marketing Site"
                className="px-2 py-1 rounded bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-fg-muted hover:text-admin-fg text-[10px] font-bold border border-admin-border flex items-center gap-1 transition-colors"
              >
                <EyeOff className="w-3 h-3" /> Unpublish
              </button>
            )}

            {item.status !== 'rejected' && (
              <button
                onClick={() => handleAction(item.id, 'reject')}
                disabled={isLoading}
                title="Reject Testimonial"
                className="px-2 py-1 rounded bg-admin-danger-soft hover:bg-admin-danger/20 text-admin-danger text-[10px] font-bold border border-admin-danger/25 flex items-center gap-1 transition-colors"
              >
                <XCircle className="w-3 h-3" /> Reject
              </button>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-8">
      {!embedded && (
        <AdminPageHeader
          title="Feedback & Testimonial Moderation"
          description="Review student testimonials, approve submissions, edit text, and publish to the public marketing site."
          icon={MessageSquare}
        />
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-2">
        {['all', 'pending', 'approved', 'rejected'].map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors ${
              statusFilter === f
                ? 'bg-admin-accent-soft text-admin-accent border border-admin-accent/25'
                : 'bg-admin-surface text-admin-fg-muted hover:text-admin-fg border border-admin-border'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <AdminDataTable
        columns={columns}
        data={filteredQueue}
        keyExtractor={(item) => item.id}
        emptyTitle="No feedback submissions found"
        emptyDescription="Feedback submitted by learners will appear here for moderation."
      />
    </div>
  )
}
