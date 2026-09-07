'use client'

import React from 'react'
import { Shield, RotateCcw, Key, Save } from 'lucide-react'
import { AdminSection } from './AdminSection'
import { AdminStatusBadge } from './AdminStatusBadge'
import { SettingRow } from './SettingRow'
import { NumberInput } from './NumberInput'
import type { EmailSettings } from '@/lib/admin/types'
import type { SettingsSectionKey } from '@/lib/admin/types'

interface EmailSettingsSectionProps {
  sectionKey: SettingsSectionKey
  data: EmailSettings
  onChange: (partial: Partial<EmailSettings>) => void
  onSave: () => void
  onReset: () => void
  isDirty: boolean
  isSaving: boolean
  initialData: EmailSettings
}

export function EmailSettingsSection({
  data,
  onChange,
  onSave,
  onReset,
  isDirty,
  isSaving,
}: EmailSettingsSectionProps) {
  const handleInputChange = (field: keyof EmailSettings, value: string | number | boolean) => {
    // Don't allow changing read-only field
    if (field === 'resendApiKeyConfigured') return
    onChange({ [field]: value })
  }

  return (
    <div className="space-y-6">
      {/* Limits — the only send limit the pipeline enforces. */}
      <AdminSection title="Send Limits" icon={Shield} meta="Enforced by the email queue">
        <SettingRow
          label="Daily Send Limit"
          description="Maximum non-critical emails the queue will dispatch per day. Verification and password-reset emails bypass this limit. Shared with the daily limit on the Communications workspace."
        >
          <NumberInput
            value={data.dailySendLimit}
            onChange={(e) => handleInputChange('dailySendLimit', parseInt(e.target.value) || 0)}
            min={10}
            max={1000}
            step={10}
            disabled={isSaving}
          />
        </SettingRow>
      </AdminSection>

      {/* Sender identity is environment configuration, not a setting. */}
      <AdminSection title="Sender & Providers" icon={Key} meta="Environment configuration (read-only)">
        <SettingRow
          label="Sender Identity"
          description="From name, sender address and reply-to come from BREVO_FROM_EMAIL / RESEND_FROM_EMAIL and the brand configuration. They are not editable here."
        >
          <span className="text-xs text-admin-fg-muted">Set in the deployment environment</span>
        </SettingRow>

        <SettingRow
          label="Resend API Key"
          description="Configured via RESEND_API_KEY environment variable. Cannot be changed here."
        >
          <div className="flex items-center gap-3">
            <AdminStatusBadge
              status={data.resendApiKeyConfigured ? 'healthy' : 'unhealthy'}
              label={data.resendApiKeyConfigured ? 'Configured' : 'Not Configured'}
            />
            <span className="text-xs text-admin-fg-muted">
              {data.resendApiKeyConfigured
                ? 'RESEND_API_KEY is set in environment'
                : 'Add RESEND_API_KEY to your deployment environment'}
            </span>
          </div>
        </SettingRow>
      </AdminSection>

      {/* Retry — only the backoff base is read by the queue. */}
      <AdminSection title="Retry Behavior" icon={RotateCcw} meta="Applied by the email queue processor">
        <SettingRow
          label="Retry Delay (minutes)"
          description="Base delay before a failed email is retried. The queue backs off exponentially from this value. The number of attempts is set per message priority, not globally."
        >
          <NumberInput
            value={data.retryDelayMinutes}
            onChange={(e) => handleInputChange('retryDelayMinutes', parseInt(e.target.value) || 0)}
            min={1}
            max={1440}
            step={5}
            disabled={isSaving}
          />
        </SettingRow>
      </AdminSection>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 border-t border-admin-border pt-4">
        <button
          type="button"
          onClick={onReset}
          disabled={!isDirty || isSaving}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-admin-border bg-admin-surface text-admin-fg-muted hover:text-admin-fg hover:bg-admin-surface-raised transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!isDirty || isSaving}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-admin-accent text-admin-bg hover:bg-admin-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
        >
          <Save className="w-3.5 h-3.5" />
          {isSaving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}