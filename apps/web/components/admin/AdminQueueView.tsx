'use client'

import React, { useCallback, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  RefreshCw,
  RotateCcw,
  Play,
  Loader2,
} from 'lucide-react'
import { AdminSection } from './AdminSection'
import { AdminDataTable, Column } from './AdminDataTable'
import { AdminEmailStatusBadge } from './AdminEmailStatusBadge'
import { AdminSearchInput } from './AdminSearchInput'
import { AdminPagination } from './AdminPagination'
import { AdminDrawer } from './AdminDrawer'
import { useAdminToast } from './admin-toast'
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

export function AdminQueueView({ history }: AdminQueueViewProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { toast } = useAdminToast()

  const status = searchParams.get('status') || 'all'
  const q = searchParams.get('q') || ''

  const [selected, setSelected] = useState<AdminEmailHistoryItem | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const [isRetryingSingle, setIsRetryingSingle] = useState(false)

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
    setSelectedIds([])
    applyFilter({ status: next === 'all' ? null : next, page: null })
  }

  const handleSearch = (next: string) => {
    setSelectedIds([])
    applyFilter({ q: next || null, page: null })
  }

  const handlePageChange = (next: number) => {
    setSelectedIds([])
    applyFilter({ page: next === 1 ? null : String(next) })
  }

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const handleSelectAll = () => {
    if (selectedIds.length === history.items.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(history.items.map((i) => i.id))
    }
  }

  // 1. Process Queue Now
  const handleProcessQueue = async () => {
    setIsProcessing(true)
    try {
      const res = await fetch('/api/admin/emails/queue', { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.success) {
        toast(`Queue processed: ${data.result?.delivered || 0} delivered, ${data.result?.failed || 0} failed.`, 'success')
        router.refresh()
      } else {
        toast(data.error || 'Failed to process queue', 'error')
      }
    } catch {
      toast('Network error processing queue', 'error')
    } finally {
      setIsProcessing(false)
    }
  }

  // 2. Retry Single Item
  const handleRetrySingle = async (id: string) => {
    setIsRetryingSingle(true)
    try {
      const res = await fetch(`/api/admin/emails/queue/${encodeURIComponent(id)}/retry`, {
        method: 'POST',
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast(data.message || 'Item requeued for delivery.', 'success')
        if (selected && selected.id === id) {
          setSelected({ ...selected, status: 'pending', attemptCount: 0, errorMessage: null })
        }
        router.refresh()
      } else {
        toast(data.error || 'Retry failed', 'error')
      }
    } catch {
      toast('Network error retrying email', 'error')
    } finally {
      setIsRetryingSingle(false)
    }
  }

  // 3. Retry Selected
  const handleRetrySelected = async () => {
    if (selectedIds.length === 0) return
    setIsRetrying(true)
    try {
      const res = await fetch('/api/admin/emails/queue/retry-selected', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast(data.message || `Requeued ${data.retried} email(s).`, 'success')
        setSelectedIds([])
        router.refresh()
      } else {
        toast(data.error || 'Batch retry failed', 'error')
      }
    } catch {
      toast('Network error during batch retry', 'error')
    } finally {
      setIsRetrying(false)
    }
  }

  // 4. Retry All Eligible
  const handleRetryAll = async () => {
    setIsRetrying(true)
    try {
      const res = await fetch('/api/admin/emails/queue/retry-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statusFilter: status }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast(data.message || `Requeued ${data.retried} email(s).`, 'success')
        router.refresh()
      } else {
        toast(data.error || 'Retry all failed', 'error')
      }
    } catch {
      toast('Network error retrying all', 'error')
    } finally {
      setIsRetrying(false)
    }
  }

  const columns: Column<AdminEmailHistoryItem>[] = [
    {
      header: (
        <input
          type="checkbox"
          checked={history.items.length > 0 && selectedIds.length === history.items.length}
          onChange={handleSelectAll}
          className="rounded border-admin-border bg-admin-surface text-admin-accent focus:ring-admin-accent cursor-pointer"
          aria-label="Select all"
        />
      ),
      className: 'w-8 text-center',
      headerClassName: 'w-8 text-center',
      cell: (item) => (
        <input
          type="checkbox"
          checked={selectedIds.includes(item.id)}
          onClick={(e) => handleToggleSelect(item.id, e)}
          onChange={() => {}}
          className="rounded border-admin-border bg-admin-surface text-admin-accent focus:ring-admin-accent cursor-pointer"
          aria-label={`Select ${item.toEmail}`}
        />
      ),
    },
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
      header: 'Attempts',
      className: 'text-right',
      headerClassName: 'text-right',
      cell: (item) => (
        <span className="font-mono text-[11px] text-admin-fg-muted">
          {item.attemptCount}/{item.maxAttempts}
        </span>
      ),
    },
    {
      header: 'Action',
      className: 'text-right',
      headerClassName: 'text-right',
      cell: (item) => {
        const canRetry = ['failed', 'dead_letter', 'retrying', 'skipped', 'suppressed'].includes(item.status)
        if (!canRetry) return null
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleRetrySingle(item.id)
            }}
            className="px-2.5 py-1 text-[11px] font-semibold rounded bg-admin-surface-raised border border-admin-border text-admin-fg hover:border-admin-accent hover:text-admin-accent transition-colors inline-flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" /> Retry
          </button>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      {/* Top Operations Action Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-admin-surface border border-admin-border shadow-lg">
        <div className="space-y-0.5">
          <h2 className="text-sm font-bold text-admin-fg flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-admin-accent" /> Outbound Email Queue &amp; Recovery
          </h2>
          <p className="text-xs text-admin-fg-muted">
            Atomic batch processing with automatic retry backoff, suppression filtering, and manual recovery controls.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {selectedIds.length > 0 && (
            <button
              type="button"
              disabled={isRetrying}
              onClick={handleRetrySelected}
              className="px-3 py-1.5 rounded-lg bg-admin-accent hover:bg-admin-accent/90 text-admin-accent-fg text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
            >
              {isRetrying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
              <span>Retry Selected ({selectedIds.length})</span>
            </button>
          )}

          {['failed', 'dead_letter'].includes(status) && (
            <button
              type="button"
              disabled={isRetrying}
              onClick={handleRetryAll}
              className="px-3 py-1.5 rounded-lg border border-admin-danger/30 bg-admin-danger-soft text-admin-danger text-xs font-bold hover:bg-admin-danger/20 transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isRetrying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
              <span>Retry All {status === 'dead_letter' ? 'Dead Letter' : 'Failed'}</span>
            </button>
          )}

          <button
            type="button"
            disabled={isProcessing}
            onClick={handleProcessQueue}
            className="px-3.5 py-1.5 rounded-lg bg-admin-surface-raised border border-admin-border text-admin-fg hover:border-admin-border-strong text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
          >
            {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 text-admin-accent" />}
            <span>Process Queue Now</span>
          </button>
        </div>
      </div>

      <AdminSection
        title="Email Queue Ledger"
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
        title="Email Queue Details"
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
              <div className="p-3.5 rounded-xl bg-admin-danger-soft border border-admin-danger/25 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold text-admin-danger uppercase tracking-wider">Failure Diagnostic</p>
                  <span className="text-[10px] font-mono text-admin-danger/80">Attempts exhausted</span>
                </div>
                <p className="text-xs text-admin-fg font-mono break-all leading-relaxed bg-admin-bg/60 p-2.5 rounded-lg border border-admin-danger/20">
                  {selected.errorMessage}
                </p>
              </div>
            )}

            {!selected.errorMessage && selected.status === 'delivered' && (
              <div className="p-3 rounded-xl bg-admin-success-soft border border-admin-success/25">
                <p className="text-xs text-admin-success font-semibold">
                  Delivered successfully. No delivery error recorded.
                </p>
              </div>
            )}

            {/* Drawer Recovery Action */}
            {['failed', 'dead_letter', 'retrying', 'skipped', 'suppressed'].includes(selected.status) && (
              <div className="pt-3 border-t border-admin-border flex justify-end">
                <button
                  type="button"
                  disabled={isRetryingSingle}
                  onClick={() => handleRetrySingle(selected.id)}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-admin-accent text-admin-accent-fg hover:bg-admin-accent/90 transition-all inline-flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isRetryingSingle ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                  <span>Retry Delivery Now</span>
                </button>
              </div>
            )}
          </div>
        )}
      </AdminDrawer>
    </div>
  )
}