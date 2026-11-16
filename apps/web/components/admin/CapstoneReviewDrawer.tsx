'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileCheck2, CheckCircle2, XCircle, AlertTriangle, User } from 'lucide-react'
import { AdminDrawer } from './AdminDrawer'
import { AdminConfirmDialog } from './AdminConfirmDialog'
import { AdminEmptyState } from './AdminEmptyState'
import { AdminStatusBadge } from './AdminStatusBadge'
import { useAdminToast } from './admin-toast'
import { apiPost } from '@/lib/api/client'
import { computeReviewAge } from '@/lib/admin/capstone-review-aging'
import { getCapstoneDefinition } from '@/config/capstones'
import type { AdminCapstoneRow } from '@/lib/admin/achievements-aggregation'

interface CapstoneReviewDrawerProps {
  capstoneId: string | null
  capstone: AdminCapstoneRow | null
  isOpen: boolean
  onClose: () => void
}

const SCORE_LABELS: Record<number, string> = {
  0: '0: Missing',
  1: '1: Developing',
  2: '2: Proficient',
  3: '3: Exemplary',
}

export function CapstoneReviewDrawer({ capstoneId, capstone, isOpen, onClose }: CapstoneReviewDrawerProps) {
  const router = useRouter()
  const { toast } = useAdminToast()
  const [loading, setLoading] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'reject' | 'request_changes' | null>(null)

  // Rubric scoring and written feedback state
  const [scores, setScores] = useState<Record<string, number>>({})
  const [feedback, setFeedback] = useState<string>('')

  const capstoneDef = capstone?.moduleSlug ? getCapstoneDefinition(capstone.moduleSlug) : null
  const requirements = useMemo(() => capstoneDef?.requirements || [], [capstoneDef])

  // Check if all rubric requirements have been assigned a score (0..3)
  const allScoresAssigned = useMemo(() => {
    if (requirements.length === 0) return true
    return requirements.every((req) => typeof scores[req.id] === 'number')
  }, [requirements, scores])

  const hasFeedback = feedback.trim().length > 0

  const handleScoreChange = (reqId: string, score: number) => {
    setScores((prev) => ({ ...prev, [reqId]: score }))
  }

  const handleReview = async (action: 'approve' | 'reject' | 'request_changes') => {
    if (!capstone) return
    setLoading(true)
    try {
      const result = await apiPost<{ success: boolean; error?: string }>(
        `/api/admin/capstones/${capstone.id}/review`,
        {
          action,
          scores,
          feedback: feedback.trim() || undefined,
        }
      )

      if (result.ok && result.data.success) {
        const msg =
          action === 'approve'
            ? `Capstone approved and published to ${capstone.learnerName}'s portfolio.`
            : action === 'request_changes'
            ? `Feedback sent to ${capstone.learnerName} requesting revisions.`
            : `Capstone rejected and kept private.`
        toast(msg, 'success')
        setConfirmAction(null)
        onClose()
        router.refresh()
      } else {
        const errorMsg = !result.ok ? result.error.message : (result.data.error || 'Review action failed. Please try again.')
        toast(errorMsg, 'error')
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
              {(() => {
                const age = computeReviewAge(capstone.submittedAt, capstone.reviewedAt)
                return (
                  <span
                    className="px-2 py-0.5 rounded bg-admin-surface-raised text-admin-fg-muted font-mono text-[10px] border border-admin-border"
                    title={
                      age.awaitingReview
                        ? 'Elapsed time since submission (not a review deadline).'
                        : 'Time from submission to first review.'
                    }
                  >
                    {age.label}
                  </span>
                )
              })()}
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

            {/* Rubric Assessment */}
            {requirements.length > 0 && (
              <div className="space-y-3 pt-2 border-t border-admin-border">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-admin-fg-muted">
                    Rubric Scoring (0 to 3)
                  </h3>
                  <span className="text-[11px] text-admin-fg-muted font-mono">
                    {Object.keys(scores).length} of {requirements.length} scored
                  </span>
                </div>
                <div className="space-y-3">
                  {requirements.map((req) => (
                    <div
                      key={req.id}
                      className="rounded-xl bg-admin-surface-raised border border-admin-border p-3 space-y-2"
                    >
                      <div>
                        <p className="text-xs font-bold text-admin-fg">{req.label}</p>
                        <p className="text-[11px] text-admin-fg-muted leading-relaxed">{req.description}</p>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1" role="radiogroup" aria-label={req.label}>
                        {[0, 1, 2, 3].map((score) => {
                          const isSelected = scores[req.id] === score
                          return (
                            <button
                              key={score}
                              type="button"
                              role="radio"
                              aria-checked={isSelected}
                              onClick={() => handleScoreChange(req.id, score)}
                              className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-admin-accent text-admin-fg-inverse border-admin-accent font-bold'
                                  : 'bg-admin-surface border-admin-border text-admin-fg-muted hover:text-admin-fg'
                              }`}
                            >
                              {SCORE_LABELS[score]}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Written Feedback */}
            <div className="space-y-2 pt-2 border-t border-admin-border">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-admin-fg-muted">
                  Written Feedback
                </h3>
                <span className="text-[11px] text-admin-fg-muted font-mono">
                  {feedback.length} / 4000
                </span>
              </div>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value.slice(0, 4000))}
                rows={4}
                placeholder="Specific guidance, highlights, or required improvements for the learner..."
                className="w-full rounded-xl bg-admin-surface-raised border border-admin-border p-3 text-xs text-admin-fg placeholder:text-admin-fg-muted/60 focus:outline-none focus:border-admin-accent"
              />
            </div>

            {/* Review actions */}
            {capstone.status === 'submitted' ? (
              <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-admin-border">
                <button
                  type="button"
                  onClick={() => handleReview('approve')}
                  disabled={loading || !allScoresAssigned}
                  title={!allScoresAssigned ? 'Score all rubric items to approve' : undefined}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-admin-success text-admin-fg text-xs font-bold hover:bg-admin-success/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {loading ? 'Saving...' : 'Approve & Publish'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmAction('request_changes')}
                  disabled={loading || !allScoresAssigned || !hasFeedback}
                  title={!allScoresAssigned ? 'Score all rubric items first' : !hasFeedback ? 'Written feedback required to request changes' : undefined}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500/15 text-warning text-xs font-bold border border-amber-500/30 hover:bg-amber-500/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <AlertTriangle className="w-4 h-4" />
                  Request Changes
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmAction('reject')}
                  disabled={loading || !allScoresAssigned || !hasFeedback}
                  title={!allScoresAssigned ? 'Score all rubric items first' : !hasFeedback ? 'Written feedback required to reject' : undefined}
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
        open={confirmAction === 'reject'}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null)
        }}
        title="Reject this capstone?"
        description="The submission will be marked reviewed and kept private; it will not appear on the learner's public portfolio."
        confirmLabel="Reject"
        destructive
        onConfirm={() => handleReview('reject')}
      />

      <AdminConfirmDialog
        open={confirmAction === 'request_changes'}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null)
        }}
        title="Request changes on this capstone?"
        description="The feedback and rubric scores will be sent to the learner so they can revise and resubmit their deliverable."
        confirmLabel="Request Changes"
        onConfirm={() => handleReview('request_changes')}
      />
    </>
  )
}
