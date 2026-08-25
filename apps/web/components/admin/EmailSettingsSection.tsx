'use client'

import React from 'react'
import { Send, Shield, RotateCcw, Key, Save } from 'lucide-react'
import { AdminSection } from './AdminSection'
import { AdminToggle } from './AdminToggle'
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
      {/* Sending Group */}
      <AdminSection title="Sending Configuration" icon={Send} meta="Email sender identity">
        <SettingRow
          label="From Name"
          description="Display name shown in recipient's inbox."
        >
          <input
            type="text"
            value={data.fromName}
            onChange={(e) => handleInputChange('fromName', e.target.value)}
            placeholder="Prodily"
            disabled={isSaving}
            className="w-full px-3 py-2 text-sm text-admin-fg bg-admin-surface border border-admin-border rounded-lg placeholder:text-admin-fg-subtle focus:outline-none focus:ring-2 focus:ring-admin-accent/50 focus:border-admin-accent disabled:opacity-50 disabled:cursor-not-allowed hover:border-admin-border-strong transition-colors"
          />
        </SettingRow>

        <SettingRow
          label="From Email"
          description="Sender email address. Must be a verified domain in Resend."
        >
          <input
            type="email"
            value={data.fromEmail}
            onChange={(e) => handleInputChange('fromEmail', e.target.value)}
            placeholder="noreply@prodily.app"
            disabled={isSaving}
            className="w-full px-3 py-2 text-sm text-admin-fg bg-admin-surface border border-admin-border rounded-lg placeholder:text-admin-fg-subtle focus:outline-none focus:ring-2 focus:ring-admin-accent/50 focus:border-admin-accent disabled:opacity-50 disabled:cursor-not-allowed hover:border-admin-border-strong transition-colors"
          />
        </SettingRow>

        <SettingRow
          label="Reply-To Email"
          description="Email address for replies. Can be different from sender."
        >
          <input
            type="email"
            value={data.replyToEmail}
            onChange={(e) => handleInputChange('replyToEmail', e.target.value)}
            placeholder="support@prodily.app"
            disabled={isSaving}
            className="w-full px-3 py-2 text-sm text-admin-fg bg-admin-surface border border-admin-border rounded-lg placeholder:text-admin-fg-subtle focus:outline-none focus:ring-2 focus:ring-admin-accent/50 focus:border-admin-accent disabled:opacity-50 disabled:cursor-not-allowed hover:border-admin-border-strong transition-colors"
          />
        </SettingRow>
      </AdminSection>

      {/* Limits Group */}
      <AdminSection title="Daily & Hourly Limits" icon={Shield} meta="Rate limiting for email delivery">
        <SettingRow
          label="Daily Send Limit"
          description="Maximum emails sent per 24-hour period. Resend may enforce lower limits."
        >
          <NumberInput
            value={data.dailySendLimit}
            onChange={(e) => handleInputChange('dailySendLimit', parseInt(e.target.value) || 0)}
            min={1}
            max={100000}
            step={100}
            disabled={isSaving}
          />
        </SettingRow>

        <SettingRow
          label="Hourly Send Limit"
          description="Maximum emails sent per hour. Helps prevent burst sending."
        >
          <NumberInput
            value={data.hourlySendLimit}
            onChange={(e) => handleInputChange('hourlySendLimit', parseInt(e.target.value) || 0)}
            min={1}
            max={10000}
            step={10}
            disabled={isSaving}
          />
        </SettingRow>
      </AdminSection>

      {/* Sender Configuration Group */}
      <AdminSection title="Sender Configuration" icon={Key} meta="Resend API status (read-only)">
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

      {/* Automation Group */}
      <AdminSection title="Automation Behavior" icon={RotateCcw} meta="Failed email retry configuration">
        <SettingRow
          label="Retry Failed Emails"
          description="Automatically retry emails that fail to send."
        >
          <AdminToggle
            pressed={data.retryFailedEmails}
            onPressedChange={(v) => handleInputChange('retryFailedEmails', v)}
            disabled={isSaving}
            aria-label="Toggle retry failed emails"
          />
        </SettingRow>

        <SettingRow
          label="Max Retry Attempts"
          description="Maximum number of retry attempts before marking as permanently failed."
        >
          <NumberInput
            value={data.maxRetryAttempts}
            onChange={(e) => handleInputChange('maxRetryAttempts', parseInt(e.target.value) || 0)}
            min={1}
            max={10}
            step={1}
            disabled={isSaving || !data.retryFailedEmails}
            aria-disabled={isSaving || !data.retryFailedEmails}
          />
        </SettingRow>

        <SettingRow
          label="Retry Delay (minutes)"
          description="Minutes to wait between retry attempts."
        >
          <NumberInput
            value={data.retryDelayMinutes}
            onChange={(e) => handleInputChange('retryDelayMinutes', parseInt(e.target.value) || 0)}
            min={1}
            max={1440}
            step={5}
            disabled={isSaving || !data.retryFailedEmails}
            aria-disabled={isSaving || !data.retryFailedEmails}
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