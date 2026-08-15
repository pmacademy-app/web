'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Filter, RefreshCw } from 'lucide-react'
import { AdminDataTable, type Column } from './AdminDataTable'
import { AdminPagination } from './AdminPagination'
import { AdminErrorState } from './AdminErrorState'
import { AdminErrorSeverityBadge, AdminErrorStatusBadge } from './AdminErrorBadges'
import { AdminErrorDetailDrawer } from './AdminErrorDetailDrawer'
import type { AdminErrorGroup, AdminErrorGroupResult } from '@/lib/admin/types'
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
 * detail drawer. Initial data is server-rendered; filters refetch client-side.
 */
export function AdminSystemErrorsView({ initial }: AdminSystemErrorsViewProps) {
  const [severity, setSeverity] = useState('all')
  const [category, setCategory] = useState('all')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [requestId, setRequestId] = useState(0)
  const [data, setData] = useState<AdminErrorGroupResult>(initial)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<AdminErrorGroup | null>(null)
  const isFirstRender = useRef(true)

  const refresh = useCallback(() => setRequestId((n) => n + 1), [])

  useEffect(() => {
    // Skip the initial fetch on mount since we have server-rendered initial data.
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    let isMounted = true
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const query = new URLSearchParams({
          severity,
          category,
          status,
          page: String(page),
          pageSize: '25',
        })
        const res = await fetch(`/api/admin/system/errors?${query.toString()}`)
        const json = await res.json()
        if (!isMounted) return
        if (json.success) {
          setData(json)
        } else {
          setError(json.error || 'Failed to load system errors.')
        }
      } catch {
        if (isMounted) setError('Network error while loading system errors.')
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    void run()
    return () => {
      isMounted = false
    }
  }, [severity, category, status, page, requestId])

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
        <span className="font-mono text-[11px] text-admin-fg-muted">{new Date(g.firstSeen).toLocaleString()}</span>
      ),
    },
    {
      header: 'Last Seen',
      cell: (g) => (
        <span className="font-mono text-[11px] text-admin-fg-muted">{new Date(g.lastSeen).toLocaleString()}</span>
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
        group={selected}
      />
    </div>
  )
}