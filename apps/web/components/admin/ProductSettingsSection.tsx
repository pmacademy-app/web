'use client'

import React from 'react'
import { Shield, RotateCcw, Save } from 'lucide-react'
import { AdminSection } from './AdminSection'
import { AdminToggle } from './AdminToggle'
import { SettingRow } from './SettingRow'
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