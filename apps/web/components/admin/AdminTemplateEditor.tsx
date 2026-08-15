'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Code2,
  Eye,
  Save,
  Send,
  Copy,
  Check,
  FileCode,
  Info,
  RotateCcw,
} from 'lucide-react'
import { AdminStatusBadge } from './AdminStatusBadge'
import { AdminSendTestEmailModal } from './AdminSendTestEmailModal'
import { useAdminToast } from './admin-toast'
import { cn } from '@/lib/utils'
import type { AdminTemplateDetail } from '@/lib/admin/communications-service'

interface AdminTemplateEditorProps {
  detail: AdminTemplateDetail
  initialMode?: 'code' | 'preview'
}

export function AdminTemplateEditor({ detail, initialMode = 'code' }: AdminTemplateEditorProps) {
  const { toast } = useAdminToast()
  const [mode, setMode] = useState<'code' | 'preview'>(initialMode)
  const [subject, setSubject] = useState(detail.subjectLine)
  const [body, setBody] = useState(detail.bodyHtml)
  const [copiedVar, setCopiedVar] = useState<string | null>(null)
  const [testOpen, setTestOpen] = useState(false)

  const previewDoc = useMemo(() => {
    // If the admin edited the body, preview their draft; otherwise the rendered template.
    return body || detail.bodyHtml
  }, [body, detail.bodyHtml])

  const handleCopyVariable = async (name: string) => {
    const token = `{{${name}}}`
    try {
      await navigator.clipboard.writeText(token)
      setCopiedVar(name)
      toast(`Copied {{${name}}}`, 'success')
      setTimeout(() => setCopiedVar(null), 2000)
    } catch {
      toast('Could not copy to clipboard.', 'error')
    }
  }

  const handleReset = () => {
    setSubject(detail.subjectLine)
    setBody(detail.bodyHtml)
    toast('Restored the original template source.', 'info')
  }

  const handleSave = () => {
    toast('Templates are managed in code (apps/web/emails/templates). Edits here are preview-only.', 'info')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-admin-border pb-5">
        <div className="space-y-1.5">
          <Link
            href="/admin/communications?tab=templates"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-admin-fg-muted hover:text-admin-fg transition-colors"
          >
            <ArrowLeft className="w-3 h-3" /> Back to templates
          </Link>
          <h1 className="text-2xl font-bold text-admin-fg tracking-tight flex items-center gap-2.5">
            <span className="p-1.5 rounded-lg bg-admin-accent-soft border border-admin-accent/25">
              <FileCode className="w-5 h-5 text-admin-accent" />
            </span>
            <span>{detail.name}</span>
          </h1>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[11px] text-admin-accent font-semibold">{detail.key}</span>
            <span className="px-2 py-0.5 rounded bg-admin-surface-raised text-admin-fg-muted font-mono text-[10px] border border-admin-border uppercase tracking-wider">
              {detail.category}
            </span>
            {detail.isDeferred ? (
              <AdminStatusBadge status="archived" label="Deferred" />
            ) : detail.isCritical ? (
              <AdminStatusBadge status="healthy" label="Always On" />
            ) : (
              <AdminStatusBadge status="published" label="Active" />
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-2 rounded-lg border border-admin-border text-xs font-semibold text-admin-fg-muted hover:text-admin-fg hover:bg-admin-surface-raised transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
          <button
            type="button"
            onClick={() => setTestOpen(true)}
            className="px-3 py-2 rounded-lg border border-admin-border text-xs font-semibold text-admin-fg hover:bg-admin-surface-raised transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5 text-admin-accent" /> Send Test
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-3.5 py-2 rounded-lg bg-admin-accent hover:bg-admin-accent/90 text-admin-accent-fg text-xs font-bold transition-all inline-flex items-center gap-1.5 shadow-lg cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" /> Save
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-6">
        {/* Editor column */}
        <div className="space-y-5 min-w-0">
          {/* Subject */}
          <div className="space-y-2">
            <label htmlFor="template-subject" className="block text-xs font-bold text-admin-fg uppercase tracking-wider">
              Subject
            </label>
            <input
              id="template-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-admin-border bg-admin-surface text-admin-fg placeholder:text-admin-fg-subtle focus:outline-none focus:ring-2 focus:ring-admin-accent"
            />
          </div>

          {/* Mode toggle */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-admin-bg/60 border border-admin-border w-fit" role="tablist" aria-label="Editor mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'code'}
              onClick={() => setMode('code')}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer',
                mode === 'code'
                  ? 'bg-admin-accent text-admin-accent-contrast'
                  : 'text-admin-fg-muted hover:text-admin-fg hover:bg-admin-surface-raised'
              )}
            >
              <Code2 className="w-3.5 h-3.5" /> Code
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'preview'}
              onClick={() => setMode('preview')}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer',
                mode === 'preview'
                  ? 'bg-admin-accent text-admin-accent-contrast'
                  : 'text-admin-fg-muted hover:text-admin-fg hover:bg-admin-surface-raised'
              )}
            >
              <Eye className="w-3.5 h-3.5" /> Preview
            </button>
          </div>

          {/* Body editor / preview */}
          {mode === 'code' ? (
            <div className="space-y-2">
              <label htmlFor="template-body" className="block text-xs font-bold text-admin-fg uppercase tracking-wider">
                Email Body (HTML)
              </label>
              <textarea
                id="template-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                spellCheck={false}
                rows={26}
                className="w-full p-4 rounded-xl border border-admin-border bg-admin-bg text-admin-fg font-mono text-[11px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-admin-accent resize-y"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-admin-fg uppercase tracking-wider">
                  Live Preview
                </label>
                <span className="text-[11px] font-mono text-admin-fg-muted">{subject}</span>
              </div>
              <div className="rounded-xl border border-admin-border overflow-hidden bg-white">
                <iframe
                  title={`Preview of ${detail.key}`}
                  srcDoc={previewDoc}
                  sandbox=""
                  className="w-full h-[560px] bg-white"
                />
              </div>
            </div>
          )}

          <div className="p-3 rounded-xl bg-admin-info-soft border border-admin-info/25 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-admin-info shrink-0 mt-0.5" />
            <p className="text-[11px] text-admin-fg leading-relaxed">
              Templates are source-controlled React components in <code className="font-mono">apps/web/emails/templates</code>.
              Subject and body edits here are preview-only — test sends always use the production template source.
            </p>
          </div>
        </div>

        {/* Variables panel */}
        <aside className="space-y-3">
          <div className="p-4 rounded-xl bg-admin-surface border border-admin-border shadow-xl">
            <h2 className="text-xs font-bold text-admin-fg uppercase tracking-wider mb-3">Available Variables</h2>
            <p className="text-[11px] text-admin-fg-muted mb-3">
              Click a variable to copy it into the subject or body.
            </p>
            <ul className="space-y-1.5 max-h-[480px] overflow-y-auto pr-1">
              {detail.variables.map((v) => (
                <li key={v.name}>
                  <button
                    type="button"
                    onClick={() => handleCopyVariable(v.name)}
                    className="w-full text-left p-2 rounded-lg bg-admin-bg/60 border border-admin-border hover:border-admin-accent/40 hover:bg-admin-surface-raised transition-colors group cursor-pointer"
                    title={`Copy {{${v.name}}}`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <code className="font-mono text-[11px] text-admin-accent font-semibold">{`{{${v.name}}}`}</code>
                      {copiedVar === v.name ? (
                        <Check className="w-3 h-3 text-admin-success" />
                      ) : (
                        <Copy className="w-3 h-3 text-admin-fg-subtle opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </span>
                    <span className="block text-[10px] text-admin-fg-muted mt-0.5 truncate">{v.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      <AdminSendTestEmailModal
        open={testOpen}
        onClose={() => setTestOpen(false)}
        templateKey={detail.key}
        templateName={detail.name}
      />
    </div>
  )
}