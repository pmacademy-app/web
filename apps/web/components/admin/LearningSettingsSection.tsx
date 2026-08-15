'use client'

import React from 'react'
import { Target, Zap, Award, Brain, CheckCircle } from 'lucide-react'
import { AdminPageHeader } from './AdminPageHeader'
import { AdminSection } from './AdminSection'
import { AdminToggle } from './AdminToggle'
import { SettingRow } from './SettingRow'
import { NumberInput } from './NumberInput'
import { Button } from '@/components/ui/button'
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
      <AdminPageHeader
        title="Learning Settings"
        description="Configure XP rewards, streaks, certificates, and learning behavior."
        icon={Target}
        iconColor="text-admin-accent"
      />

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

      {/* Streaks Group */}
      <AdminSection title="Streaks" icon={Award} meta="Streak configuration and freeze options">
        <SettingRow
          label="Enable Streak Freeze"
          description="Allow learners to use XP to protect their streak for one day."
        >
          <AdminToggle
            pressed={data.streakFreezeEnabled}
            onPressedChange={(v) => handleInputChange('streakFreezeEnabled', v)}
            disabled={isSaving}
            aria-label="Toggle streak freeze"
          />
        </SettingRow>

        <SettingRow
          label="Streak Freeze Cost (XP)"
          description="XP cost to activate a streak freeze. Only applies when streak freeze is enabled."
        >
          <NumberInput
            value={data.streakFreezeCostXp}
            onChange={(e) => handleInputChange('streakFreezeCostXp', parseInt(e.target.value) || 0)}
            min={0}
            max={5000}
            step={50}
            disabled={isSaving || !data.streakFreezeEnabled}
            aria-disabled={isSaving || !data.streakFreezeEnabled}
          />
        </SettingRow>
      </AdminSection>

      {/* Certificates Group */}
      <AdminSection title="Certificates" icon={CheckCircle} meta="Certificate issuance and expiry settings">
        <SettingRow
          label="Auto-Issue Certificates"
          description="Automatically issue certificates when learners complete all requirements."
        >
          <AdminToggle
            pressed={data.certificateAutoIssue}
            onPressedChange={(v) => handleInputChange('certificateAutoIssue', v)}
            disabled={isSaving}
            aria-label="Toggle auto-issue certificates"
          />
        </SettingRow>

        <SettingRow
          label="Certificate Expiry (days)"
          description="Number of days after which certificates expire. Leave empty for no expiry."
        >
          <NumberInput
            value={data.certificateExpiryDays ?? ''}
            onChange={(e) => {
              const val = e.target.value
              handleInputChange('certificateExpiryDays', val === '' ? null : parseInt(val) || null)
            }}
            min={1}
            max={3650}
            step={1}
            placeholder="No expiry"
            disabled={isSaving}
          />
        </SettingRow>
      </AdminSection>

      {/* Learning Behavior Group */}
      <AdminSection title="Learning Behavior" icon={Brain} meta="Core learning progression rules">
        <SettingRow
          label="Lesson Completion Required for Progress"
          description="Require learners to complete lessons in order to progress through modules."
        >
          <AdminToggle
            pressed={data.lessonCompletionRequiredForProgress}
            onPressedChange={(v) => handleInputChange('lessonCompletionRequiredForProgress', v)}
            disabled={isSaving}
            aria-label="Toggle lesson completion required"
          />
        </SettingRow>

        <SettingRow
          label="Quiz Pass Threshold (%)"
          description="Minimum percentage score required to pass a quiz."
        >
          <NumberInput
            value={data.quizPassThreshold}
            onChange={(e) => handleInputChange('quizPassThreshold', parseInt(e.target.value) || 0)}
            min={0}
            max={100}
            step={1}
            disabled={isSaving}
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