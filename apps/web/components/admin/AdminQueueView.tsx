'use client'

import React, { useCallback, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { AdminSection } from './AdminSection'
import { AdminDataTable, Column } from './AdminDataTable'
import { AdminEmailStatusBadge } from './AdminEmailStatusBadge'
import { AdminSearchInput } from './AdminSearchInput'
import { AdminPagination } from './AdminPagination'
import { AdminDrawer } from './AdminDrawer'
import { cn } from '@/lib/utils'
import type { AdminEmailHistoryItem, AdminEmailHistoryResult } from '@/lib/admin/communications-service'

interface AdminQueueViewProps {
  history: AdminEmailHistoryResult
}

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'processing', label: 'Processing' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'failed', label: 'Failed' },
  { key: 'dead_letter', label: 'Dead Letter' },
]

/**
 * Operational email queue view (spec §38). Status tabs, search and pagination
 * are server-driven through the same `getEmailHistory` service used by the
 * Email dashboard, so the queue stays a real operational screen rather than a
 * static snapshot.
 */
export function AdminQueueView({ history }: AdminQueueViewProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const status = searchParams.get('status') || 'all'
  const q = searchParams.get('q') || ''

  const [selected, setSelected] = useState<AdminEmailHistoryItem | null>(null)

  const createQueryString = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) params.delete(key)
        else params.set(key, value)
      }
      return params.toString()
    },
    [searchParams]
  )

  const applyFilter = useCallback(
    (updates: Record<string, string | null>) => {
      router.push(`${pathname}?${createQueryString(updates)}`)
    },
    [router, pathname, createQueryString]
  )

  const handleStatusChange = (next: string) => {
    applyFilter({ status: next === 'all' ? null : next, page: null })
  }

  const handleSearch = (next: string) => {
    applyFilter({ q: next || null, page: null })
  }

  const handlePageChange = (next: number) => {
    applyFilter({ page: next === 1 ? null : String(next) })
  }

  const columns: Column<AdminEmailHistoryItem>[] = [
    {
      header: 'Recipient',
      cell: (item) => (
        <div className="min-w-0">
          {item.toName && <p className="text-xs font-bold text-admin-fg truncate">{item.toName}</p>}
          <p className="font-mono text-[11px] text-admin-fg-muted truncate">{item.toEmail}</p>
        </div>
      ),
    },
    {
      header: 'Template',
      cell: (item) => (
        <span className="font-mono text-[11px] text-admin-accent font-semibold">{item.templateKey}</span>
      ),
    },
    {
      header: 'Status',
      cell: (item) => <AdminEmailStatusBadge status={item.status} />,
    },
    {
      header: 'Created',
      cell: (item) => (
        <span className="font-mono text-[11px] text-admin-fg-muted">
          {new Date(item.createdAt).toLocaleString()}
        </span>
      ),
    },
    {
      header: 'Retry',
      className: 'text-right',
      headerClassName: 'text-right',
      cell: (item) => (
        <span className="font-mono text-[11px] text-admin-fg-muted">
          {item.attemptCount}/{item.maxAttempts}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <AdminSection
        title="Email Queue"
        icon={RefreshCw}
        meta={`${history.total.toLocaleString()} records`}
        bodyClassName="space-y-4"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-admin-bg/60 border border-admin-border overflow-x-auto">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleStatusChange(tab.key)}
                aria-pressed={status === tab.key}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer',
                  status === tab.key
                    ? 'bg-admin-accent text-admin-accent-contrast'
                    : 'text-admin-fg-muted hover:text-admin-fg hover:bg-admin-surface-raised'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <AdminSearchInput
            value={q}
            onValueChange={handleSearch}
            placeholder="Search recipient or template…"
            aria-label="Search email queue"
            className="w-full sm:w-64"
          />
        </div>

        <AdminDataTable
          columns={columns}
          data={history.items}
          keyExtractor={(item) => item.id}
          onRowClick={setSelected}
          rowAriaLabel={(item) => `Open email to ${item.toEmail} (${item.templateKey})`}
          emptyTitle={q || status !== 'all' ? 'No emails match your filters' : 'The email queue is empty'}
          emptyDescription={
            q || status !== 'all'
              ? 'Try adjusting the search or status filter.'
              : 'Dispatches from the email queue will appear here.'
          }
        />

        {history.totalPages > 1 && (
          <AdminPagination
            currentPage={history.page}
            totalPages={history.totalPages}
            onPageChange={handlePageChange}
            pageSize={history.pageSize}
            totalItems={history.total}
          />
        )}
      </AdminSection>

      {/* Email detail drawer */}
      <AdminDrawer
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
        title="Email Details"
        description={selected ? `${selected.templateKey} → ${selected.toEmail}` : undefined}
        size="md"
      >
        {selected && (
          <div className="space-y-5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-admin-fg-muted">Status:</span>
                <AdminEmailStatusBadge status={selected.status} />
              </div>
              <span className="font-mono text-[10px] text-admin-fg-subtle">{selected.id}</span>
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-admin-bg p-3 rounded-xl border border-admin-border">
              <div>
                <dt className="text-admin-fg-muted">Recipient</dt>
                <dd className="font-mono text-admin-fg font-semibold break-all">{selected.toEmail}</dd>
              </div>
              <div>
                <dt className="text-admin-fg-muted">Template</dt>
                <dd className="font-mono text-admin-accent font-semibold">{selected.templateKey}</dd>
              </div>
              <div>
                <dt className="text-admin-fg-muted">Created</dt>
                <dd className="text-admin-fg">{new Date(selected.createdAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-admin-fg-muted">Last updated</dt>
                <dd className="text-admin-fg">{new Date(selected.updatedAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-admin-fg-muted">Retry attempts</dt>
                <dd className="font-mono text-admin-fg">
                  {selected.attemptCount} / {selected.maxAttempts}
                </dd>
              </div>
            </dl>

            {selected.errorMessage && (
              <div className="p-3 rounded-xl bg-admin-danger-soft border border-admin-danger/25">
                <p className="text-[11px] font-bold text-admin-danger uppercase tracking-wider mb-1">Error</p>
                <p className="text-xs text-admin-fg font-mono break-all">{selected.errorMessage}</p>
              </div>
            )}

            {!selected.errorMessage && selected.status === 'delivered' && (
              <div className="p-3 rounded-xl bg-admin-success-soft border border-admin-success/25">
                <p className="text-xs text-admin-success font-semibold">
                  Delivered successfully. No delivery error recorded.
                </p>
              </div>
            )}
          </div>
        )}
      </AdminDrawer>
    </div>
  )
}