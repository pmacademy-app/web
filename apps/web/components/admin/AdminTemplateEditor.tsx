'use client'

import React, { useMemo, useRef, useState } from 'react'
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
  AlertTriangle,
  PlusSquare,
} from 'lucide-react'
import { AdminStatusBadge } from './AdminStatusBadge'
import { AdminSendTestEmailModal } from './AdminSendTestEmailModal'
import { useAdminToast } from './admin-toast'
import { cn } from '@/lib/utils'
import type { AdminTemplateDetail } from '@/lib/admin/communications-service'
import { TEMPLATE_SAMPLE_VARIABLES, findUnknownVariables } from '@/lib/admin/template-variables'

interface AdminTemplateEditorProps {
  detail: AdminTemplateDetail
  initialMode?: 'code' | 'preview'
}

type ActiveField = 'subject' | 'body'

export function AdminTemplateEditor({ detail, initialMode = 'code' }: AdminTemplateEditorProps) {
  const { toast } = useAdminToast()
  const [mode, setMode] = useState<'code' | 'preview'>(initialMode)
  const [subject, setSubject] = useState(detail.subjectLine)
  const [body, setBody] = useState(detail.bodyHtml)
  const [copiedVar, setCopiedVar] = useState<string | null>(null)
  const [testOpen, setTestOpen] = useState(false)
  const [currentVersion, setCurrentVersion] = useState(detail.currentVersion || 1)
  const [versionStatus, setVersionStatus] = useState(detail.versionStatus || 'published')

  const subjectRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const [lastFocusedField, setLastFocusedField] = useState<ActiveField>('body')

  const knownVariableNames = useMemo(() => detail.variables.map((v) => v.name), [detail.variables])
  const unknownInSubject = useMemo(
    () => findUnknownVariables(subject, knownVariableNames),
    [subject, knownVariableNames]
  )
  const unknownInBody = useMemo(
    () => findUnknownVariables(body, knownVariableNames),
    [body, knownVariableNames]
  )

  const previewDoc = useMemo(() => {
    // Interpolate sample variables for live preview — same catalog used by
    // the server-side preview/test-send routes, so this preview never drifts.
    const rawContent = body || detail.bodyHtml || ''
    let interpolated = rawContent
    for (const [k, v] of Object.entries(TEMPLATE_SAMPLE_VARIABLES)) {
      interpolated = interpolated.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g'), String(v))
    }
    return interpolated
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

  const handleInsertVariable = (name: string) => {
    const token = `{{${name}}}`
    if (lastFocusedField === 'subject') {
      const el = subjectRef.current
      const start = el?.selectionStart ?? subject.length
      const end = el?.selectionEnd ?? subject.length
      const next = subject.slice(0, start) + token + subject.slice(end)
      setSubject(next)
      requestAnimationFrame(() => {
        el?.focus()
        el?.setSelectionRange(start + token.length, start + token.length)
      })
    } else {
      const el = bodyRef.current
      const start = el?.selectionStart ?? body.length
      const end = el?.selectionEnd ?? body.length
      const next = body.slice(0, start) + token + body.slice(end)
      setBody(next)
      requestAnimationFrame(() => {
        el?.focus()
        el?.setSelectionRange(start + token.length, start + token.length)
      })
    }
    toast(`Inserted {{${name}}}`, 'success')
  }

  const [isSaving, setIsSaving] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [isTogglingPause, setIsTogglingPause] = useState(false)
  const [isPaused, setIsPaused] = useState(Boolean(detail.isPaused))

  const handleReset = () => {
    setSubject(detail.subjectLine)
    setBody(detail.bodyHtml)
    toast('Restored the original template source.', 'info')
  }

  const handleSaveDraft = async () => {
    setIsSaving(true)
    try {
      const res = await fetch(`/api/admin/notifications/templates/${encodeURIComponent(detail.key)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectLine: subject,
          bodyHtml: body,
          bodyText: body.replace(/<[^>]+>/g, ''),
          status: 'draft',
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Failed to save draft')
      }

      if (json.data?.version) setCurrentVersion(json.data.version)
      setVersionStatus('draft')
      toast(json.message || 'Draft saved successfully.', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Save draft failed', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handlePublish = async () => {
    setIsPublishing(true)
    try {
      const res = await fetch(`/api/admin/notifications/templates/${encodeURIComponent(detail.key)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectLine: subject,
          bodyHtml: body,
          bodyText: body.replace(/<[^>]+>/g, ''),
          status: 'published',
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Failed to publish template')
      }

      if (json.data?.version) setCurrentVersion(json.data.version)
      setVersionStatus('published')
      toast(json.message || 'Template version published to production.', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Publish failed', 'error')
    } finally {
      setIsPublishing(false)
    }
  }

  const handleTogglePause = async () => {
    if (detail.isCritical) {
      toast('Critical authentication templates cannot be paused.', 'error')
      return
    }

    setIsTogglingPause(true)
    try {
      const targetPause = !isPaused
      const res = await fetch(`/api/admin/notifications/templates/${encodeURIComponent(detail.key)}/toggle-pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: targetPause }),
      })

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Failed to update template state')
      }

      setIsPaused(targetPause)
      toast(json.message || `Template ${targetPause ? 'paused' : 'resumed'}.`, 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update pause state', 'error')
    } finally {
      setIsTogglingPause(false)
    }
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
            <span className="px-2 py-0.5 rounded bg-admin-accent/10 text-admin-accent font-mono text-[10px] border border-admin-accent/20">
              v{currentVersion} ({versionStatus})
            </span>
            {isPaused ? (
              <AdminStatusBadge status="archived" label="Paused" />
            ) : detail.isDeferred ? (
              <AdminStatusBadge status="archived" label="Deferred" />
            ) : detail.isCritical ? (
              <AdminStatusBadge status="healthy" label="Always On" />
            ) : (
              <AdminStatusBadge status="published" label="Active" />
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {!detail.isCritical && (
            <button
              type="button"
              disabled={isTogglingPause}
              onClick={handleTogglePause}
              className="px-3 py-2 rounded-lg border border-admin-border text-xs font-semibold text-admin-fg-muted hover:text-admin-fg hover:bg-admin-surface-raised transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isPaused ? 'Resume Notification' : 'Pause Notification'}
            </button>
          )}
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
            disabled={isSaving}
            onClick={handleSaveDraft}
            className="px-3 py-2 rounded-lg border border-admin-accent/30 bg-admin-surface hover:bg-admin-surface-raised text-admin-fg text-xs font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5 text-admin-fg-muted" /> {isSaving ? 'Saving…' : 'Save Draft'}
          </button>
          <button
            type="button"
            disabled={isPublishing}
            onClick={handlePublish}
            className="px-3.5 py-2 rounded-lg bg-admin-accent hover:bg-admin-accent/90 text-admin-accent-fg text-xs font-bold transition-all inline-flex items-center gap-1.5 shadow-lg cursor-pointer disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" /> {isPublishing ? 'Publishing…' : 'Publish Version'}
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
              ref={subjectRef}
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              onFocus={() => setLastFocusedField('subject')}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-admin-border bg-admin-surface text-admin-fg placeholder:text-admin-fg-subtle focus:outline-none focus:ring-2 focus:ring-admin-accent"
            />
            {unknownInSubject.length > 0 && (
              <p className="flex items-center gap-1.5 text-[11px] text-admin-warning">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Unrecognized variable{unknownInSubject.length > 1 ? 's' : ''}:{' '}
                {unknownInSubject.map((n) => `{{${n}}}`).join(', ')}
              </p>
            )}
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
                ref={bodyRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onFocus={() => setLastFocusedField('body')}
                spellCheck={false}
                rows={26}
                className="w-full p-4 rounded-xl border border-admin-border bg-admin-bg text-admin-fg font-mono text-[11px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-admin-accent resize-y"
              />
              {unknownInBody.length > 0 && (
                <p className="flex items-center gap-1.5 text-[11px] text-admin-warning">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Unrecognized variable{unknownInBody.length > 1 ? 's' : ''}:{' '}
                  {unknownInBody.map((n) => `{{${n}}}`).join(', ')} — this won&apos;t be replaced when sent.
                </p>
              )}
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
              Templates support <strong>Save Draft</strong> and <strong>Publish Version</strong>. Published versions become active in production delivery with variable interpolation. Test Send dispatches the exact live editor content.
            </p>
          </div>
        </div>

        {/* Variables panel */}
        <aside className="space-y-3">
          <div className="p-4 rounded-xl bg-admin-surface border border-admin-border shadow-xl">
            <h2 className="text-xs font-bold text-admin-fg uppercase tracking-wider mb-3">Available Variables</h2>
            <p className="text-[11px] text-admin-fg-muted mb-3">
              Use <code className="font-mono text-admin-accent">{'{{variableName}}'}</code> syntax. Click{' '}
              <PlusSquare className="w-3 h-3 inline -mt-0.5 text-admin-accent" /> to insert at your cursor in the last
              focused field ({lastFocusedField === 'subject' ? 'Subject' : 'Body'}), or{' '}
              <Copy className="w-3 h-3 inline -mt-0.5" /> to copy.
            </p>
            <ul className="space-y-1.5 max-h-[480px] overflow-y-auto pr-1">
              {detail.variables.map((v) => (
                <li key={v.name}>
                  <div className="w-full text-left p-2 rounded-lg bg-admin-bg/60 border border-admin-border hover:border-admin-accent/40 hover:bg-admin-surface-raised transition-colors group">
                    <span className="flex items-center justify-between gap-2">
                      <code className="font-mono text-[11px] text-admin-accent font-semibold truncate">{`{{${v.name}}}`}</code>
                      <span className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleInsertVariable(v.name)}
                          title={`Insert {{${v.name}}} at cursor`}
                          aria-label={`Insert {{${v.name}}} at cursor`}
                          className="p-1 rounded hover:bg-admin-surface text-admin-fg-subtle hover:text-admin-accent transition-colors cursor-pointer"
                        >
                          <PlusSquare className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopyVariable(v.name)}
                          title={`Copy {{${v.name}}}`}
                          aria-label={`Copy {{${v.name}}}`}
                          className="p-1 rounded hover:bg-admin-surface text-admin-fg-subtle hover:text-admin-fg transition-colors cursor-pointer"
                        >
                          {copiedVar === v.name ? (
                            <Check className="w-3.5 h-3.5 text-admin-success" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </span>
                    </span>
                    <span className="block text-[10px] text-admin-fg-muted mt-0.5 truncate">{v.description}</span>
                  </div>
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
        subjectLine={subject}
        bodyHtml={body}
        bodyText={body.replace(/<[^>]+>/g, '')}
      />
    </div>
  )
}