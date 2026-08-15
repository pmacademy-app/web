'use client'

import React, { useState } from 'react'
import { Send, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { AdminModal } from './AdminModal'
import { useAdminToast } from './admin-toast'

export interface AdminSendTestEmailModalProps {
  open: boolean
  onClose: () => void
  templateKey: string
  templateName: string
}

/**
 * Send-test-email modal (spec §6.5). Replaces the legacy `prompt()`-based
 * flow with a proper accessible dialog backed by POST /api/admin/emails/test-send.
 */
export function AdminSendTestEmailModal({
  open,
  onClose,
  templateKey,
  templateName,
}: AdminSendTestEmailModalProps) {
  const { toast } = useAdminToast()
  const [toEmail, setToEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleSend = async () => {
    if (!toEmail.includes('@') || loading) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/emails/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateKey, toEmail: toEmail.trim() }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setResult({ type: 'success', text: data.message || `Test email sent to ${toEmail}.` })
        toast(`Test email sent to ${toEmail}.`, 'success')
      } else {
        setResult({ type: 'error', text: data.error || 'Failed to send test email.' })
      }
    } catch {
      setResult({ type: 'error', text: 'Network error sending test email.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title="Send Test Email"
      description={
        templateName
          ? `Template: ${templateKey} · ${templateName}`
          : `Template: ${templateKey}`
      }
    >
      <div className="space-y-2">
        <label htmlFor="test-recipient" className="block text-xs font-semibold text-admin-fg uppercase tracking-wider">
          Recipient
        </label>
        <input
          id="test-recipient"
          type="email"
          value={toEmail}
          onChange={(e) => setToEmail(e.target.value)}
          placeholder="admin@example.com"
          autoComplete="email"
          className="w-full px-3 py-2 text-xs rounded-xl border border-admin-border bg-admin-surface text-admin-fg placeholder:text-admin-fg-subtle focus:outline-none focus:ring-2 focus:ring-admin-accent"
        />
        <p className="text-[11px] text-admin-fg-muted">
          Uses sample data for template variables. The subject is prefixed with [ADMIN TEST].
        </p>
      </div>

      {result && (
        <div
          role="status"
          className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
            result.type === 'success'
              ? 'bg-admin-success-soft text-admin-success border border-admin-success/25'
              : 'bg-admin-danger-soft text-admin-danger border border-admin-danger/25'
          }`}
        >
          {result.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{result.text}</span>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 border-t border-admin-border pt-4">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-xs font-semibold rounded-xl border border-admin-border text-admin-fg hover:bg-admin-surface-raised transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSend}
          disabled={!toEmail.includes('@') || loading}
          className="px-4 py-2 text-xs font-bold rounded-xl bg-admin-accent text-admin-accent-fg hover:bg-admin-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 cursor-pointer"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          {loading ? 'Sending…' : 'Send Test'}
        </button>
      </div>
    </AdminModal>
  )
}