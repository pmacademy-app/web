'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileCheck2, CheckCircle2, XCircle, User } from 'lucide-react'
import { AdminDrawer } from './AdminDrawer'
import { AdminConfirmDialog } from './AdminConfirmDialog'
import { AdminEmptyState } from './AdminEmptyState'
import { AdminStatusBadge } from './AdminStatusBadge'
import { useAdminToast } from './admin-toast'
import type { AdminCapstoneRow } from '@/lib/admin/achievements-aggregation'

interface CapstoneReviewDrawerProps {
  capstoneId: string | null
  capstone: AdminCapstoneRow | null
  isOpen: boolean
  onClose: () => void
}

export function CapstoneReviewDrawer({ capstoneId, capstone, isOpen, onClose }: CapstoneReviewDrawerProps) {
  const router = useRouter()
  const { toast } = useAdminToast()
  const [loading, setLoading] = useState(false)
  const [confirmReject, setConfirmReject] = useState(false)

  const handleReview = async (action: 'approve' | 'reject') => {
    if (!capstone) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/capstones/${capstone.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (data.success) {
        toast(
          action === 'approve'
            ? `Capstone approved and published to ${capstone.learnerName}'s portfolio.`
            : `Capstone rejected and kept private.`,
          'success'
        )
        setConfirmReject(false)
        onClose()
        router.refresh()
      } else {
        toast(data.error || 'Review action failed. Please try again.', 'error')
      }
    } catch {
      toast('Review action failed. Please try again.', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <AdminDrawer
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
        title={capstone ? capstone.capstoneTitle : 'Capstone Review'}
        description={capstone ? `${capstone.moduleTitle} · ${capstone.learnerName}` : undefined}
        size="lg"
      >
        {capstone ? (
          <div className="space-y-6">
            {/* Meta */}
            <div className="flex flex-wrap items-center gap-2">
              <AdminStatusBadge
                status={
                  capstone.status === 'submitted'
                    ? 'pending'
                    : capstone.status === 'reviewed'
                    ? capstone.isPublic
                      ? 'published'
                      : 'archived'
                    : 'draft'
                }
                label={capstone.status.toUpperCase()}
              />
              {capstone.isPublic ? (
                <span className="px-2 py-0.5 rounded bg-admin-success-soft text-admin-success text-[10px] font-bold border border-admin-success/25">
                  Public on portfolio
                </span>
              ) : (
                capstone.status === 'reviewed' && (
                  <span className="px-2 py-0.5 rounded bg-admin-surface-raised text-admin-fg-muted text-[10px] font-bold border border-admin-border">
                    Kept private
                  </span>
                )
              )}
              <span className="px-2 py-0.5 rounded bg-admin-surface-raised text-admin-fg-muted font-mono text-[10px] border border-admin-border">
                {capstone.wordCount.toLocaleString()} words
              </span>
              <span className="px-2 py-0.5 rounded bg-admin-surface-raised text-admin-fg-muted font-mono text-[10px] border border-admin-border">
                Submitted {new Date(capstone.submittedAt).toLocaleDateString()}
              </span>
            </div>

            {/* Learner */}
            <div className="flex items-center justify-between gap-3 rounded-xl bg-admin-surface-raised border border-admin-border p-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-admin-accent-soft border border-admin-accent/25 flex items-center justify-center font-bold text-admin-accent shrink-0">
                  {capstone.learnerName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-admin-fg truncate">{capstone.learnerName}</p>
                  <p className="text-[11px] font-mono text-admin-fg-muted truncate">{capstone.moduleSlug}</p>
                </div>
              </div>
              <Link
                href={`/admin/users?userId=${encodeURIComponent(capstone.userId || '')}`}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-admin-surface hover:bg-admin-surface-raised text-admin-fg-muted hover:text-admin-fg text-[11px] font-semibold border border-admin-border transition-colors shrink-0"
              >
                <User className="w-3 h-3" /> View learner
              </Link>
            </div>

            {/* Content */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-admin-fg-muted flex items-center gap-1.5">
                <FileCheck2 className="w-3.5 h-3.5" /> Submission Content
              </h3>
              <div className="rounded-xl bg-admin-surface-raised border border-admin-border p-4 max-h-96 overflow-y-auto">
                <p className="text-sm text-admin-fg leading-relaxed whitespace-pre-wrap">{capstone.content}</p>
              </div>
            </div>

            {/* Review actions */}
            {capstone.status === 'submitted' ? (
              <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-admin-border">
                <button
                  type="button"
                  onClick={() => handleReview('approve')}
                  disabled={loading}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-admin-success text-admin-fg text-xs font-bold hover:bg-admin-success/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {loading ? 'Saving…' : 'Approve & Publish'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReject(true)}
                  disabled={loading}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-admin-danger-soft text-admin-danger text-xs font-bold border border-admin-danger/25 hover:bg-admin-danger/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <XCircle className="w-4 h-4" />
                  Reject
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl bg-admin-surface-raised border border-admin-border px-4 py-3 text-xs text-admin-fg-muted">
                <CheckCircle2 className="w-4 h-4 text-admin-success shrink-0" />
                This capstone has already been reviewed
                {capstone.isPublic ? ' and is public on the learner portfolio.' : ' and is kept private.'}
              </div>
            )}
          </div>
        ) : (
          <AdminEmptyState
            icon={FileCheck2}
            title="Capstone not found"
            description={
              capstoneId ? `No capstone submission matches id "${capstoneId}".` : 'Select a capstone to review it.'
            }
          />
        )}
      </AdminDrawer>

      <AdminConfirmDialog
        open={confirmReject}
        onOpenChange={setConfirmReject}
        title="Reject this capstone?"
        description="The submission will be marked reviewed and kept private — it will not appear on the learner's public portfolio."
        confirmLabel="Reject"
        destructive
        onConfirm={() => handleReview('reject')}
      />
    </>
  )
}