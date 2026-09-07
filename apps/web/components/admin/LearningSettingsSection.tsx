'use client'

import React from 'react'
import { Zap, RotateCcw, Save } from 'lucide-react'
import { AdminSection } from './AdminSection'
import { SettingRow } from './SettingRow'
import { NumberInput } from './NumberInput'
import type { LearningSettings } from '@/lib/admin/types'
import type { SettingsSectionKey } from '@/lib/admin/types'

interface LearningSettingsSectionProps {
  sectionKey: SettingsSectionKey
  data: LearningSettings
  onChange: (partial: Partial<LearningSettings>) => void
  onSave: () => void
  onReset: () => void
  isDirty: boolean
  isSaving: boolean
  initialData: LearningSettings
}

export function LearningSettingsSection({
  data,
  onChange,
  onSave,
  onReset,
  isDirty,
  isSaving,
}: LearningSettingsSectionProps) {
  const handleInputChange = (field: keyof LearningSettings, value: string | number | boolean | null) => {
    onChange({ [field]: value })
  }

  return (
    <div className="space-y-6">
      {/* XP Group */}
      <AdminSection title="XP Rewards" icon={Zap} meta="Experience points for learning activities">
        <SettingRow
          label="XP per Lesson Complete"
          description="XP awarded when a learner completes a lesson."
        >
          <NumberInput
            value={data.xpPerLessonComplete}
            onChange={(e) => handleInputChange('xpPerLessonComplete', parseInt(e.target.value) || 0)}
            min={0}
            max={1000}
            step={5}
            disabled={isSaving}
          />
        </SettingRow>

        <SettingRow
          label="XP per Quiz Pass"
          description="XP awarded when a learner passes a quiz."
        >
          <NumberInput
            value={data.xpPerQuizPass}
            onChange={(e) => handleInputChange('xpPerQuizPass', parseInt(e.target.value) || 0)}
            min={0}
            max={1000}
            step={5}
            disabled={isSaving}
          />
        </SettingRow>

        <SettingRow
          label="XP per Flashcard Review"
          description="XP awarded for each flashcard review (SRS)."
        >
          <NumberInput
            value={data.xpPerFlashcardReview}
            onChange={(e) => handleInputChange('xpPerFlashcardReview', parseInt(e.target.value) || 0)}
            min={0}
            max={100}
            step={1}
            disabled={isSaving}
          />
        </SettingRow>

        <SettingRow
          label="XP per Reflection"
          description="XP awarded when a learner submits a reflection."
        >
          <NumberInput
            value={data.xpPerReflection}
            onChange={(e) => handleInputChange('xpPerReflection', parseInt(e.target.value) || 0)}
            min={0}
            max={500}
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