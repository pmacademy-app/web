'use client'

import React, { useState } from 'react'
import { Send, Loader2, Check } from 'lucide-react'
import { useAdminToast } from '@/components/admin/admin-toast'

export interface SendTestEmailButtonProps {
  templateKey: string
  templateName: string
}

export function SendTestEmailButton({ templateKey, templateName }: SendTestEmailButtonProps) {
  const { toast } = useAdminToast()
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
        toast(`Test email sent to ${testEmail}.`, 'success')
        setTimeout(() => setSuccess(false), 3000)
      } else {
        toast(data.error || 'Failed to send test email.', 'error')
      }
    } catch {
      toast('Network error sending test email.', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleSendTest}
      disabled={loading}
      className="px-2.5 py-1 rounded bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-fg text-[11px] font-semibold border border-admin-border transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="w-3 h-3 animate-spin text-admin-accent" />
      ) : success ? (
        <Check className="w-3 h-3 text-admin-success" />
      ) : (
        <Send className="w-3 h-3 text-admin-accent" />
      )}
      <span>{success ? 'Sent!' : 'Send Test'}</span>
    </button>
  )
}
