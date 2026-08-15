'use client'

import React, { useState } from 'react'
import { Star, MessageSquare } from 'lucide-react'
import { AdminDataTable, Column } from './AdminDataTable'
import { AdminDrawer } from './AdminDrawer'
import { AdminEmptyState } from './AdminEmptyState'
import { AdminStatusBadge } from './AdminStatusBadge'

export interface AdminFeedbackItem {
  id: string
  userId: string | null
  authorName: string
  category: string
  sourceEvent: string
  content: string
  rating: number | null
  status: string
  createdAt: string
}

export function FeedbackListView({ initialFeedback }: { initialFeedback: AdminFeedbackItem[] }) {
  const [selected, setSelected] = useState<AdminFeedbackItem | null>(null)

  const columns: Column<AdminFeedbackItem>[] = [
    {
      header: 'Author',
      cell: (item) => (
        <div>
          <p className="font-bold text-admin-fg text-xs">{item.authorName}</p>
          <p className="text-[11px] text-admin-fg-muted font-mono">{item.category}</p>
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
          status={item.status === 'new' ? 'pending' : item.status === 'read' ? 'info' : 'archived'}
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
        data={initialFeedback}
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
            <div className="flex flex-wrap items-center gap-2">
              <AdminStatusBadge
                status={selected.status === 'new' ? 'pending' : 'archived'}
                label={selected.status.toUpperCase()}
              />
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
              <p className="text-sm text-admin-fg leading-relaxed">{selected.content}</p>
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