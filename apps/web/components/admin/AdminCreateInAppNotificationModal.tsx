'use client'

import React, { useState, useEffect } from 'react'
import {
  X,
  Bell,
  Send,
  Calendar,
  Target,
  Link as LinkIcon,
  Filter,
} from 'lucide-react'
import { useAdminToast } from './admin-toast'
import type {
  InAppPriorityLevel,
  InAppCategory,
  InAppAudienceType,
  InAppBroadcastItem,
} from '@/lib/admin/in-app-manager-service'
import type { AdminUserFilters } from '@/lib/admin/types'

interface AdminCreateInAppNotificationModalProps {
  open: boolean
  onClose: () => void
  onCreated: (item: InAppBroadcastItem) => void
}

const CATEGORIES: Array<{ key: InAppCategory; label: string; icon: string }> = [
  { key: 'announcement', label: 'Announcement', icon: '📢' },
  { key: 'learning', label: 'Learning & Curriculum', icon: '📚' },
  { key: 'achievements', label: 'Achievements & Badges', icon: '🏆' },
  { key: 'product_updates', label: 'Product Update', icon: '✨' },
  { key: 'security', label: 'Security & Account', icon: '🔒' },
  { key: 'marketing', label: 'Marketing & Community', icon: '🚀' },
]

const PRIORITIES: Array<{ key: InAppPriorityLevel; label: string; desc: string; color: string }> = [
  { key: 'urgent', label: 'Urgent', desc: 'Critical alerts shown prominently at the top', color: 'text-red-400 border-red-500/30 bg-red-500/10' },
  { key: 'high', label: 'High', desc: 'Important course updates & time-sensitive notices', color: 'text-amber-400 border-amber-500/30 bg-amber-500/10' },
  { key: 'medium', label: 'Medium', desc: 'Standard updates & milestones (default)', color: 'text-blue-400 border-blue-500/30 bg-blue-500/10' },
  { key: 'low', label: 'Low', desc: 'Optional tips & background announcements', color: 'text-slate-400 border-slate-500/30 bg-slate-500/10' },
]

