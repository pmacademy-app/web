'use client'

import React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { AdminDataTable, Column } from './AdminDataTable'
import { AdminStatusBadge } from './AdminStatusBadge'
import { AdminEmptyState } from './AdminEmptyState'
import { CapstoneReviewDrawer } from './CapstoneReviewDrawer'
import type { AdminCapstoneRow } from '@/lib/admin/achievements-aggregation'

interface CapstonesViewProps {
  initialCapstones: AdminCapstoneRow[]
  initialStatusFilter: string
  selectedCapstoneId: string | null
  selectedCapstoneDetail: AdminCapstoneRow | null
}

const STATUS_FILTERS = ['all', 'submitted', 'reviewed', 'draft']

/**
 * Maps a capstone row onto the badge variant: pending while awaiting review,
 * published when reviewed + public, neutral when reviewed + kept private.
 *
 * Schema notes (spec §5.7 moderation statuses):
 * - "In Review" (G1): the schema has no in-review state — a submission is
 *   either `submitted` (awaiting review) or `reviewed`. No "In Review" filter
 *   or badge is offered because the data model cannot represent it.
 * - "Rejected" (G3): the schema has no `rejected` status. A rejected capstone
 *   is stored as `reviewed` + `is_public: false`, which renders as the neutral
 *   "archived" badge with "Private" visibility — the accurate representation.
 */
function capstoneStatusVariant(c: AdminCapstoneRow): string {
  if (c.status === 'submitted') return 'pending'
  if (c.status === 'reviewed') return c.isPublic ? 'published' : 'archived'
  return 'draft'
}

export function CapstonesView({
  initialCapstones,
  initialStatusFilter,
  selectedCapstoneId,
  selectedCapstoneDetail,
}: CapstonesViewProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const statusFilter = STATUS_FILTERS.includes(initialStatusFilter) ? initialStatusFilter : 'all'

  const pushParams = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === '') next.delete(key)
      else next.set(key, value)
    }
    router.push(`/admin/moderation?${next.toString()}`, { scroll: false })
  }

  const filtered = initialCapstones.filter((c) => {
    if (statusFilter === 'all') return true
    return c.status === statusFilter
  })

  const handleSelect = (id: string) => pushParams({ capstone: id })

  const handleClose = () => pushParams({ capstone: undefined })

  const columns: Column<AdminCapstoneRow>[] = [
    {
      header: 'Learner',
      cell: (c) => (
        <div>
          <p className="font-bold text-admin-fg text-xs">{c.learnerName}</p>
          <p className="text-[11px] text-admin-fg-muted font-mono">{c.moduleSlug}</p>
        </div>
      ),
    },
    {
      header: 'Capstone',
      cell: (c) => (
        <div className="max-w-xs">
          <p className="text-xs font-semibold text-admin-fg truncate">{c.capstoneTitle}</p>
          <p className="text-[11px] text-admin-fg-muted truncate">{c.moduleTitle}</p>
        </div>
      ),
    },
    {
      header: 'Status',
      cell: (c) => (
        <AdminStatusBadge status={capstoneStatusVariant(c)} label={c.status.toUpperCase()} />
      ),
    },
    {
      header: 'Visibility',
      cell: (c) => (
        <AdminStatusBadge
          status={c.isPublic ? 'published' : 'archived'}
          label={c.isPublic ? 'Public' : 'Private'}
        />
      ),
    },
    {
      header: 'Words',
      cell: (c) => <span className="text-admin-fg-muted font-mono text-[11px]">{c.wordCount.toLocaleString()}</span>,
    },
    {
      header: 'Submitted',
      cell: (c) => (
        <span className="text-admin-fg-muted font-mono text-[11px]">
          {new Date(c.submittedAt).toLocaleDateString()}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      {/* Status filter */}
      <div className="flex flex-wrap items-center gap-1.5">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => pushParams({ status: f === 'all' ? undefined : f })}
            aria-pressed={statusFilter === f}
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

      {filtered.length === 0 ? (
        <AdminEmptyState
          icon={AlertTriangle}
          title="No capstone submissions found"
          description="Capstone projects submitted by learners will appear here for review."
        />
      ) : (
        <AdminDataTable
          columns={columns}
          data={filtered}
          keyExtractor={(c) => c.id}
          onRowClick={(c) => handleSelect(c.id)}
          rowAriaLabel={(c) => `Open review for ${c.learnerName}'s capstone`}
          emptyTitle="No capstone submissions found"
          emptyDescription="Capstone projects submitted by learners will appear here for review."
        />
      )}

      <CapstoneReviewDrawer
        capstoneId={selectedCapstoneId}
        capstone={selectedCapstoneDetail}
        isOpen={Boolean(selectedCapstoneId)}
        onClose={handleClose}
      />
    </div>
  )
}