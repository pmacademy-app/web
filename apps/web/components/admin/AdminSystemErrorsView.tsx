'use client'

import React, { useCallback, useState } from 'react'
import { Filter, RefreshCw } from 'lucide-react'
import { AdminDataTable, type Column } from './AdminDataTable'
import { AdminPagination } from './AdminPagination'
import { AdminErrorState } from './AdminErrorState'
import { AdminErrorSeverityBadge, AdminErrorStatusBadge } from './AdminErrorBadges'
import { AdminErrorDetailDrawer } from './AdminErrorDetailDrawer'
import { useIsMounted } from '@/lib/admin/use-is-mounted'
import { useApiQuery } from '@/lib/api/hooks'
import type { AdminErrorGroup, AdminErrorGroupResult } from '@/lib/admin/types'
import type { AdminSystemErrorsResponse } from '@/lib/api/contracts/admin'
import type { ErrorCategory } from '@/lib/monitoring/logger'

interface AdminSystemErrorsViewProps {
  initial: AdminErrorGroupResult
}

const SEVERITIES = ['all', 'critical', 'error', 'warning'] as const
const CATEGORIES: readonly ('all' | ErrorCategory)[] = ['all', 'auth', 'verification', 'queue', 'resend', 'webhook', 'cron', 'system']
const STATUSES = ['all', 'new', 'acknowledged', 'resolved'] as const

/**
 * Errors tab (spec §7.5): grouped operational failures from `system_errors`,
 * filterable by severity, category and status, with pagination. Rows open a
 * detail drawer; lifecycle status can be updated from there.
 */
export function AdminSystemErrorsView({ initial }: AdminSystemErrorsViewProps) {
  const [severity, setSeverity] = useState('all')
  const [category, setCategory] = useState('all')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<AdminErrorGroup | null>(null)
  const mounted = useIsMounted()

  const query = new URLSearchParams({
    severity,
    category,
    status,
    page: String(page),
    pageSize: '25',
  })
  const swrKey = `/api/admin/system/errors?${query.toString()}`
  const {
    data: queryData,
    error: apiError,
    isLoading,
    mutate: revalidateErrors,
  } = useApiQuery<AdminSystemErrorsResponse>(swrKey, {
    fallbackData: initial,
    revalidateOnMount: false,
    dedupingInterval: 5_000,
  })

  const data = queryData || initial
  const loading = isLoading
  const error =
    apiError?.message ||
    (data && 'success' in data && !data.success ? (data as AdminSystemErrorsResponse).error || 'Failed to load system errors.' : null)

  const refresh = useCallback(() => {
    void revalidateErrors()
  }, [revalidateErrors])

  const formatDateTime = (iso: string) => {
    if (!mounted || !iso) return ''
    try {
      return new Date(iso).toLocaleString()
    } catch {
      return iso
    }
  }

  const columns: Column<AdminErrorGroup>[] = [
    {
      header: 'Severity',
      cell: (g) => <AdminErrorSeverityBadge severity={g.severity} />,
    },
    {
      header: 'Error',
      cell: (g) => (
        <div className="min-w-0">
          <p className="text-xs font-semibold text-admin-fg font-mono">{g.operation}</p>
          <p className="text-[11px] text-admin-fg-muted truncate max-w-[320px]">{g.message}</p>
        </div>
      ),
    },
    {
      header: 'Area',
      cell: (g) => (
        <span className="px-2 py-0.5 rounded bg-admin-surface-raised text-admin-fg-muted text-[10px] font-mono uppercase">
          {g.category}
        </span>
      ),
    },
    {
      header: 'Occurrences',
      cell: (g) => <span className="font-mono text-xs text-admin-fg">{g.occurrences}</span>,
    },
    {
      header: 'First Seen',
      cell: (g) => (
        <span className="font-mono text-[11px] text-admin-fg-muted">{formatDateTime(g.firstSeen)}</span>
      ),
    },
    {
      header: 'Last Seen',
      cell: (g) => (
        <span className="font-mono text-[11px] text-admin-fg-muted">{formatDateTime(g.lastSeen)}</span>
      ),
    },
    {
      header: 'Status',
      cell: (g) => <AdminErrorStatusBadge status={g.status} />,
    },
  ]

  return (
    <div className="space-y-6">
      {/* Filter toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-admin-surface/50 border border-admin-border rounded-xl">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex items-center gap-1.5 text-xs">
            <Filter className="w-3.5 h-3.5 text-admin-fg-muted" />
            <span className="text-admin-fg-muted font-medium">Severity:</span>
            <select
              value={severity}
              onChange={(e) => {
                setSeverity(e.target.value)
                setPage(1)
              }}
              aria-label="Filter by severity"
              className="px-2.5 py-1 text-xs rounded-lg border border-admin-border bg-admin-surface text-admin-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-admin-accent/30"
            >
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s === 'all' ? 'All Severities' : s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-admin-fg-muted font-medium">Category:</span>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value)
                setPage(1)
              }}
              aria-label="Filter by category"
              className="px-2.5 py-1 text-xs rounded-lg border border-admin-border bg-admin-surface text-admin-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-admin-accent/30"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c === 'all' ? 'All Categories' : c}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-admin-fg-muted font-medium">Status:</span>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value)
                setPage(1)
              }}
              aria-label="Filter by status"
              className="px-2.5 py-1 text-xs rounded-lg border border-admin-border bg-admin-surface text-admin-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-admin-accent/30"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === 'all' ? 'All Statuses' : s}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-admin-border bg-admin-surface hover:bg-admin-surface-raised text-admin-fg transition-colors flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {error ? (
        <AdminErrorState
          title="Unable to load system errors"
          description="Something went wrong while loading the error log."
          error={error}
          onRetry={refresh}
        />
      ) : loading && data.groups.length === 0 ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading system errors">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-admin-surface border border-admin-border animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <AdminDataTable
            columns={columns}
            data={data.groups}
            keyExtractor={(g) => g.fingerprint}
            onRowClick={(g) => setSelected(g)}
            rowAriaLabel={(g) => `Open details for ${g.operation}`}
            emptyTitle="No system errors found"
            emptyDescription="No operational failure records match the current filters."
          />
          <AdminPagination
            currentPage={data.page}
            totalPages={data.totalPages}
            onPageChange={setPage}
            pageSize={data.pageSize}
            totalItems={data.total}
          />
        </>
      )}

      <AdminErrorDetailDrawer
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
        onStatusChange={() => {
          refresh()
        }}
        group={selected}
      />
    </div>
  )
}