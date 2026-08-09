'use client'

import React, { useState } from 'react'
import { Send, Loader2, Check } from 'lucide-react'

export interface SendTestEmailButtonProps {
  templateKey: string
  templateName: string
}

export function SendTestEmailButton({ templateKey, templateName }: SendTestEmailButtonProps) {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSendTest = async () => {
    const testEmail = prompt(`Enter email address to send test preview for template '${templateName}':`)
    if (!testEmail) return

    setLoading(true)
    setSuccess(false)

    try {
      const res = await fetch('/api/admin/emails/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateKey,
          toEmail: testEmail,
        }),
      })

      const data = await res.json()
      if (res.ok && data.success) {
        setSuccess(true)
        setTimeout(() => setSuccess(false), 3000)
      } else {
        alert(data.error || 'Failed to send test email.')
      }
    } catch {
      alert('Network error sending test email.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleSendTest}
      disabled={loading}
      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold border border-slate-700 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
      ) : success ? (
        <Check className="w-3 h-3 text-emerald-400" />
      ) : (
        <Send className="w-3 h-3 text-amber-400" />
      )}
      <span>{success ? 'Sent!' : 'Send Test'}</span>
    </button>
  )
}
