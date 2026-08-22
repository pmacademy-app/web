'use client'

import React, { useState } from 'react'
import { X, Send, AlertTriangle, ShieldAlert } from 'lucide-react'
import { useAdminToast } from './admin-toast'

interface AdminBroadcastModalProps {
  open: boolean
  onClose: () => void
}

export function AdminBroadcastModal({ open, onClose }: AdminBroadcastModalProps) {
  const { toast } = useAdminToast()

  const [audience, setAudience] = useState<'all' | 'individual' | 'cohort'>('individual')
  const [targetUserId, setTargetUserId] = useState('')
  const [cohortId, setCohortId] = useState('')
  const [channel, setChannel] = useState<'both' | 'in_app' | 'email'>('both')
  const [subject, setSubject] = useState('')
  const [content, setContent] = useState('')
  const [actionUrl, setActionUrl] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [isConfirming, setIsConfirming] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [idempotencyKey, setIdempotencyKey] = useState(() => `bcast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`)

  if (!open) return null

  const handleOpenConfirm = (e: React.FormEvent) => {
    e.preventDefault()
    if (!subject.trim() || !content.trim()) {
      toast('Subject and content are required.', 'error')
      return
    }
    if (audience === 'individual' && !targetUserId.trim()) {
      toast('Target User ID is required.', 'error')
      return
    }
    if (audience === 'cohort' && !cohortId.trim()) {
      toast('Cohort ID is required.', 'error')
      return
    }
    setIsConfirming(true)
  }

  const handleExecuteBroadcast = async () => {
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/admin/notifications/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audience,
          targetUserId: targetUserId.trim() || undefined,
          cohortId: cohortId.trim() || undefined,
          channel,
          subject: subject.trim(),
          content: content.trim(),
          actionUrl: actionUrl.trim() || undefined,
          scheduledAt: scheduledAt || undefined,
          idempotencyKey,
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Failed to dispatch broadcast')
      }

      toast(json.message || 'Notification broadcast sent successfully!', 'success')
      onClose()
      setIsConfirming(false)
      // Reset key for next send
      setIdempotencyKey(`bcast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Broadcast failed', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-admin-surface border border-admin-border rounded-xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-admin-border pb-4">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-lg bg-admin-accent-soft border border-admin-accent/25">
              <Send className="w-5 h-5 text-admin-accent" />
            </span>
            <div>
              <h2 className="text-base font-bold text-admin-fg">Manual Notification & Push</h2>
              <p className="text-xs text-admin-fg-muted">Dispatch custom in-app alerts and email notifications</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-admin-fg-muted hover:text-admin-fg hover:bg-admin-surface-raised transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!isConfirming ? (
          <form onSubmit={handleOpenConfirm} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-admin-fg">Audience</label>
                <select
                  value={audience}
                  onChange={(e) => setAudience(e.target.value as 'all' | 'individual' | 'cohort')}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-admin-border bg-admin-bg text-admin-fg focus:outline-none focus:ring-2 focus:ring-admin-accent"
                >
                  <option value="individual">Individual Learner</option>
                  <option value="cohort">Cohort Group</option>
                  <option value="all">All Active Learners</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-admin-fg">Channel</label>
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as 'both' | 'in_app' | 'email')}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-admin-border bg-admin-bg text-admin-fg focus:outline-none focus:ring-2 focus:ring-admin-accent"
                >
                  <option value="both">Both (In-App + Email)</option>
                  <option value="in_app">In-App Notification Only</option>
                  <option value="email">Email Queue Only</option>
                </select>
              </div>
            </div>

            {audience === 'individual' && (
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-admin-fg">Target Learner User ID</label>
                <input
                  type="text"
                  required
                  placeholder="UUID e.g. a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"
                  value={targetUserId}
                  onChange={(e) => setTargetUserId(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-admin-border bg-admin-bg text-admin-fg placeholder:text-admin-fg-subtle focus:outline-none focus:ring-2 focus:ring-admin-accent"
                />
              </div>
            )}

            {audience === 'cohort' && (
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-admin-fg">Cohort ID</label>
                <input
                  type="text"
                  required
                  placeholder="Cohort ID or Slug"
                  value={cohortId}
                  onChange={(e) => setCohortId(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-admin-border bg-admin-bg text-admin-fg placeholder:text-admin-fg-subtle focus:outline-none focus:ring-2 focus:ring-admin-accent"
                />
              </div>
            )}

            {audience === 'all' && (
              <div className="p-3 rounded-lg bg-admin-warning-soft border border-admin-warning/30 flex items-start gap-2.5 text-xs text-admin-warning">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>
                  Broad send to <strong>All Active Learners</strong> requires explicit two-step confirmation.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-admin-fg">Subject Line / Title</label>
              <input
                type="text"
                required
                placeholder="e.g. New Capstone Workshop is Live!"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-admin-border bg-admin-bg text-admin-fg placeholder:text-admin-fg-subtle focus:outline-none focus:ring-2 focus:ring-admin-accent"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-admin-fg">Message Content</label>
              <textarea
                required
                rows={3}
                placeholder="Notification body text..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-admin-border bg-admin-bg text-admin-fg placeholder:text-admin-fg-subtle focus:outline-none focus:ring-2 focus:ring-admin-accent"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-admin-fg">Action URL (Optional)</label>
                <input
                  type="text"
                  placeholder="/academy or https://..."
                  value={actionUrl}
                  onChange={(e) => setActionUrl(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-admin-border bg-admin-bg text-admin-fg placeholder:text-admin-fg-subtle focus:outline-none focus:ring-2 focus:ring-admin-accent font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-admin-fg">Schedule For (Optional)</label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-admin-border bg-admin-bg text-admin-fg focus:outline-none focus:ring-2 focus:ring-admin-accent"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-semibold text-admin-fg-muted hover:text-admin-fg rounded-lg border border-admin-border cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-admin-accent-contrast bg-admin-accent hover:bg-admin-accent/90 rounded-lg inline-flex items-center gap-1.5 shadow-lg cursor-pointer transition-all"
              >
                Review & Confirm Send
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-admin-surface-raised border border-admin-border space-y-3">
              <h3 className="text-xs font-bold text-admin-fg uppercase tracking-wider flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-admin-warning" />
                Confirm Notification Broadcast
              </h3>
              <div className="space-y-2 text-xs text-admin-fg">
                <div className="flex justify-between border-b border-admin-border pb-1">
                  <span className="text-admin-fg-muted">Audience:</span>
                  <span className="font-bold uppercase font-mono">{audience}</span>
                </div>
                <div className="flex justify-between border-b border-admin-border pb-1">
                  <span className="text-admin-fg-muted">Channel:</span>
                  <span className="font-bold font-mono">{channel}</span>
                </div>
                <div className="flex justify-between border-b border-admin-border pb-1">
                  <span className="text-admin-fg-muted">Subject:</span>
                  <span className="font-semibold text-right max-w-xs truncate">{subject}</span>
                </div>
                <div className="flex justify-between border-b border-admin-border pb-1">
                  <span className="text-admin-fg-muted">Idempotency Key:</span>
                  <span className="font-mono text-[10px] text-admin-accent">{idempotencyKey}</span>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-admin-bg/60 border border-admin-border text-xs text-admin-fg-muted">
                <p className="font-semibold text-admin-fg mb-1">Preview:</p>
                <p className="whitespace-pre-wrap">{content}</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setIsConfirming(false)}
                className="px-3.5 py-2 text-xs font-semibold text-admin-fg-muted hover:text-admin-fg rounded-lg border border-admin-border cursor-pointer transition-colors"
              >
                Back to Edit
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleExecuteBroadcast}
                className="px-4 py-2 text-xs font-bold text-white bg-admin-danger hover:bg-admin-danger/90 rounded-lg inline-flex items-center gap-1.5 shadow-lg cursor-pointer disabled:opacity-50 transition-all"
              >
                <Send className="w-3.5 h-3.5" />
                {isSubmitting ? 'Dispatching…' : 'Confirm & Push Notification'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
