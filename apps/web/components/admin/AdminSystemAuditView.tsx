'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Info, RefreshCw } from 'lucide-react'
import { AdminDataTable, type Column } from './AdminDataTable'
import { AdminStatusBadge } from './AdminStatusBadge'
import { AdminPagination } from './AdminPagination'
import { AdminErrorState } from './AdminErrorState'
import { AdminSearchInput } from './AdminSearchInput'
import { AdminDatePicker } from './AdminDatePicker'
import { AdminAuditEntryDrawer } from './AdminAuditEntryDrawer'
import { useIsMounted } from '@/lib/admin/use-is-mounted'
import type { AdminAuditEntry, AdminAuditLogResult } from '@/lib/admin/types'

interface AdminSystemAuditViewProps {
  initial: AdminAuditLogResult
}

/**
 * Audit Log tab (spec §7.6): read-only view of `admin_audit_logs`. The table
 * exists but writes are not yet wired to administrative actions, so this view
 * surfaces the empty state until persistence is enabled. Filters refetch
 * client-side; initial data is server-rendered.
 */
export function AdminSystemAuditView({ initial }: AdminSystemAuditViewProps) {
  const [admin, setAdmin] = useState('')
  const [action, setAction] = useState('')
  const [target, setTarget] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [requestId, setRequestId] = useState(0)
  const [data, setData] = useState<AdminAuditLogResult>(initial)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<AdminAuditEntry | null>(null)
  const mounted = useIsMounted()

  const refresh = useCallback(() => setRequestId((n) => n + 1), [])

  const formatDateTime = (iso: string) => {
    if (!mounted || !iso) return ''
    try {
      return new Date(iso).toLocaleString()
    } catch {
      return iso
    }
  }

  // Convert local date string (YYYY-MM-DD) to UTC ISO range for API.
  // The AdminDatePicker returns local dates; we convert to UTC midnight boundaries.
  const toUtcRange = (dateStr: string, endOfDay = false) => {
    if (!dateStr) return ''
    const [year, month, day] = dateStr.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0))
    return date.toISOString()
  }

  useEffect(() => {
    let isMounted = true
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const query = new URLSearchParams({
          admin,
          action,
          target,
          from: toUtcRange(from, false),
          to: toUtcRange(to, true),
          page: String(page),
          pageSize: '25',
        })
        const res = await fetch(`/api/admin/system/audit?${query.toString()}`)
        const json = await res.json()
        if (!isMounted) return
        if (json.success) {
          setData(json)
        } else {
          setError(json.error || 'Failed to load the audit log.')
        }
      } catch {
        if (isMounted) setError('Network error while loading the audit log.')
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    void run()
    return () => {
      isMounted = false
    }
  }, [admin, action, target, from, to, page, requestId])

  const columns: Column<AdminAuditEntry>[] = [
    {
      header: 'Time',
      cell: (e) => <span className="font-mono text-[11px] text-admin-fg-muted">{formatDateTime(e.createdAt)}</span>,
    },
    {
      header: 'Admin',
      cell: (e) => <span className="text-xs text-admin-fg">{e.adminEmail}</span>,
    },
    {
      header: 'Action',
      cell: (e) => <span className="font-mono text-[11px] text-admin-accent font-semibold">{e.action}</span>,
    },
    {
      header: 'Target',
      cell: (e) => (
        <div className="min-w-0">
          <p className="text-xs text-admin-fg">{e.targetResource}</p>
          {e.targetId && <p className="text-[10px] font-mono text-admin-fg-subtle truncate max-w-[200px]">{e.targetId}</p>}
        </div>
      ),
    },
    {
      header: 'Status',
      cell: (e) =>
        e.details ? (
          <AdminStatusBadge status="info" label="With context" />
        ) : (
          <AdminStatusBadge status="archived" label="Recorded" />
        ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Filter toolbar */}
      <div className="p-4 bg-admin-surface/50 border border-admin-border rounded-xl space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <AdminSearchInput
            value={admin}
            onValueChange={(v) => {
              setAdmin(v)
              setPage(1)
            }}
            placeholder="Admin email…"
            aria-label="Filter by admin email"
          />
          <AdminSearchInput
            value={action}
            onValueChange={(v) => {
              setAction(v)
              setPage(1)
            }}
            placeholder="Action…"
            aria-label="Filter by action"
          />
          <AdminSearchInput
            value={target}
            onValueChange={(v) => {
              setTarget(v)
              setPage(1)
            }}
            placeholder="Target…"
            aria-label="Filter by target"
          />
          <AdminDatePicker
            value={from}
            onValueChange={(v) => {
              setFrom(v)
              setPage(1)
            }}
            placeholder="From date"
            aria-label="Filter from date"
          />
          <AdminDatePicker
            value={to}
            onValueChange={(v) => {
              setTo(v)
              setPage(1)
            }}
            placeholder="To date"
            aria-label="Filter to date"
          />
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-admin-fg-muted">{data.total} entries</p>
          <button
            type="button"
            onClick={refresh}
            className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-admin-border bg-admin-surface hover:bg-admin-surface-raised text-admin-fg transition-colors flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error ? (
        <AdminErrorState
          title="Unable to load the audit log"
          description="Something went wrong while loading audit history."
          error={error}
          onRetry={refresh}
        />
      ) : loading && data.entries.length === 0 ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading audit log">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-admin-surface border border-admin-border animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <AdminDataTable
            columns={columns}
            data={data.entries}
            keyExtractor={(e) => e.id}
            onRowClick={(e) => setSelected(e)}
            rowAriaLabel={(e) => `Open details for ${e.action} on ${e.targetResource}`}
            emptyTitle="No audit entries yet"
            emptyDescription="Administrative actions will appear here once audit logging is enabled."
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

      {/* Show info banner only when audit logging is not yet populated and not in error state */}
      {data.entries.length === 0 && !data.failed && !error && !loading && (
        <div className="p-4 rounded-xl bg-admin-info-soft border border-admin-info/25 flex items-start gap-3">
          <Info className="w-4 h-4 text-admin-info shrink-0 mt-0.5" />
          <div className="text-[11px] text-admin-fg leading-relaxed space-y-1">
            <p className="font-bold text-admin-info uppercase tracking-wider">Audit Logging</p>
            <p>
              The <span className="font-mono">admin_audit_logs</span> table exists but writes are not yet wired to
              administrative actions. This view is read-only and will populate once persistence is enabled.
            </p>
          </div>
        </div>
      )}

      <AdminAuditEntryDrawer
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
        entry={selected}
      />
    </div>
  )
}