export function AdminCreateInAppNotificationModal({
  open,
  onClose,
  onCreated,
}: AdminCreateInAppNotificationModalProps) {
  const { toast } = useAdminToast()

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [category, setCategory] = useState<InAppCategory>('announcement')
  const [priority, setPriority] = useState<InAppPriorityLevel>('medium')
  const [actionUrl, setActionUrl] = useState('')
  const [audience, setAudience] = useState<InAppAudienceType>('all')
  const [targetUserId, setTargetUserId] = useState('')
  const [targetCohortId, setTargetCohortId] = useState('')
  const [sendTiming, setSendTiming] = useState<'immediate' | 'schedule' | 'draft'>('immediate')
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('09:00')
  const [expiresAt, setExpiresAt] = useState('')

  // Unified recipient filters
  const [filters, setFilters] = useState<AdminUserFilters>({
    verificationStatus: 'all',
    role: 'all',
    activity: 'all',
    progress: 'all',
    level: 'all',
    onboardingStatus: 'all',
  })
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const [recipientCount, setRecipientCount] = useState<number | null>(null)
  const [calculatingCount, setCalculatingCount] = useState(false)
  const [sampleUsers, setSampleUsers] = useState<Array<{ id: string; email: string; name?: string }>>([])
  const [loadingSample, setLoadingSample] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Recalculate recipient count
  useEffect(() => {
    if (!open) return
    let active = true

    const run = async () => {
      try {
        setCalculatingCount(true)
        const res = await fetch('/api/admin/notifications/in-app/recipient-count', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audience,
            targetUserId: targetUserId.trim() || undefined,
            targetCohortId: targetCohortId.trim() || undefined,
            recipientFilters: filters,
          }),
        })
        const json = await res.json()
        if (active && json.success) {
          setRecipientCount(json.count)
        }
      } catch {
        // ignore
      } finally {
        if (active) setCalculatingCount(false)
      }
    }

    void run()
    return () => {
      active = false
    }
  }, [open, audience, targetUserId, targetCohortId, filters])

  const fetchSample = async () => {
    setLoadingSample(true)
    try {
      const res = await fetch('/api/admin/notifications/in-app/recipient-sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audience,
          targetUserId: targetUserId.trim() || undefined,
          targetCohortId: targetCohortId.trim() || undefined,
          recipientFilters: filters,
          limit: 5,
        }),
      })
      const json = await res.json()
      if (json.success) {
        setSampleUsers(json.users || [])
      }
    } catch {
      // ignore
    } finally {
      setLoadingSample(false)
    }
  }

  if (!open) return null

  const handleSubmit = async (submitType: 'immediate' | 'schedule' | 'draft') => {
    if (!title.trim() || !body.trim()) {
      toast('Title and body content are required.', 'error')
      return
    }

    if (audience === 'individual' && !targetUserId.trim()) {
      toast('Target User ID is required for individual audience.', 'error')
      return
    }

    if (audience === 'cohort' && !targetCohortId.trim()) {
      toast('Cohort ID is required for cohort audience.', 'error')
      return
    }

    let scheduledAtIso: string | null = null
    if (submitType === 'schedule') {
      if (!scheduledDate) {
        toast('Scheduled date is required.', 'error')
        return
      }
      scheduledAtIso = new Date(`${scheduledDate}T${scheduledTime || '09:00'}:00`).toISOString()
      if (new Date(scheduledAtIso).getTime() <= Date.now()) {
        toast('Scheduled time must be in the future.', 'error')
        return
      }
    }

    setIsSubmitting(true)
    try {
      const payload = {
        title: title.trim(),
        body: body.trim(),
        category,
        priority,
        actionUrl: actionUrl.trim() || null,
        audience,
        targetUserId: audience === 'individual' ? targetUserId.trim() : null,
        targetCohortId: audience === 'cohort' ? targetCohortId.trim() : null,
        recipientFilters: audience === 'filtered' ? filters : {},
        scheduledAt: scheduledAtIso,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        status: submitType === 'immediate' ? 'sending' : submitType === 'schedule' ? 'scheduled' : 'draft',
      }

      const res = await fetch('/api/admin/notifications/in-app', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to create in-app notification')
      }

      toast(
        submitType === 'immediate'
          ? 'In-App notification dispatched successfully!'
          : submitType === 'schedule'
          ? 'In-App notification scheduled successfully!'
          : 'In-App notification saved as draft.',
        'success'
      )

      onCreated(json.item)
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Action failed', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-admin-surface border border-admin-border rounded-xl max-w-2xl w-full p-6 space-y-6 shadow-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-admin-border pb-4">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-lg bg-admin-accent-soft border border-admin-accent/25">
              <Bell className="w-5 h-5 text-admin-accent" />
            </span>
            <div>
              <h2 className="text-base font-bold text-admin-fg">Create In-App Notification</h2>
              <p className="text-xs text-admin-fg-muted">
                Compose and dispatch notifications directly to learner inboxes
              </p>
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

        <form onSubmit={(e) => e.preventDefault()} className="space-y-5">
          {/* Title & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-semibold text-admin-fg">Notification Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. New Capstone Project Available 🚀"
                className="w-full px-3 py-2 text-xs bg-admin-surface-raised border border-admin-border rounded-lg text-admin-fg placeholder:text-admin-fg-subtle focus:outline-none focus:border-admin-accent"
                maxLength={150}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-admin-fg">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as InAppCategory)}
                className="w-full px-3 py-2 text-xs bg-admin-surface-raised border border-admin-border rounded-lg text-admin-fg focus:outline-none focus:border-admin-accent"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.icon} {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Body */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-admin-fg">Notification Content / Body *</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder="Enter message text that will appear in learner notification center..."
              className="w-full px-3 py-2 text-xs bg-admin-surface-raised border border-admin-border rounded-lg text-admin-fg placeholder:text-admin-fg-subtle focus:outline-none focus:border-admin-accent resize-none"
              maxLength={2000}
            />
          </div>

          {/* Priority Selection */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-admin-fg">Delivery Priority</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {PRIORITIES.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPriority(p.key)}
                  className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                    priority === p.key
                      ? `${p.color} ring-1 ring-admin-accent font-semibold`
                      : 'border-admin-border bg-admin-surface-raised/40 text-admin-fg-muted hover:border-admin-border-strong'
                  }`}
                >
                  <div className="text-xs font-bold">{p.label}</div>
                  <div className="text-[10px] opacity-75 mt-0.5 line-clamp-1">{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Action Deep Link */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-admin-fg flex items-center gap-1.5">
                <LinkIcon className="w-3.5 h-3.5 text-admin-accent" /> Action / CTA Deep Link (Optional)
              </label>
              <span className="text-[10px] text-admin-fg-subtle">e.g. /academy, /badges, /progress</span>
            </div>
            <input
              type="text"
              value={actionUrl}
              onChange={(e) => setActionUrl(e.target.value)}
              placeholder="/academy/core-principles/lesson-1"
              className="w-full px-3 py-2 text-xs bg-admin-surface-raised border border-admin-border rounded-lg text-admin-fg placeholder:text-admin-fg-subtle focus:outline-none focus:border-admin-accent font-mono"
            />
          </div>

          {/* Audience Targeting */}
          <div className="space-y-3 p-3.5 rounded-xl bg-admin-surface-raised/50 border border-admin-border">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-admin-fg flex items-center gap-1.5">
                <Target className="w-4 h-4 text-admin-accent" /> Target Audience
              </span>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[11px] font-mono rounded bg-admin-accent-soft text-admin-accent font-semibold">
                  {calculatingCount ? 'Counting...' : `~${recipientCount ?? 0} recipients`}
                </span>
                <button
                  type="button"
                  onClick={fetchSample}
                  className="text-[10px] text-admin-fg-muted hover:text-admin-fg underline cursor-pointer"
                >
                  {loadingSample ? 'Loading...' : 'Sample'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { key: 'all', label: 'All Learners' },
                { key: 'filtered', label: 'Filtered Audience' },
                { key: 'cohort', label: 'Specific Cohort' },
                { key: 'individual', label: 'Individual User' },
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setAudience(opt.key as InAppAudienceType)}
                  className={`px-3 py-2 text-xs rounded-lg border text-center transition-colors cursor-pointer ${
                    audience === opt.key
                      ? 'bg-admin-accent text-admin-accent-fg border-admin-accent font-semibold'
                      : 'bg-admin-surface border-admin-border text-admin-fg-muted hover:text-admin-fg'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Target inputs */}
            {audience === 'individual' && (
              <div className="space-y-1 pt-1">
                <input
                  type="text"
                  value={targetUserId}
                  onChange={(e) => setTargetUserId(e.target.value)}
                  placeholder="Enter User UUID (e.g. 550e8400-e29b-41d4-a716-446655440000)"
                  className="w-full px-3 py-2 text-xs bg-admin-surface border border-admin-border rounded-lg text-admin-fg font-mono placeholder:text-admin-fg-subtle focus:outline-none focus:border-admin-accent"
                />
              </div>
            )}

            {audience === 'cohort' && (
              <div className="space-y-1 pt-1">
                <input
                  type="text"
                  value={targetCohortId}
                  onChange={(e) => setTargetCohortId(e.target.value)}
                  placeholder="Enter Cohort UUID (e.g. 123e4567-e89b-12d3-a456-426614174000)"
                  className="w-full px-3 py-2 text-xs bg-admin-surface border border-admin-border rounded-lg text-admin-fg font-mono placeholder:text-admin-fg-subtle focus:outline-none focus:border-admin-accent"
                />
              </div>
            )}

            {audience === 'filtered' && (
              <div className="pt-2 border-t border-admin-border/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-admin-fg-muted flex items-center gap-1">
                    <Filter className="w-3 h-3" /> Unified Server-Side Filter Rules
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowFilterPanel(!showFilterPanel)}
                    className="text-[11px] text-admin-accent hover:underline cursor-pointer"
                  >
                    {showFilterPanel ? 'Hide Filters' : 'Customize Filters'}
                  </button>
                </div>

                {showFilterPanel && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 rounded-lg bg-admin-surface border border-admin-border">
                    <div>
                      <label className="text-[10px] text-admin-fg-muted">Onboarding</label>
                      <select
                        value={filters.onboardingStatus || 'all'}
                        onChange={(e) => setFilters({ ...filters, onboardingStatus: e.target.value as never })}
                        className="w-full px-2 py-1 text-[11px] bg-admin-surface-raised border border-admin-border rounded text-admin-fg"
                      >
                        <option value="all">All Statuses</option>
                        <option value="completed">Completed Onboarding</option>
                        <option value="pending">Pending Onboarding</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] text-admin-fg-muted">Verification</label>
                      <select
                        value={filters.verificationStatus || 'all'}
                        onChange={(e) => setFilters({ ...filters, verificationStatus: e.target.value as never })}
                        className="w-full px-2 py-1 text-[11px] bg-admin-surface-raised border border-admin-border rounded text-admin-fg"
                      >
                        <option value="all">All Learners</option>
                        <option value="verified">Verified Only</option>
                        <option value="unverified">Unverified Only</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] text-admin-fg-muted">Role</label>
                      <select
                        value={filters.role || 'all'}
                        onChange={(e) => setFilters({ ...filters, role: e.target.value as never })}
                        className="w-full px-2 py-1 text-[11px] bg-admin-surface-raised border border-admin-border rounded text-admin-fg"
                      >
                        <option value="all">All Roles</option>
                        <option value="learner">Learners Only</option>
                        <option value="admin">Admins Only</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] text-admin-fg-muted">Activity</label>
                      <select
                        value={filters.activity || 'all'}
                        onChange={(e) => setFilters({ ...filters, activity: e.target.value as never })}
                        className="w-full px-2 py-1 text-[11px] bg-admin-surface-raised border border-admin-border rounded text-admin-fg"
                      >
                        <option value="all">Any Activity</option>
                        <option value="active_7d">Active in last 7 days</option>
                        <option value="active_30d">Active in last 30 days</option>
                        <option value="inactive_30d">Inactive (30+ days)</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}

            {sampleUsers.length > 0 && (
              <div className="p-2.5 rounded-lg bg-admin-surface border border-admin-border text-[11px] space-y-1">
                <span className="text-[10px] font-bold text-admin-fg-muted uppercase">Sample Recipients:</span>
                <div className="flex flex-wrap gap-1.5">
                  {sampleUsers.map((u) => (
                    <span key={u.id} className="px-2 py-0.5 rounded bg-admin-surface-raised text-admin-fg text-[10px] font-mono">
                      {u.name || u.email}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Delivery Timing & Expiration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-admin-fg">Delivery Timing</label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { key: 'immediate', label: 'Send Now' },
                  { key: 'schedule', label: 'Schedule' },
                  { key: 'draft', label: 'Draft Only' },
                ].map((timing) => (
                  <button
                    key={timing.key}
                    type="button"
                    onClick={() => setSendTiming(timing.key as never)}
                    className={`px-2 py-1.5 text-xs rounded-lg border text-center transition-colors cursor-pointer ${
                      sendTiming === timing.key
                        ? 'bg-admin-accent-soft border-admin-accent text-admin-accent font-semibold'
                        : 'border-admin-border text-admin-fg-muted hover:text-admin-fg'
                    }`}
                  >
                    {timing.label}
                  </button>
                ))}
              </div>

              {sendTiming === 'schedule' && (
                <div className="grid grid-cols-2 gap-2 pt-1.5">
                  <div>
                    <input
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-admin-surface-raised border border-admin-border rounded-lg text-admin-fg"
                    />
                  </div>
                  <div>
                    <input
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-admin-surface-raised border border-admin-border rounded-lg text-admin-fg"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-admin-fg flex items-center justify-between">
                <span>Expiration Date (Optional)</span>
                <span className="text-[10px] text-admin-fg-subtle">Temporary notification</span>
              </label>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-admin-surface-raised border border-admin-border rounded-lg text-admin-fg"
              />
              <p className="text-[10px] text-admin-fg-subtle">
                Leaves learner inbox after expiration. If unset, persists for default 45 days.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-admin-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-admin-fg-muted hover:text-admin-fg transition-colors cursor-pointer"
            >
              Cancel
            </button>

            {sendTiming === 'draft' && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleSubmit('draft')}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-admin-surface-raised border border-admin-border text-admin-fg hover:bg-admin-surface-raised/80 transition-colors cursor-pointer"
              >
                Save as Draft
              </button>
            )}

            {sendTiming === 'schedule' && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleSubmit('schedule')}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-admin-accent text-admin-accent-fg hover:bg-admin-accent/90 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Calendar className="w-3.5 h-3.5" /> Schedule Notification
              </button>
            )}

            {sendTiming === 'immediate' && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleSubmit('immediate')}
                className="px-5 py-2 text-xs font-bold rounded-lg bg-admin-accent text-admin-accent-fg hover:bg-admin-accent/90 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" /> Send Immediately
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
