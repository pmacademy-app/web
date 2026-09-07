'use client'

import React, { useMemo, useRef, useState } from 'react'
import { X, Plus, FileCode, Code2, Eye, AlertTriangle } from 'lucide-react'
import { useAdminToast } from './admin-toast'
import { cn } from '@/lib/utils'
import { TEMPLATE_SAMPLE_VARIABLES, TEMPLATE_VARIABLE_CATALOG, findUnknownVariables } from '@/lib/admin/template-variables'

interface AdminCreateTemplateModalProps {
  open: boolean
  onClose: () => void
  onCreated?: () => void
}

/**
 * Creates a new HTML EMAIL template (kept separate from in-app notification
 * content). Admin pastes raw HTML directly; the server sanitizes it before
 * persisting (see /api/admin/notifications/templates and
 * lib/admin/sanitize-email-html.ts). The preview here uses the same fully
 * sandboxed iframe pattern as the template editor and broadcast wizard.
 */
export function AdminCreateTemplateModal({ open, onClose, onCreated }: AdminCreateTemplateModalProps) {
  const { toast } = useAdminToast()
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('Custom')
  const [subjectLine, setSubjectLine] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [mode, setMode] = useState<'code' | 'preview'>('code')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const knownVariableNames = useMemo(() => TEMPLATE_VARIABLE_CATALOG.map((v) => v.name), [])
  const unknownVariables = useMemo(
    () => findUnknownVariables(bodyHtml, knownVariableNames),
    [bodyHtml, knownVariableNames]
  )
  const previewHtml = useMemo(() => {
    let interpolated = bodyHtml
    for (const [k, v] of Object.entries(TEMPLATE_SAMPLE_VARIABLES)) {
      interpolated = interpolated.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g'), String(v))
    }
    return interpolated
  }, [bodyHtml])

  const handleInsertVariable = (name: string) => {
    if (!name) return
    const token = `{{${name}}}`
    const el = bodyRef.current
    const start = el?.selectionStart ?? bodyHtml.length
    const end = el?.selectionEnd ?? bodyHtml.length
    const next = bodyHtml.slice(0, start) + token + bodyHtml.slice(end)
    setBodyHtml(next)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + token.length, start + token.length)
    })
  }

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!key.trim() || !subjectLine.trim() || !bodyHtml.trim()) {
      toast('Please fill in key, subject line, and HTML body.', 'error')
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
          bodyHtml: bodyHtml.trim(),
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Failed to create template')
      }

      toast(json.message || 'Email template created successfully!', 'success')
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
      <div className="bg-admin-surface border border-admin-border rounded-xl max-w-2xl w-full p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-admin-border pb-4">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-lg bg-admin-accent-soft border border-admin-accent/25">
              <FileCode className="w-5 h-5 text-admin-accent" />
            </span>
            <div>
              <h2 className="text-base font-bold text-admin-fg">Create Email Template</h2>
              <p className="text-xs text-admin-fg-muted">
                Paste HTML for a new broadcast email template (separate from in-app notifications)
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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-admin-fg">Email Body (HTML)</label>
              <div className="flex items-center gap-2">
                <select
                  value=""
                  onChange={(e) => handleInsertVariable(e.target.value)}
                  className="px-2 py-1 text-[11px] rounded-lg border border-admin-border bg-admin-bg text-admin-fg-muted focus:outline-none focus:ring-2 focus:ring-admin-accent cursor-pointer"
                  title="Insert a variable at the cursor position"
                >
                  <option value="">+ Insert Variable</option>
                  {TEMPLATE_VARIABLE_CATALOG.map((v) => (
                    <option key={v.name} value={v.name}>
                      {`{{${v.name}}}`} — {v.description}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1 p-1 rounded-lg bg-admin-bg/60 border border-admin-border">
                <button
                  type="button"
                  onClick={() => setMode('code')}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer',
                    mode === 'code' ? 'bg-admin-accent text-admin-accent-contrast' : 'text-admin-fg-muted hover:text-admin-fg'
                  )}
                >
                  <Code2 className="w-3 h-3" /> Code
                </button>
                <button
                  type="button"
                  onClick={() => setMode('preview')}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer',
                    mode === 'preview' ? 'bg-admin-accent text-admin-accent-contrast' : 'text-admin-fg-muted hover:text-admin-fg'
                  )}
                >
                  <Eye className="w-3 h-3" /> Preview
                </button>
                </div>
              </div>
            </div>

            {mode === 'code' ? (
              <textarea
                required
                ref={bodyRef}
                rows={10}
                spellCheck={false}
                placeholder="<html>...</html> or an HTML fragment. Use {{variableName}} to insert dynamic content."
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                className="w-full px-3 py-2 text-[11px] font-mono leading-relaxed rounded-lg border border-admin-border bg-admin-bg text-admin-fg placeholder:text-admin-fg-subtle focus:outline-none focus:ring-2 focus:ring-admin-accent resize-y"
              />
            ) : (
              <div className="rounded-lg border border-admin-border overflow-hidden bg-white">
                <iframe
                  title="Template HTML preview"
                  srcDoc={previewHtml}
                  sandbox=""
                  className="w-full h-64 bg-white"
                />
              </div>
            )}
            {unknownVariables.length > 0 && (
              <p className="flex items-center gap-1.5 text-[11px] text-admin-warning">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Unrecognized variable{unknownVariables.length > 1 ? 's' : ''}:{' '}
                {unknownVariables.map((n) => `{{${n}}}`).join(', ')} — this won&apos;t be replaced when sent.
              </p>
            )}
            <p className="text-[11px] text-admin-fg-muted">
              HTML is sanitized on save (scripts, embeds, and dangerous attributes are stripped). Preview interpolates sample values and is fully sandboxed.
            </p>
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
