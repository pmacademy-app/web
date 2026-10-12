'use client'

import React, { useState } from 'react'
import { Zap, RotateCcw, Save, Info } from 'lucide-react'
import { AdminSection } from './AdminSection'
import { SettingRow } from './SettingRow'
import { NumberInput } from './NumberInput'
import type { LearningSettings } from '@/lib/admin/types'
import type { SettingsSectionKey } from '@/lib/admin/types'

/**
 * Stored LearningSettings fields that no runtime code reads yet. They have no inputs here;
 * the panel lists them so admins know they exist but change nothing.
 */
const UNUSED_LEARNING_SETTINGS: ReadonlyArray<string> = [
  'streak freezes',
  'streak freeze cost',
  'certificate auto-issue',
  'certificate expiry',
  'lesson completion required for progress',
  'quiz pass threshold',
]

/** The XP fields this form edits. */
type XpField =
  | 'xpPerLessonComplete'
  | 'xpPerQuizPass'
  | 'xpPerFlashcardReview'
  | 'xpPerReflection'
  | 'xpQuizPerfectBonus'
  | 'xpPerCapstoneSubmitted'
  | 'xpStreakBaseReward'
  | 'xpReferralReward'

/**
 * The lowest value the server stores for each field (updateLearningSettings in
 * lib/admin/settings-service.ts): whole numbers, at least 1, except the perfect-quiz bonus
 * where 0 turns it off. Anything else is not stored, so it must not look saved here.
 */
const XP_MIN: Record<XpField, number> = {
  xpPerLessonComplete: 1,
  xpPerQuizPass: 1,
  xpPerFlashcardReview: 1,
  xpPerReflection: 1,
  xpQuizPerfectBonus: 0,
  xpPerCapstoneSubmitted: 1,
  xpStreakBaseReward: 1,
  xpReferralReward: 1,
}
/** The server's upper bound for every XP setting. */
const XP_MAX = 10_000
const XP_FIELDS = Object.keys(XP_MIN) as XpField[]

/** The typed text as a storable value, or null when the server would not store it. */
function parseXp(raw: string, field: XpField): number | null {
  const text = raw.trim()
  if (!/^\d+$/.test(text)) return null
  const value = Number(text)
  return value >= XP_MIN[field] && value <= XP_MAX ? value : null
}

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
  // What is typed in each XP box. Only a valid number reaches the section state: an empty or
  // out-of-range box used to be sent as 0, which the server ignores while the form showed 0.
  const [drafts, setDrafts] = useState<Partial<Record<XpField, string>>>({})

  /** The draft still being edited: invalid text, or text for the value the section holds. */
  const liveDraft = (field: XpField): string | undefined => {
    const draft = drafts[field]
    if (draft === undefined) return undefined
    const parsed = parseXp(draft, field)
    // A valid draft that no longer matches was replaced from outside (reset, a save response).
    return parsed === null || parsed === data[field] ? draft : undefined
  }
  const xpError = (field: XpField): string | undefined => {
    const draft = liveDraft(field)
    if (draft === undefined || parseXp(draft, field) !== null) return undefined
    return `Enter a whole number from ${XP_MIN[field]} to ${XP_MAX.toLocaleString()}.`
  }
  const hasXpErrors = XP_FIELDS.some((field) => xpError(field) !== undefined)

  const xpInput = (field: XpField, label: string) => ({
    'aria-label': label,
    value: liveDraft(field) ?? String(data[field] ?? ''),
    error: xpError(field),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value
      setDrafts((prev) => ({ ...prev, [field]: raw }))
      const parsed = parseXp(raw, field)
      if (parsed !== null) onChange({ [field]: parsed })
    },
  })

  const handleReset = () => {
    setDrafts({})
    onReset()
  }

  return (
    <div className="space-y-6">
      {/* XP Group */}
      <AdminSection title="XP Rewards" icon={Zap} meta="Experience points for learning activities">
        <p className="pb-2 text-xs text-admin-fg-muted">Changes apply within a minute on all servers.</p>
        <SettingRow
          label="XP for reading a lesson"
          description="XP awarded when a learner reads a lesson's theory (once per lesson)."
        >
          <NumberInput
            {...xpInput('xpPerLessonComplete', 'XP for reading a lesson')}
            min={1}
            max={1000}
            step={5}
            disabled={isSaving}
          />
        </SettingRow>

        <SettingRow
          label="XP per correct quiz answer"
          description="XP awarded for each correct answer in a lesson quiz."
        >
          <NumberInput
            {...xpInput('xpPerQuizPass', 'XP per correct quiz answer')}
            min={1}
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
            {...xpInput('xpPerFlashcardReview', 'XP per Flashcard Review')}
            min={1}
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
            {...xpInput('xpPerReflection', 'XP per Reflection')}
            min={1}
            max={500}
            step={5}
            disabled={isSaving}
          />
        </SettingRow>

        <SettingRow
          label="Perfect quiz bonus"
          description="Extra XP for answering every question right on the first attempt. 0 turns it off."
        >
          <NumberInput
            {...xpInput('xpQuizPerfectBonus', 'Perfect quiz bonus')}
            min={0}
            max={1000}
            step={5}
            disabled={isSaving}
          />
        </SettingRow>

        <SettingRow
          label="XP per capstone submitted"
          description="XP awarded when a learner submits a capstone."
        >
          <NumberInput
            {...xpInput('xpPerCapstoneSubmitted', 'XP per capstone submitted')}
            min={1}
            max={10000}
            step={10}
            disabled={isSaving}
          />
        </SettingRow>

        <SettingRow
          label="Daily streak XP"
          description="Base XP for keeping the daily learning streak going."
        >
          <NumberInput
            {...xpInput('xpStreakBaseReward', 'Daily streak XP')}
            min={1}
            max={1000}
            step={1}
            disabled={isSaving}
          />
        </SettingRow>

        <SettingRow
          label="XP per Referral"
          description="XP the referrer earns when an invited learner completes their first lesson. Shown wherever the reward is described."
        >
          <NumberInput
            {...xpInput('xpReferralReward', 'XP per Referral')}
            min={1}
            max={10000}
            step={5}
            disabled={isSaving}
          />
        </SettingRow>
      </AdminSection>

      <div className="flex items-start gap-2 rounded-lg border border-admin-border bg-admin-surface-raised/40 px-4 py-3 text-xs text-admin-fg-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <p>
          <span className="font-semibold text-admin-fg">Not used by the app yet:</span>{' '}
          {UNUSED_LEARNING_SETTINGS.join(', ')}. These are stored with the settings but nothing
          reads them, so they have no controls here.
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 border-t border-admin-border pt-4">
        {hasXpErrors && (
          <p id="learning-settings-save-blocked" className="mr-auto text-xs text-admin-danger">
            Fix the highlighted XP values to save.
          </p>
        )}
        <button
          type="button"
          onClick={handleReset}
          disabled={(!isDirty && !hasXpErrors) || isSaving}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-admin-border bg-admin-surface text-admin-fg-muted hover:text-admin-fg hover:bg-admin-surface-raised transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!isDirty || isSaving || hasXpErrors}
          aria-describedby={hasXpErrors ? 'learning-settings-save-blocked' : undefined}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-admin-accent text-admin-bg hover:bg-admin-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
        >
          <Save className="w-3.5 h-3.5" />
          {isSaving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}