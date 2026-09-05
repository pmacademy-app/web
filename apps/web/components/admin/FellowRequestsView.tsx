'use client'

import React, { useState } from 'react'
import { CheckCircle, XCircle, ExternalLink, AlertTriangle, X, Check } from 'lucide-react'
import Link from 'next/link'
import { AdminDataTable, Column } from './AdminDataTable'
import { AdminStatusBadge } from './AdminStatusBadge'
import type { AdminFellowRequestItem } from '@/lib/admin/fellow-request-service'

interface FellowRequestsViewProps {
  initialQueue: AdminFellowRequestItem[]
}

export function FellowRequestsView({ initialQueue }: FellowRequestsViewProps) {
  const [queue, setQueue] = useState<AdminFellowRequestItem[]>(initialQueue)
  const [statusFilter, setStatusFilter] = useState<string>('pending')
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleReview = async (id: string, decision: 'approved' | 'rejected', reason?: string) => {
    setLoadingId(id)
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/admin/fellow-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, rejectionReason: reason }),
      })
      const data = await res.json()

      if (!res.ok || !data.success) {
        setErrorMsg(data.error || `Failed to ${decision === 'approved' ? 'approve' : 'reject'} request.`)
        return
      }

      setQueue((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, status: decision, rejectionReason: reason || null, isFellow: decision === 'approved' ? true : item.isFellow }
            : item
        )
      )
      setRejectingId(null)
      setRejectReason('')
    } catch {
      setErrorMsg('Network error while reviewing request.')
    } finally {
      setLoadingId(null)
    }
  }

  const filteredQueue = queue.filter((item) => statusFilter === 'all' || item.status === statusFilter)

  const columns: Column<AdminFellowRequestItem>[] = [
    {
      header: 'Learner',
      cell: (item) => (
        <div>
          <p className="font-bold text-admin-fg text-xs">{item.userName}</p>
          <p className="text-[11px] text-admin-fg-muted font-mono">{item.email || `@${item.username}`}</p>
        </div>
      ),
    },
    {
      header: 'Readiness',
      cell: (item) => (
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs font-bold text-admin-fg">
            {item.readinessCompletedCount}/{item.readinessTotalCount}
          </span>
          {!item.isEligible && (
            <span title="No longer meets all requirements">
              <AlertTriangle className="w-3.5 h-3.5 text-admin-warning" />
            </span>
          )}
          {!item.isPortfolioPublic && (
            <span className="px-1.5 py-0.5 rounded bg-admin-danger-soft text-admin-danger text-[9px] font-bold border border-admin-danger/25">
              Private Portfolio
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Status',
      cell: (item) => (
        <div className="space-y-1">
          <AdminStatusBadge
            status={item.status === 'approved' ? 'healthy' : item.status === 'rejected' ? 'archived' : 'pending'}
            label={item.status.toUpperCase()}
          />
          {rejectingId === item.id && (
            <div className="mt-1.5 space-y-1.5 max-w-[220px]">
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason (optional)"
                className="w-full text-[11px] px-2 py-1 rounded bg-admin-bg border border-admin-border text-admin-fg focus:outline-none focus:border-admin-accent"
              />
              <div className="flex gap-1.5">
                <button
                  onClick={() => handleReview(item.id, 'rejected', rejectReason.trim() || undefined)}
                  disabled={loadingId === item.id}
                  className="px-2 py-1 bg-admin-danger hover:bg-admin-danger/90 text-white text-[10px] font-bold rounded flex items-center gap-1"
                >
                  <Check className="w-3 h-3" /> Confirm
                </button>
                <button
                  onClick={() => { setRejectingId(null); setRejectReason('') }}
                  className="px-2 py-1 bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-fg-muted text-[10px] font-bold rounded flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'Requested',
      cell: (item) => (
        <span className="text-admin-fg-muted font-mono text-[11px]">
          {new Date(item.requestedAt).toLocaleDateString()}
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
            {item.username && (
              <Link
                href={`/p/${item.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-fg-muted hover:text-admin-fg border border-admin-border transition-colors"
                title="View public portfolio"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            )}
            {item.status === 'pending' && (
              <>
                <button
                  onClick={() => handleReview(item.id, 'approved')}
                  disabled={isLoading}
                  title={item.isPortfolioPublic ? 'Approve Fellow request' : 'Portfolio must be public to approve'}
                  className="px-2 py-1 rounded bg-admin-success-soft hover:bg-admin-success/20 text-admin-success text-[10px] font-bold border border-admin-success/25 flex items-center gap-1 transition-colors disabled:opacity-50"
                >
                  <CheckCircle className="w-3 h-3" /> Approve
                </button>
                <button
                  onClick={() => setRejectingId(item.id)}
                  disabled={isLoading}
                  title="Reject Fellow request"
                  className="px-2 py-1 rounded bg-admin-danger-soft hover:bg-admin-danger/20 text-admin-danger text-[10px] font-bold border border-admin-danger/25 flex items-center gap-1 transition-colors disabled:opacity-50"
                >
                  <XCircle className="w-3 h-3" /> Reject
                </button>
              </>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-4">
      {errorMsg && (
        <div className="p-3 rounded-lg bg-admin-danger-soft border border-admin-danger/25 text-xs text-admin-danger">
          {errorMsg}
        </div>
      )}

      <div className="flex items-center gap-2">
        {['pending', 'approved', 'rejected', 'all'].map((f) => (
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
        emptyTitle="No Fellow requests found"
        emptyDescription="Requests submitted by eligible learners will appear here for review."
      />
    </div>
  )
}
