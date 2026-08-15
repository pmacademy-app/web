'use client'

import React from 'react'
import { Info, Shield, Globe } from 'lucide-react'
import { AdminPageHeader } from './AdminPageHeader'
import { AdminSection } from './AdminSection'
import { AdminToggle } from './AdminToggle'
import { SettingRow } from './SettingRow'
import { NumberInput } from './NumberInput'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ProductSettings } from '@/lib/admin/types'
import type { SettingsSectionKey } from '@/lib/admin/types'

interface ProductSettingsSectionProps {
  sectionKey: SettingsSectionKey
  data: ProductSettings
  onChange: (partial: Partial<ProductSettings>) => void
  onSave: () => void
  onReset: () => void
  isDirty: boolean
  isSaving: boolean
  initialData: ProductSettings
}

export function ProductSettingsSection({
  data,
  onChange,
  onSave,
  onReset,
  isDirty,
  isSaving,
}: ProductSettingsSectionProps) {
  const handleInputChange = (field: keyof ProductSettings, value: string | number | boolean) => {
    onChange({ [field]: value })
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Product Settings"
        description="General product identity and platform behavior configuration."
        icon={Info}
        iconColor="text-admin-info"
      />

      {/* General Group */}
      <AdminSection title="General" icon={Globe} meta="Core product identity">
        <SettingRow
          label="Site Name"
          description="Displayed in emails, browser title, and learner-facing pages."
        >
          <Input
            value={data.siteName}
            onChange={(e) => handleInputChange('siteName', e.target.value)}
            placeholder="Prodily"
            disabled={isSaving}
          />
        </SettingRow>

        <SettingRow
          label="Site Description"
          description="Brief description shown in meta tags and social previews."
        >
          <Input
            value={data.siteDescription}
            onChange={(e) => handleInputChange('siteDescription', e.target.value)}
            placeholder="Product Management Academy"
            disabled={isSaving}
          />
        </SettingRow>

        <SettingRow
          label="Contact Email"
          description="Support email shown to learners in help sections and automated emails."
        >
          <Input
            type="email"
            value={data.contactEmail}
            onChange={(e) => handleInputChange('contactEmail', e.target.value)}
            placeholder="support@prodily.app"
            disabled={isSaving}
          />
        </SettingRow>
      </AdminSection>

      {/* Platform Behavior Group */}
      <AdminSection title="Platform Behavior" icon={Shield} meta="Operational controls">
        <SettingRow
          label="Maintenance Mode"
          description="Disable all learner access. Admins can still access the admin panel."
        >
          <AdminToggle
            pressed={data.maintenanceMode}
            onPressedChange={(v) => handleInputChange('maintenanceMode', v)}
            disabled={isSaving}
            aria-label="Toggle maintenance mode"
          />
        </SettingRow>

        <SettingRow
          label="Allow Signups"
          description="Enable new learner registration on the platform."
        >
          <AdminToggle
            pressed={data.allowSignups}
            onPressedChange={(v) => handleInputChange('allowSignups', v)}
            disabled={isSaving}
            aria-label="Toggle allow signups"
          />
        </SettingRow>

        <SettingRow
          label="Require Email Verification"
          description="Users must verify their email address before accessing course content."
        >
          <AdminToggle
            pressed={data.requireEmailVerification}
            onPressedChange={(v) => handleInputChange('requireEmailVerification', v)}
            disabled={isSaving}
            aria-label="Toggle require email verification"
          />
        </SettingRow>

        <SettingRow
          label="Session Timeout (minutes)"
          description="Auto-logout users after this many minutes of inactivity. Minimum 5, maximum 10080 (7 days)."
        >
          <NumberInput
            value={data.sessionTimeoutMinutes}
            onChange={(e) => handleInputChange('sessionTimeoutMinutes', parseInt(e.target.value) || 5)}
            min={5}
            max={10080}
            step={5}
            disabled={isSaving}
            aria-describedby="session-timeout-desc"
          />
        </SettingRow>
      </AdminSection>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 border-t border-admin-border pt-4">
        <Button
          variant="outline"
          onClick={onReset}
          disabled={!isDirty || isSaving}
          aria-disabled={!isDirty || isSaving}
        >
          Reset
        </Button>
        <Button onClick={onSave} disabled={!isDirty || isSaving} aria-disabled={!isDirty || isSaving}>
          {isSaving ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>
    </div>
  )
}