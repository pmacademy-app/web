'use client'

import React from 'react'
import { Clock, Calendar, MessageSquare, RotateCcw, Save } from 'lucide-react'
import { AdminSection } from './AdminSection'
import { AdminToggle } from './AdminToggle'
import { SettingRow } from './SettingRow'
import { NumberInput } from './NumberInput'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { NotificationSettings } from '@/lib/admin/types'
import type { SettingsSectionKey } from '@/lib/admin/types'

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]

interface NotificationSettingsSectionProps {
  sectionKey: SettingsSectionKey
  data: NotificationSettings
  onChange: (partial: Partial<NotificationSettings>) => void
  onSave: () => void
  onReset: () => void
  isDirty: boolean
  isSaving: boolean
  initialData: NotificationSettings
}

export function NotificationSettingsSection({
  data,
  onChange,
  onSave,
  onReset,
  isDirty,
  isSaving,
}: NotificationSettingsSectionProps) {
  const handleInputChange = (field: keyof NotificationSettings, value: string | number | boolean) => {
    onChange({ [field]: value })
  }

  const handleTimeChange = (field: 'dailyReminderTime' | 'weeklyRecapTime', value: string) => {
    // Validate HH:MM format
    if (/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
      handleInputChange(field, value)
    }
  }

  return (
    <div className="space-y-6">
      {/* Reminders Group */}
      <AdminSection title="Reminders" icon={Clock} meta="Automated learner reminders">
        <SettingRow
          label="Daily Reminder Enabled"
          description="Send daily learning reminder notifications to inactive learners."
        >
          <AdminToggle
            pressed={data.dailyReminderEnabled}
            onPressedChange={(v) => handleInputChange('dailyReminderEnabled', v)}
            disabled={isSaving}
            aria-label="Toggle daily reminder"
          />
        </SettingRow>

        <SettingRow
          label="Daily Reminder Time"
          description="Time of day to send daily reminders (24-hour format, UTC)."
        >
          <input
            type="time"
            value={data.dailyReminderTime}
            onChange={(e) => handleTimeChange('dailyReminderTime', e.target.value)}
            disabled={isSaving || !data.dailyReminderEnabled}
            aria-disabled={isSaving || !data.dailyReminderEnabled}
            className="w-full px-3 py-2 text-sm text-admin-fg bg-admin-surface border border-admin-border rounded-lg placeholder:text-admin-fg-subtle focus:outline-none focus:ring-2 focus:ring-admin-accent/50 focus:border-admin-accent disabled:opacity-50 disabled:cursor-not-allowed hover:border-admin-border-strong transition-colors"
          />
        </SettingRow>

        <SettingRow
          label="Inactivity Reminder (days)"
          description="Days of inactivity before sending a reminder notification."
        >
          <NumberInput
            value={data.inactivityReminderDays}
            onChange={(e) => handleInputChange('inactivityReminderDays', parseInt(e.target.value) || 0)}
            min={1}
            max={90}
            step={1}
            disabled={isSaving}
          />
        </SettingRow>
      </AdminSection>

      {/* Weekly Recap Group */}
      <AdminSection title="Weekly Recap" icon={Calendar} meta="Weekly progress summary email">
        <SettingRow
          label="Weekly Recap Enabled"
          description="Send weekly progress summary emails to learners with activity."
        >
          <AdminToggle
            pressed={data.weeklyRecapEnabled}
            onPressedChange={(v) => handleInputChange('weeklyRecapEnabled', v)}
            disabled={isSaving}
            aria-label="Toggle weekly recap"
          />
        </SettingRow>

        <SettingRow
          label="Weekly Recap Day"
          description="Day of the week to send the recap email."
        >
          <Select
            value={String(data.weeklyRecapDay)}
            onValueChange={(v: string | null) => {
              if (v === null) return
              const parsed = parseInt(v, 10)
              if (!isNaN(parsed)) handleInputChange('weeklyRecapDay', parsed)
            }}
            disabled={isSaving || !data.weeklyRecapEnabled}
          >
            <SelectTrigger aria-label="Select weekly recap day" className="bg-admin-surface border-admin-border text-admin-fg">
              <SelectValue placeholder="Select day" />
            </SelectTrigger>
            <SelectContent className="bg-admin-surface-raised border-admin-border text-admin-fg">
              {DAYS_OF_WEEK.map((day) => (
                <SelectItem key={day.value} value={String(day.value)}>
                  {day.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow
          label="Weekly Recap Time"
          description="Time of day to send the weekly recap (24-hour format, UTC)."
        >
          <input
            type="time"
            value={data.weeklyRecapTime}
            onChange={(e) => handleTimeChange('weeklyRecapTime', e.target.value)}
            disabled={isSaving || !data.weeklyRecapEnabled}
            aria-disabled={isSaving || !data.weeklyRecapEnabled}
            className="w-full px-3 py-2 text-sm text-admin-fg bg-admin-surface border border-admin-border rounded-lg placeholder:text-admin-fg-subtle focus:outline-none focus:ring-2 focus:ring-admin-accent/50 focus:border-admin-accent disabled:opacity-50 disabled:cursor-not-allowed hover:border-admin-border-strong transition-colors"
          />
        </SettingRow>
      </AdminSection>

      {/* Defaults Group */}
      <AdminSection title="Default Preferences" icon={MessageSquare} meta="Default notification channels for new learners">
        <SettingRow
          label="Default In-App Notifications"
          description="Enable in-app notifications by default for new learners."
        >
          <AdminToggle
            pressed={data.defaultInAppEnabled}
            onPressedChange={(v) => handleInputChange('defaultInAppEnabled', v)}
            disabled={isSaving}
            aria-label="Toggle default in-app notifications"
          />
        </SettingRow>

        <SettingRow
          label="Default Email Notifications"
          description="Enable email notifications by default for new learners. Requires EMAIL_ENABLED feature flag."
        >
          <AdminToggle
            pressed={data.defaultEmailEnabled}
            onPressedChange={(v) => handleInputChange('defaultEmailEnabled', v)}
            disabled={isSaving}
            aria-label="Toggle default email notifications"
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