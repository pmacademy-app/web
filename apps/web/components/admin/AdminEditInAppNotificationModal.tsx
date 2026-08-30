'use client'

import React, { useState } from 'react'
import {
  X,
  Bell,
  Save,
  Calendar,
  Link as LinkIcon,
} from 'lucide-react'
import { useAdminToast } from './admin-toast'
import type {
  InAppPriorityLevel,
  InAppCategory,
  InAppBroadcastItem,
} from '@/lib/admin/in-app-manager-service'

interface AdminEditInAppNotificationModalProps {
  open: boolean
  onClose: () => void
  broadcast: InAppBroadcastItem | null
  onUpdated: (item: InAppBroadcastItem) => void
}

const CATEGORIES: Array<{ key: InAppCategory; label: string; icon: string }> = [
  { key: 'announcement', label: 'Announcement', icon: '📢' },
  { key: 'learning', label: 'Learning & Curriculum', icon: '📚' },
  { key: 'achievements', label: 'Achievements & Badges', icon: '🏆' },
  { key: 'product_updates', label: 'Product Update', icon: '✨' },
  { key: 'security', label: 'Security & Account', icon: '🔒' },
  { key: 'marketing', label: 'Marketing & Community', icon: '🚀' },
]

const PRIORITIES: Array<{ key: InAppPriorityLevel; label: string }> = [
  { key: 'urgent', label: 'Urgent' },
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
]

function EditForm({
  broadcast,
  onClose,
  onUpdated,
}: {
  broadcast: InAppBroadcastItem
  onClose: () => void
  onUpdated: (item: InAppBroadcastItem) => void
}) {
  const { toast } = useAdminToast()

  const [title, setTitle] = useState(broadcast.title || '')
  const [body, setBody] = useState(broadcast.body || '')
  const [category, setCategory] = useState<InAppCategory>((broadcast.category as InAppCategory) || 'announcement')
  const [priority, setPriority] = useState<InAppPriorityLevel>(broadcast.priority || 'medium')
  const [actionUrl, setActionUrl] = useState(broadcast.actionUrl || '')
  const [scheduledAt, setScheduledAt] = useState(
    broadcast.scheduledAt ? new Date(broadcast.scheduledAt).toISOString().slice(0, 16) : ''
  )
  const [expiresAt, setExpiresAt] = useState(
    broadcast.expiresAt ? new Date(broadcast.expiresAt).toISOString().slice(0, 16) : ''
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSave = async () => {
    if (!title.trim() || !body.trim()) {
      toast('Title and body content are required.', 'error')
      return
    }

    setIsSubmitting(true)
    try {
      const payload = {
        title: title.trim(),
        body: body.trim(),
        category,
        priority,
        actionUrl: actionUrl.trim() || null,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      }

      const res = await fetch(`/api/admin/notifications/in-app/${broadcast.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to update in-app notification')
      }

      toast('In-App notification updated successfully!', 'success')
      onUpdated(json.item)
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Update failed', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="bg-admin-surface border border-admin-border rounded-xl max-w-lg w-full p-6 space-y-5 shadow-2xl my-8">
      <div className="flex items-center justify-between border-b border-admin-border pb-4">
        <div className="flex items-center gap-2.5">
          <span className="p-2 rounded-lg bg-admin-accent-soft border border-admin-accent/25">
            <Bell className="w-5 h-5 text-admin-accent" />
          </span>
          <div>
            <h2 className="text-base font-bold text-admin-fg">Edit In-App Notification</h2>
            <p className="text-xs text-admin-fg-muted">Update notification details and schedule</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-admin-fg-muted hover:text-admin-fg transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-4">
        {broadcast.totalDelivered > 0 && (
          <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/25 text-[11px] text-blue-400 leading-relaxed">
            <strong>Delivered Broadcast ({broadcast.totalDelivered} recipients):</strong> Saving edits will update this campaign record and automatically synchronize the updated title/body/CTA to all learner inboxes.
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-admin-fg">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-admin-surface-raised border border-admin-border rounded-lg text-admin-fg focus:outline-none focus:border-admin-accent"
            maxLength={150}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-admin-fg">Content / Body</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 text-xs bg-admin-surface-raised border border-admin-border rounded-lg text-admin-fg focus:outline-none focus:border-admin-accent resize-none"
            maxLength={2000}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-admin-fg">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as InAppCategory)}
              className="w-full px-2.5 py-1.5 text-xs bg-admin-surface-raised border border-admin-border rounded-lg text-admin-fg"
            >
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.icon} {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-admin-fg">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as InAppPriorityLevel)}
              className="w-full px-2.5 py-1.5 text-xs bg-admin-surface-raised border border-admin-border rounded-lg text-admin-fg"
            >
              {PRIORITIES.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-admin-fg flex items-center gap-1.5">
            <LinkIcon className="w-3.5 h-3.5 text-admin-accent" /> Action URL
          </label>
          <input
            type="text"
            value={actionUrl}
            onChange={(e) => setActionUrl(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-admin-surface-raised border border-admin-border rounded-lg text-admin-fg font-mono"
          />
        </div>

        {broadcast.status === 'scheduled' && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-admin-fg flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-admin-accent" /> Reschedule Date / Time
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-admin-surface-raised border border-admin-border rounded-lg text-admin-fg"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-admin-fg">Expiration Date</label>
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs bg-admin-surface-raised border border-admin-border rounded-lg text-admin-fg"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-admin-border">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-xs font-semibold text-admin-fg-muted hover:text-admin-fg transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={handleSave}
          className="px-5 py-2 text-xs font-bold rounded-lg bg-admin-accent text-admin-accent-fg hover:bg-admin-accent/90 transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <Save className="w-3.5 h-3.5" /> Save Changes
        </button>
      </div>
    </div>
  )
}

export function AdminEditInAppNotificationModal({
  open,
  onClose,
  broadcast,
  onUpdated,
}: AdminEditInAppNotificationModalProps) {
  if (!open || !broadcast) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <EditForm key={broadcast.id} broadcast={broadcast} onClose={onClose} onUpdated={onUpdated} />
    </div>
  )
}
