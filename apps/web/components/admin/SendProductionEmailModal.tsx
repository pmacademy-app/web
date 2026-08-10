'use client'

import React, { useState } from 'react'
import { Send, AlertTriangle, CheckCircle2, X, ShieldAlert, Eye } from 'lucide-react'

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
  const [confirmed, setConfirmed] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(false)
  const [resultMessage, setResultMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showPreview, setShowPreview] = useState<boolean>(false)

  if (!isOpen) return null

  const isVerified = Boolean(targetUser.email_confirmed_at)
  const selectedTemplateObj = PRODUCTION_TEMPLATES.find((t) => t.key === selectedTemplate)

  const handleSend = async () => {
    if (!confirmed || loading) return
    setLoading(true)
    setResultMessage(null)

    try {
      const res = await fetch('/api/admin/emails/production-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUserId: targetUser.id,
          templateKey: selectedTemplate,
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
      <div className="bg-background border border-border rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 relative">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-extrabold text-[11px] uppercase tracking-wider border border-emerald-500/20">
              Production Email
            </span>
            <h3 className="text-base font-bold text-foreground">Send Real Learner Email</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Warning Banner */}
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Production Infrastructure Warning</p>
            <p className="mt-0.5 text-[11px] opacity-90">
              This action will dispatch a REAL email to <strong>{targetUser.email}</strong> via production Resend servers. Unlike Test Email, this affects real user accounts and logs in the audit trail.
            </p>
          </div>
        </div>

        {/* Target Learner Summary */}
        <div className="p-3.5 rounded-xl bg-card border border-border text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Recipient Name:</span>
            <span className="font-semibold text-foreground">{targetUser.name || 'Student Learner'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Recipient Email:</span>
            <span className="font-semibold text-foreground font-mono">{targetUser.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Verification Status:</span>
            <span className={`font-semibold ${isVerified ? 'text-emerald-600' : 'text-amber-600'}`}>
              {isVerified ? 'Verified Account' : 'Unverified Account'}
            </span>
          </div>
        </div>

        {/* Template Selection */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-foreground uppercase tracking-wider">
            Select Production Template
          </label>
          <select
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-input bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {PRODUCTION_TEMPLATES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
          {selectedTemplateObj?.isCritical && (
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
              <ShieldAlert className="w-3.5 h-3.5" />
              Critical Auth Template: Bypasses optional automation toggles &amp; global pause.
            </p>
          )}
        </div>

        {/* Confirmation Checkbox */}
        <label className="flex items-start gap-2.5 text-xs text-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 rounded border-border text-emerald-600 focus:ring-emerald-500"
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
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
                : 'bg-destructive/10 text-destructive border border-destructive/20'
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
        <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl border border-border text-foreground hover:bg-secondary/40 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={!confirmed || loading}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            {loading ? 'Dispatching Email...' : 'Send Production Email'}
          </button>
        </div>
      </div>
    </div>
  )
}
