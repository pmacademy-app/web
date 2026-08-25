'use client'

import React, { useState } from 'react'
import { Send, AlertTriangle, CheckCircle2, X, ShieldAlert, Mail } from 'lucide-react'

export interface TargetUser {
  id: string
  name: string | null
  email: string
  email_confirmed_at?: string | null
}

interface SendProductionEmailModalProps {
  isOpen: boolean
  onClose: () => void
  targetUser: TargetUser
  onSuccess?: () => void
}

const PRODUCTION_TEMPLATES = [
  { key: 'auth.verify_email', label: 'Verification Email (auth.verify_email)', isCritical: true },
  { key: 'auth.welcome', label: 'Welcome Email (auth.welcome)', isCritical: false },
  { key: 'admin.direct_message', label: 'Custom Direct Message (admin.direct_message)', isCritical: false },
  { key: 'achievement.badge_earned', label: 'Badge Earned (achievement.badge_earned)', isCritical: false },
  { key: 'achievement.certificate', label: 'Certificate Issued (achievement.certificate)', isCritical: false },
  { key: 'achievement.level_up', label: 'Level Up (achievement.level_up)', isCritical: false },
  { key: 'achievement.portfolio_published', label: 'Portfolio Live (achievement.portfolio_published)', isCritical: false },
  { key: 'learning.module_complete', label: 'Module Complete (learning.module_complete)', isCritical: false },
  { key: 'learning.weekly_recap', label: 'Weekly Progress Recap (learning.weekly_recap)', isCritical: false },
]

