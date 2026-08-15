'use client'

import React, { useState } from 'react'
import { Send } from 'lucide-react'
import { AdminSendTestEmailModal } from './AdminSendTestEmailModal'

export interface SendTestEmailButtonProps {
  templateKey: string
  templateName: string
}

/**
 * Button that opens the send-test-email modal (spec §6.5).
 * Replaces the legacy `prompt()`-based flow.
 */
export function SendTestEmailButton({ templateKey, templateName }: SendTestEmailButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-2.5 py-1 rounded bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-fg text-[11px] font-semibold border border-admin-border transition-colors inline-flex items-center gap-1.5 cursor-pointer"
      >
        <Send className="w-3 h-3 text-admin-accent" />
        <span>Send Test</span>
      </button>
      <AdminSendTestEmailModal
        open={open}
        onClose={() => setOpen(false)}
        templateKey={templateKey}
        templateName={templateName}
      />
    </>
  )
}