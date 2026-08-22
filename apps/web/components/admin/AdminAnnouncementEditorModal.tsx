'use client'

import React, { useState } from 'react'
import { X, Megaphone, Eye, Save, Send, AlertTriangle, Info, CheckCircle2, ShieldAlert } from 'lucide-react'
import { useAdminToast } from './admin-toast'
import type { SystemAnnouncementItem, AnnouncementType, AnnouncementStatus, AnnouncementTarget } from '@/lib/admin/announcements-service'

interface AdminAnnouncementEditorModalProps {
  open: boolean
  onClose: () => void
  announcement?: SystemAnnouncementItem | null
  onSaved: () => void
}

export function AdminAnnouncementEditorModal({
  open,
  onClose,
  announcement,
  onSaved,
}: AdminAnnouncementEditorModalProps) {
  const { toast } = useAdminToast()
  const isEditing = Boolean(announcement?.id)

  const [activeTab, setActiveTab] = useState<'form' | 'preview'>('form')
  const [title, setTitle] = useState(announcement?.title || '')
  const [content, setContent] = useState(announcement?.content || '')
  const [type, setType] = useState<AnnouncementType>(announcement?.type || 'info')
  const [status, setStatus] = useState<AnnouncementStatus>(announcement?.status || 'draft')
  const [targetAudience, setTargetAudience] = useState<AnnouncementTarget>(announcement?.targetAudience || 'all')
  const [targetCohortId, setTargetCohortId] = useState(announcement?.targetCohortId || '')
  const [targetUserId, setTargetUserId] = useState(announcement?.targetUserId || '')
  const [linkUrl, setLinkUrl] = useState(announcement?.linkUrl || '')
  const [linkText, setLinkText] = useState(announcement?.linkText || '')
  const [scheduledAt, setScheduledAt] = useState(
    announcement?.scheduledAt ? new Date(announcement.scheduledAt).toISOString().slice(0, 16) : ''
  )
  const [expiresAt, setExpiresAt] = useState(
    announcement?.expiresAt ? new Date(announcement.expiresAt).toISOString().slice(0, 16) : ''
  )
  const [dismissible, setDismissible] = useState(announcement?.dismissible ?? true)
  const [priority, setPriority] = useState(announcement?.priority ?? 1)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!open) return null

  const handleSubmit = async (submitStatus?: AnnouncementStatus) => {
    if (!title.trim() || !content.trim()) {
      toast('Title and content are required.', 'error')
      return
    }

    setIsSubmitting(true)
    try {
      const payload = {
        title: title.trim(),
        content: content.trim(),
        type,
        status: submitStatus || status,
        targetAudience,
        targetCohortId: targetAudience === 'cohort' ? targetCohortId.trim() : null,
        targetUserId: targetAudience === 'individual' ? targetUserId.trim() : null,
        linkUrl: linkUrl.trim() || null,
        linkText: linkText.trim() || null,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        dismissible,
        priority: Number(priority) || 1,
      }

      const url = isEditing
        ? `/api/admin/announcements/${announcement?.id}`
        : '/api/admin/announcements'
      const method = isEditing ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to save announcement')
      }

      toast(
        isEditing ? 'Announcement updated successfully' : 'Announcement created successfully',
        'success'
      )
      onSaved()
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Operation failed', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-admin-surface border border-admin-border rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-admin-border p-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-lg bg-admin-accent-soft border border-admin-accent/25">
              <Megaphone className="w-5 h-5 text-admin-accent" />
            </span>
            <div>
              <h2 className="text-base font-bold text-admin-fg">
                {isEditing ? 'Edit System Announcement' : 'Create System Announcement'}
              </h2>
              <p className="text-xs text-admin-fg-muted">
                Publish sitewide banners or targeted notices to learners
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-admin-bg/60 p-0.5 rounded-lg border border-admin-border">
              <button
                type="button"
                onClick={() => setActiveTab('form')}
                className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
                  activeTab === 'form'
                    ? 'bg-admin-accent text-admin-accent-contrast'
                    : 'text-admin-fg-muted hover:text-admin-fg'
                }`}
              >
                Editor
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition-colors inline-flex items-center gap-1 ${
                  activeTab === 'preview'
                    ? 'bg-admin-accent text-admin-accent-contrast'
                    : 'text-admin-fg-muted hover:text-admin-fg'
                }`}
              >
                <Eye className="w-3 h-3" />
                Live Preview
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-admin-fg-muted hover:text-admin-fg hover:bg-admin-surface-raised transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'preview' ? (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-admin-bg border border-admin-border text-xs text-admin-fg-muted">
                <span className="font-semibold text-admin-fg">Preview Mode:</span> This is how the banner will render at the top of the user application.
              </div>

              {/* Exact user banner component visual representation */}
              <div className="border border-admin-border rounded-xl overflow-hidden shadow-lg bg-black/40">
                <div
                  className={`relative w-full border-b py-3 px-4 sm:px-6 transition-all ${
                    type === 'warning'
                      ? 'bg-gradient-to-r from-amber-950/80 via-orange-950/80 to-amber-950/80 border-amber-500/30 text-amber-100'
                      : type === 'critical'
                      ? 'bg-gradient-to-r from-rose-950/90 via-red-950/90 to-rose-950/90 border-red-500/40 text-red-100'
                      : type === 'success'
                      ? 'bg-gradient-to-r from-emerald-950/80 via-teal-950/80 to-emerald-950/80 border-emerald-500/30 text-emerald-100'
                      : 'bg-gradient-to-r from-blue-950/80 via-indigo-950/80 to-blue-950/80 border-blue-500/30 text-blue-100'
                  }`}
                >
                  <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />}
                      {type === 'critical' && <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />}
                      {type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                      {type === 'info' && <Info className="w-4 h-4 text-blue-400 shrink-0" />}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 text-xs">
                        <span className="font-bold tracking-tight">{title || 'Sample Title'}</span>
                        <span className="opacity-90">{content || 'Announcement content preview will appear here.'}</span>
                        {linkUrl && (
                          <span className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 ml-1 cursor-pointer">
                            {linkText || 'Learn more'}
                          </span>
                        )}
                      </div>
                    </div>
                    {dismissible && (
                      <span className="p-1 rounded text-white/70">
                        <X className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-admin-fg">Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Scheduled Maintenance Notice"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-admin-border bg-admin-bg text-admin-fg focus:ring-2 focus:ring-admin-accent focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-admin-fg">Banner Style / Type</label>
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value as AnnouncementType)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-admin-border bg-admin-bg text-admin-fg focus:ring-2 focus:ring-admin-accent focus:outline-none"
                    >
                      <option value="info">Info (Blue)</option>
                      <option value="warning">Warning (Amber)</option>
                      <option value="critical">Critical / Maintenance (Red)</option>
                      <option value="success">Success / Launch (Green)</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-admin-fg">Initial Status</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as AnnouncementStatus)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-admin-border bg-admin-bg text-admin-fg focus:ring-2 focus:ring-admin-accent focus:outline-none"
                    >
                      <option value="draft">Draft</option>
                      <option value="active">Active (Immediate)</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="paused">Paused</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-admin-fg">Announcement Content</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Body text of the announcement shown in the banner..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-admin-border bg-admin-bg text-admin-fg focus:ring-2 focus:ring-admin-accent focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-admin-fg">Target Audience</label>
                  <select
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value as AnnouncementTarget)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-admin-border bg-admin-bg text-admin-fg focus:ring-2 focus:ring-admin-accent focus:outline-none"
                  >
                    <option value="all">All Learners</option>
                    <option value="cohort">Cohort Specific</option>
                    <option value="individual">Individual Learner</option>
                  </select>
                </div>
                {targetAudience === 'cohort' && (
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="block text-xs font-bold text-admin-fg">Target Cohort ID</label>
                    <input
                      type="text"
                      placeholder="Cohort ID or Slug"
                      value={targetCohortId}
                      onChange={(e) => setTargetCohortId(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-admin-border bg-admin-bg text-admin-fg focus:ring-2 focus:ring-admin-accent focus:outline-none"
                    />
                  </div>
                )}
                {targetAudience === 'individual' && (
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="block text-xs font-bold text-admin-fg">Target User UUID</label>
                    <input
                      type="text"
                      placeholder="User UUID"
                      value={targetUserId}
                      onChange={(e) => setTargetUserId(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-admin-border bg-admin-bg text-admin-fg focus:ring-2 focus:ring-admin-accent focus:outline-none"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-admin-fg">Action URL (Optional)</label>
                  <input
                    type="text"
                    placeholder="/academy or https://..."
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-admin-border bg-admin-bg text-admin-fg focus:ring-2 focus:ring-admin-accent focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-admin-fg">Action Link Text (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Read Status Details →"
                    value={linkText}
                    onChange={(e) => setLinkText(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-admin-border bg-admin-bg text-admin-fg focus:ring-2 focus:ring-admin-accent focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-admin-fg">Scheduled Start (Optional)</label>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-admin-border bg-admin-bg text-admin-fg focus:ring-2 focus:ring-admin-accent focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-admin-fg">Expires At (Optional)</label>
                  <input
                    type="datetime-local"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-admin-border bg-admin-bg text-admin-fg focus:ring-2 focus:ring-admin-accent focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-6 pt-1">
                <label className="flex items-center gap-2 text-xs font-medium text-admin-fg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dismissible}
                    onChange={(e) => setDismissible(e.target.checked)}
                    className="rounded border-admin-border text-admin-accent focus:ring-admin-accent"
                  />
                  Learners can dismiss banner
                </label>
                <div className="flex items-center gap-2 text-xs font-medium text-admin-fg">
                  <span>Priority:</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={priority}
                    onChange={(e) => setPriority(parseInt(e.target.value, 10) || 1)}
                    className="w-16 px-2 py-1 text-xs rounded border border-admin-border bg-admin-bg text-admin-fg font-mono"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-admin-border p-4 sm:px-6 bg-admin-bg/40">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-semibold text-admin-fg-muted hover:text-admin-fg rounded-lg border border-admin-border cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSubmit('draft')}
              className="px-3.5 py-2 text-xs font-semibold text-admin-fg hover:bg-admin-surface-raised rounded-lg border border-admin-border cursor-pointer disabled:opacity-50 transition-colors inline-flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              Save Draft
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSubmit('active')}
              className="px-4 py-2 text-xs font-bold text-admin-accent-contrast bg-admin-accent hover:bg-admin-accent/90 rounded-lg inline-flex items-center gap-1.5 shadow-lg cursor-pointer disabled:opacity-50 transition-all"
            >
              <Send className="w-3.5 h-3.5" />
              {isSubmitting ? 'Saving…' : 'Publish Immediately'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