export function SendProductionEmailModal({
  isOpen,
  onClose,
  targetUser,
  onSuccess,
}: SendProductionEmailModalProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<string>('auth.verify_email')
  const [customSubject, setCustomSubject] = useState<string>('')
  const [customMessageBody, setCustomMessageBody] = useState<string>('')
  const [customActionLabel, setCustomActionLabel] = useState<string>('')
  const [customActionUrl, setCustomActionUrl] = useState<string>('')
  const [confirmed, setConfirmed] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(false)
  const [resultMessage, setResultMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  if (!isOpen) return null

  const isVerified = Boolean(targetUser.email_confirmed_at)
  const selectedTemplateObj = PRODUCTION_TEMPLATES.find((t) => t.key === selectedTemplate)
  const isDirectMessage = selectedTemplate === 'admin.direct_message'
  const isDirectMessageValid = !isDirectMessage || (Boolean(customSubject.trim()) && Boolean(customMessageBody.trim()))

  const handleSend = async () => {
    if (!confirmed || loading || !isDirectMessageValid) return
    setLoading(true)
    setResultMessage(null)

    try {
      const customVariables: Record<string, unknown> = {}
      if (isDirectMessage) {
        customVariables.subject = customSubject.trim()
        customVariables.messageBody = customMessageBody.trim()
        if (customActionLabel.trim()) customVariables.actionLabel = customActionLabel.trim()
        if (customActionUrl.trim()) customVariables.actionUrl = customActionUrl.trim()
      }

      const res = await fetch('/api/admin/emails/production-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUserId: targetUser.id,
          templateKey: selectedTemplate,
          customVariables: Object.keys(customVariables).length > 0 ? customVariables : undefined,
        }),
      })

      const data = await res.json()

      if (res.ok && data.success) {
        setResultMessage({ type: 'success', text: data.message || 'Production email sent successfully!' })
        onSuccess?.()
      } else {
        setResultMessage({ type: 'error', text: data.error || 'Failed to dispatch production email.' })
      }
    } catch (err) {
      console.error('[SendProductionEmailModal] Network error:', err)
      setResultMessage({ type: 'error', text: 'Network exception occurred while connecting to Admin API.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-admin-surface border border-admin-border rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-5 relative">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-admin-border pb-4">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-1 rounded-full bg-admin-success-soft text-admin-success font-extrabold text-[11px] uppercase tracking-wider border border-admin-success/25">
              Production Email
            </span>
            <h3 className="text-base font-bold text-admin-fg">Send Real Learner Email</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-admin-fg-muted hover:text-admin-fg rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Warning Banner */}
        <div className="p-3.5 rounded-xl bg-admin-warning-soft border border-admin-warning/25 text-admin-warning text-xs flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Production Infrastructure Warning</p>
            <p className="mt-0.5 text-[11px] opacity-90">
              This action will dispatch a REAL email to <strong>{targetUser.email}</strong> via production Resend servers. Unlike Test Email, this affects real user accounts and logs in the audit trail.
            </p>
          </div>
        </div>

        {/* Target Learner Summary */}
        <div className="p-3.5 rounded-xl bg-admin-bg/60 border border-admin-border text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-admin-fg-muted">Recipient Name:</span>
            <span className="font-semibold text-admin-fg">{targetUser.name || 'Student Learner'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-admin-fg-muted">Recipient Email:</span>
            <span className="font-semibold text-admin-fg font-mono">{targetUser.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-admin-fg-muted">Verification Status:</span>
            <span className={`font-semibold ${isVerified ? 'text-admin-success' : 'text-admin-warning'}`}>
              {isVerified ? 'Verified Account' : 'Unverified Account'}
            </span>
          </div>
        </div>

        {/* Template Selection */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-admin-fg uppercase tracking-wider">
            Select Production Template
          </label>
          <select
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-admin-border bg-admin-surface text-admin-fg focus:outline-none focus:ring-2 focus:ring-admin-accent"
          >
            {PRODUCTION_TEMPLATES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
          {selectedTemplateObj?.isCritical && (
            <p className="text-[11px] text-admin-success flex items-center gap-1 font-medium">
              <ShieldAlert className="w-3.5 h-3.5" />
              Critical Auth Template: Bypasses optional automation toggles &amp; global pause.
            </p>
          )}
        </div>

        {/* Custom Direct Message Inputs */}
        {isDirectMessage && (
          <div className="space-y-3 p-3.5 rounded-xl bg-admin-bg/60 border border-admin-border animate-in fade-in duration-150">
            <div className="flex items-center gap-1.5 text-admin-accent text-xs font-bold uppercase tracking-wider">
              <Mail className="w-3.5 h-3.5" />
              Custom Message Content
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-admin-fg">
                Subject Line <span className="text-admin-danger">*</span>
              </label>
              <input
                type="text"
                value={customSubject}
                onChange={(e) => setCustomSubject(e.target.value)}
                placeholder="e.g. Important update regarding your Prodily course"
                className="w-full px-3 py-2 text-xs rounded-lg border border-admin-border bg-admin-surface text-admin-fg placeholder:text-admin-fg-subtle focus:outline-none focus:ring-2 focus:ring-admin-accent"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-admin-fg">
                Message Body <span className="text-admin-danger">*</span>
              </label>
              <textarea
                value={customMessageBody}
                onChange={(e) => setCustomMessageBody(e.target.value)}
                rows={4}
                placeholder="Write your direct administrative message to the learner. Separate paragraphs with double newlines."
                className="w-full px-3 py-2 text-xs rounded-lg border border-admin-border bg-admin-surface text-admin-fg placeholder:text-admin-fg-subtle focus:outline-none focus:ring-2 focus:ring-admin-accent resize-y"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-admin-fg">
                  Action Button Label <span className="text-admin-fg-subtle text-[10px]">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={customActionLabel}
                  onChange={(e) => setCustomActionLabel(e.target.value)}
                  placeholder="e.g. Go to Dashboard"
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-admin-border bg-admin-surface text-admin-fg placeholder:text-admin-fg-subtle focus:outline-none focus:ring-2 focus:ring-admin-accent"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-admin-fg">
                  Action URL <span className="text-admin-fg-subtle text-[10px]">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={customActionUrl}
                  onChange={(e) => setCustomActionUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-admin-border bg-admin-surface text-admin-fg placeholder:text-admin-fg-subtle focus:outline-none focus:ring-2 focus:ring-admin-accent"
                />
              </div>
            </div>
          </div>
        )}

        {/* Confirmation Checkbox */}
        <label className="flex items-start gap-2.5 text-xs text-admin-fg cursor-pointer select-none">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 rounded border-admin-border text-admin-success focus:ring-admin-success"
          />
          <span>
            I confirm that I want to send a production email to <strong>{targetUser.email}</strong>.
          </span>
        </label>

        {/* Result Message Banner */}
        {resultMessage && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
              resultMessage.type === 'success'
                ? 'bg-admin-success-soft text-admin-success border border-admin-success/25'
                : 'bg-admin-danger-soft text-admin-danger border border-admin-danger/25'
            }`}
          >
            {resultMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{resultMessage.text}</span>
          </div>
        )}

        {/* Modal Actions */}
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
            disabled={!confirmed || loading || !isDirectMessageValid}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-admin-success text-admin-fg hover:bg-admin-success/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            {loading ? 'Dispatching Email...' : 'Send Production Email'}
          </button>
        </div>
      </div>
    </div>
  )
}
