'use client'

import React, { useState } from 'react'
import { X, Plus, FileCode } from 'lucide-react'
import { useAdminToast } from './admin-toast'

interface AdminCreateTemplateModalProps {
  open: boolean
  onClose: () => void
  onCreated?: () => void
}

export function AdminCreateTemplateModal({ open, onClose, onCreated }: AdminCreateTemplateModalProps) {
  const { toast } = useAdminToast()
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('Custom')
  const [subjectLine, setSubjectLine] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!key.trim() || !subjectLine.trim() || !bodyText.trim()) {
      toast('Please fill in key, subject line, and body text.', 'error')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/admin/notifications/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: key.trim(),
          name: name.trim() || key.trim(),
          category: category.trim(),
          subjectLine: subjectLine.trim(),
          bodyText: bodyText.trim(),
          bodyHtml: `<p>${bodyText.trim().replace(/\n/g, '<br/>')}</p>`,
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Failed to create template')
      }

      toast(json.message || 'Template created successfully!', 'success')
      onClose()
      onCreated?.()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Creation failed', 'error')
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
              <FileCode className="w-5 h-5 text-admin-accent" />
            </span>
            <div>
              <h2 className="text-base font-bold text-admin-fg">Create Notification Template</h2>
              <p className="text-xs text-admin-fg-muted">Register a new custom notification template</p>
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-admin-fg">Template Key</label>
              <input
                type="text"
                required
                placeholder="e.g. cohort.launch_alert"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-admin-border bg-admin-bg text-admin-fg placeholder:text-admin-fg-subtle focus:outline-none focus:ring-2 focus:ring-admin-accent"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-admin-fg">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-admin-border bg-admin-bg text-admin-fg focus:outline-none focus:ring-2 focus:ring-admin-accent"
              >
                <option value="Custom">Custom</option>
                <option value="Transactional">Transactional</option>
                <option value="Scheduled">Scheduled</option>
                <option value="Announcement">Announcement</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-admin-fg">Display Name</label>
            <input
              type="text"
              placeholder="e.g. Cohort Launch Announcement"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-admin-border bg-admin-bg text-admin-fg placeholder:text-admin-fg-subtle focus:outline-none focus:ring-2 focus:ring-admin-accent"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-admin-fg">Subject Line</label>
            <input
              type="text"
              required
              placeholder="e.g. Important: Your cohort starts tomorrow!"
              value={subjectLine}
              onChange={(e) => setSubjectLine(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-admin-border bg-admin-bg text-admin-fg placeholder:text-admin-fg-subtle focus:outline-none focus:ring-2 focus:ring-admin-accent"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-admin-fg">Template Body (Text / Markdown)</label>
            <textarea
              required
              rows={4}
              placeholder="Write the notification message content..."
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-admin-border bg-admin-bg text-admin-fg placeholder:text-admin-fg-subtle focus:outline-none focus:ring-2 focus:ring-admin-accent font-mono"
            />
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
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-bold text-admin-accent-contrast bg-admin-accent hover:bg-admin-accent/90 rounded-lg inline-flex items-center gap-1.5 shadow-lg cursor-pointer disabled:opacity-50 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              {isSubmitting ? 'Creating…' : 'Create Template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
