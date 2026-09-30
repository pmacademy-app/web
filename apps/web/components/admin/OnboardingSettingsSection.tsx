'use client'

import React, { useState } from 'react'
import {
  Users,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Sparkles,
  RotateCcw,
  Save,
  ListOrdered,
  CheckCircle2,
  Target,
  Briefcase,
  Compass,
  TrendingUp,
  BookOpen,
  Award,
  Rocket,
  GraduationCap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AdminSection } from './AdminSection'
import { AdminToggle } from './AdminToggle'
import { SettingRow } from './SettingRow'
import {
  DEFAULT_GOAL_OPTIONS,
  DEFAULT_EXPERIENCE_OPTIONS,
} from '@/lib/admin/onboarding-defaults'
import { CURRICULUM_MODULE_META, type CurriculumModuleMeta } from '@/lib/admin/curriculum-meta'
import { CurriculumModuleIcon } from '@/components/curriculum/CurriculumModuleIcon'
import type { OnboardingSettings, OnboardingFieldOption, SettingsSectionKey } from '@/lib/admin/types'

interface OnboardingSettingsSectionProps {
  sectionKey: SettingsSectionKey
  data: OnboardingSettings
  onChange: (partial: Partial<OnboardingSettings>) => void
  onSave: () => void
  onReset: () => void
  isDirty: boolean
  isSaving: boolean
  initialData: OnboardingSettings
}

/**
 * Phase 4C — Admin onboarding configuration, reconciled to the live single-screen flow.
 *
 * The learner onboarding (see `app/onboarding/OnboardingWizard.tsx` and ADR-007) is one
 * focused screen collecting a primary goal and an experience level; profile/portfolio
 * identity is deferred to Settings → Portfolio. This panel therefore configures exactly the
 * two option groups the live screen renders — nothing else. The former 4-step builder
 * (editable steps, per-step required fields, topics / learning-preference selection, a
 * multi-step simulator) was removed because the live flow never consumed it, leaving the
 * Admin UI describing an onboarding model that no longer existed.
 */

// The two configurable groups the single-screen wizard consumes, in render order.
type OptionGroupKey = 'goal' | 'experience_level'

const OPTION_GROUPS: Array<{
  key: OptionGroupKey
  label: string
  icon: React.ComponentType<{ className?: string }>
  description: string
  defaults: OnboardingFieldOption[]
}> = [
  {
    key: 'goal',
    label: 'Primary Goals',
    icon: Target,
    description: 'Career objectives shown as the first (required, single-select) question on the onboarding screen.',
    defaults: DEFAULT_GOAL_OPTIONS,
  },
  {
    key: 'experience_level',
    label: 'Experience Levels',
    icon: Briefcase,
    description: 'Learner backgrounds shown as the second (required, single-select) question on the onboarding screen.',
    defaults: DEFAULT_EXPERIENCE_OPTIONS,
  },
]

// Icons the goal/experience option sets reference, plus a safe fallback. Mirrors the
// mapping the live wizard uses so the preview matches what learners actually see.
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Target,
  Compass,
  Sparkles,
  TrendingUp,
  BookOpen,
  Briefcase,
  Award,
}

function getIconComponent(iconName: string | undefined, fallback: React.ComponentType<{ className?: string }>) {
  if (!iconName) return fallback
  return ICON_MAP[iconName] || fallback
}

function generateOptionId(): string {
  return `opt_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Mirrors `OnboardingWizard.computeRecommendation` so the preview's "Recommended start"
 * hint matches the live screen. Presentational only.
 */
function computeRecommendation(
  goalId: string | undefined,
  experienceId: string | undefined,
  goalOptions: OnboardingFieldOption[]
): CurriculumModuleMeta | null {
  if (!goalId || !experienceId) return null
  const selectedGoal = goalOptions.find((g) => g.id === goalId)
  if (selectedGoal?.recommendedModule && CURRICULUM_MODULE_META[selectedGoal.recommendedModule]) {
    if (experienceId === 'beginner' || experienceId === 'learning') {
      return CURRICULUM_MODULE_META.foundations || CURRICULUM_MODULE_META[selectedGoal.recommendedModule]
    }
    return CURRICULUM_MODULE_META[selectedGoal.recommendedModule]
  }
  return CURRICULUM_MODULE_META.foundations || Object.values(CURRICULUM_MODULE_META)[0]
}

export function OnboardingSettingsSection({
  data,
  onChange,
  onSave,
  onReset,
  isDirty,
  isSaving,
}: OnboardingSettingsSectionProps) {
  const [activeOptionGroup, setActiveOptionGroup] = useState<OptionGroupKey>('goal')

  const fieldOptions = data.fieldOptions || {
    goal: DEFAULT_GOAL_OPTIONS,
    experience_level: DEFAULT_EXPERIENCE_OPTIONS,
  }

  const goalOptions = fieldOptions.goal && fieldOptions.goal.length > 0 ? fieldOptions.goal : DEFAULT_GOAL_OPTIONS
  const experienceOptions =
    fieldOptions.experience_level && fieldOptions.experience_level.length > 0
      ? fieldOptions.experience_level
      : DEFAULT_EXPERIENCE_OPTIONS

  const activeGroupConfig = OPTION_GROUPS.find((g) => g.key === activeOptionGroup) || OPTION_GROUPS[0]
  const currentOptions: OnboardingFieldOption[] =
    activeOptionGroup === 'goal' ? goalOptions : experienceOptions

  // Preview reflects the first enabled option in each group (what a learner sees first).
  const enabledGoals = goalOptions.filter((o) => o.enabled !== false)
  const enabledExperience = experienceOptions.filter((o) => o.enabled !== false)
  const previewRecommendation = computeRecommendation(
    enabledGoals[0]?.id,
    enabledExperience[0]?.id,
    goalOptions
  )

  const handleToggleEnabled = (enabled: boolean) => {
    onChange({ enabled })
  }

  const updateFieldOptions = (groupKey: OptionGroupKey, newOptions: OnboardingFieldOption[]) => {
    onChange({
      fieldOptions: {
        ...fieldOptions,
        [groupKey]: newOptions,
      },
    })
  }

  const handleAddOption = (groupKey: OptionGroupKey) => {
    const currentList = groupKey === 'goal' ? goalOptions : experienceOptions
    const newOption: OnboardingFieldOption = {
      id: generateOptionId(),
      label: 'New Choice Option',
      description: 'Describe what this choice represents for the learner.',
      badge: 'Custom',
      enabled: true,
    }
    updateFieldOptions(groupKey, [...currentList, newOption])
  }

  const handleUpdateOption = (
    groupKey: OptionGroupKey,
    index: number,
    patch: Partial<OnboardingFieldOption>
  ) => {
    const currentList = [...(groupKey === 'goal' ? goalOptions : experienceOptions)]
    currentList[index] = { ...currentList[index], ...patch }
    updateFieldOptions(groupKey, currentList)
  }

  const handleDeleteOption = (groupKey: OptionGroupKey, index: number) => {
    const currentList = (groupKey === 'goal' ? goalOptions : experienceOptions).filter((_, i) => i !== index)
    updateFieldOptions(groupKey, currentList)
  }

  const handleMoveOption = (groupKey: OptionGroupKey, index: number, direction: 'up' | 'down') => {
    const currentList = [...(groupKey === 'goal' ? goalOptions : experienceOptions)]
    if (direction === 'up' && index === 0) return
    if (direction === 'down' && index === currentList.length - 1) return

    const targetIndex = direction === 'up' ? index - 1 : index + 1
    const temp = currentList[index]
    currentList[index] = currentList[targetIndex]
    currentList[targetIndex] = temp
    updateFieldOptions(groupKey, currentList)
  }

  return (
    <div className="space-y-6">
      {/* General Status */}
      <AdminSection
        title="Onboarding Status"
        icon={Users}
        iconColor="text-admin-accent"
        meta="Single-screen learner onboarding"
      >
        <SettingRow
          label="Enable Onboarding Screen"
          description="New learners choose a primary goal and an experience level on one screen before they start learning. Profile and portfolio details are collected later in Settings → Portfolio."
        >
          <AdminToggle
            pressed={data.enabled}
            onPressedChange={handleToggleEnabled}
            disabled={isSaving}
            aria-label="Toggle onboarding screen"
          />
        </SettingRow>
      </AdminSection>

      {/* Editor + Preview split view */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Option editor for the two live groups */}
        <div className="lg:col-span-7 space-y-4">
          <div className="p-5 rounded-xl border border-admin-border bg-admin-surface shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-admin-border pb-3">
              <div>
                <h3 className="text-sm font-bold text-admin-fg flex items-center gap-2">
                  <ListOrdered className="w-4 h-4 text-admin-accent" />
                  Onboarding Choices
                </h3>
                <p className="text-xs text-admin-fg-muted mt-0.5">
                  Customize the goal and experience cards the learner selects on the onboarding screen.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleAddOption(activeOptionGroup)}
                disabled={isSaving}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-admin-accent text-admin-accent-fg hover:bg-admin-accent/90 transition-colors shadow-sm self-start sm:self-auto disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" /> Add Option
              </button>
            </div>

            {/* Group switcher (only the two live groups) */}
            <div className="grid grid-cols-2 gap-2">
              {OPTION_GROUPS.map((grp) => {
                const isSelected = activeOptionGroup === grp.key
                const Icon = grp.icon
                const count = (grp.key === 'goal' ? goalOptions : experienceOptions).length
                return (
                  <button
                    key={grp.key}
                    type="button"
                    onClick={() => setActiveOptionGroup(grp.key)}
                    className={cn(
                      'p-2.5 rounded-lg border text-left flex items-center gap-2 transition-all',
                      isSelected
                        ? 'border-admin-accent bg-admin-accent-soft text-admin-accent font-semibold shadow-xs'
                        : 'border-admin-border bg-admin-surface-raised/40 text-admin-fg-muted hover:text-admin-fg hover:border-admin-border-strong'
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="text-xs truncate">{grp.label}</span>
                    <span className="ml-auto text-[10px] font-mono opacity-70">{count}</span>
                  </button>
                )
              })}
            </div>

            <p className="text-xs text-admin-fg-muted italic">{activeGroupConfig.description}</p>

            <div className="space-y-3">
              {currentOptions.map((opt, optIndex) => (
                <div
                  key={opt.id}
                  className={cn(
                    'p-3.5 rounded-lg border transition-all space-y-2.5',
                    opt.enabled !== false
                      ? 'border-admin-border bg-admin-surface-raised/40'
                      : 'border-admin-border/50 bg-admin-surface-raised/20 opacity-60'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-admin-surface border border-admin-border text-admin-fg-muted shrink-0">
                        #{optIndex + 1}
                      </span>
                      <span className="text-xs font-mono font-semibold text-admin-accent truncate">
                        ID: {opt.id}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="flex items-center gap-1 mr-1">
                        <span className="text-[10px] text-admin-fg-muted">Active:</span>
                        <AdminToggle
                          pressed={opt.enabled !== false}
                          onPressedChange={(enabled) =>
                            handleUpdateOption(activeOptionGroup, optIndex, { enabled })
                          }
                          disabled={isSaving}
                          aria-label={`Toggle option ${opt.label}`}
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleMoveOption(activeOptionGroup, optIndex, 'up')}
                        disabled={optIndex === 0 || isSaving}
                        className="p-1 rounded text-admin-fg-muted hover:text-admin-fg hover:bg-admin-surface disabled:opacity-30"
                        title="Move option up"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveOption(activeOptionGroup, optIndex, 'down')}
                        disabled={optIndex === currentOptions.length - 1 || isSaving}
                        className="p-1 rounded text-admin-fg-muted hover:text-admin-fg hover:bg-admin-surface disabled:opacity-30"
                        title="Move option down"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteOption(activeOptionGroup, optIndex)}
                        disabled={currentOptions.length <= 1 || isSaving}
                        className="p-1 rounded text-admin-danger hover:bg-admin-danger-soft disabled:opacity-30"
                        title="Delete option"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="text-[11px] font-medium text-admin-fg block mb-0.5">Title / Option Label</label>
                      <input
                        type="text"
                        value={opt.label}
                        onChange={(e) =>
                          handleUpdateOption(activeOptionGroup, optIndex, { label: e.target.value })
                        }
                        disabled={isSaving}
                        placeholder="Option Title"
                        className="w-full px-2.5 py-1.5 text-xs text-admin-fg bg-admin-surface border border-admin-border rounded-lg placeholder:text-admin-fg-subtle focus:outline-none focus:ring-1 focus:ring-admin-accent"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-admin-fg block mb-0.5">Badge Text</label>
                      <input
                        type="text"
                        value={opt.badge || ''}
                        onChange={(e) =>
                          handleUpdateOption(activeOptionGroup, optIndex, { badge: e.target.value })
                        }
                        disabled={isSaving}
                        placeholder="e.g. Career Focus"
                        className="w-full px-2.5 py-1.5 text-xs text-admin-fg bg-admin-surface border border-admin-border rounded-lg placeholder:text-admin-fg-subtle focus:outline-none focus:ring-1 focus:ring-admin-accent"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-admin-fg block mb-0.5">Description Subtitle</label>
                    <input
                      type="text"
                      value={opt.description || ''}
                      onChange={(e) =>
                        handleUpdateOption(activeOptionGroup, optIndex, { description: e.target.value })
                      }
                      disabled={isSaving}
                      placeholder="Describe what the learner achieves with this option..."
                      className="w-full px-2.5 py-1.5 text-xs text-admin-fg bg-admin-surface border border-admin-border rounded-lg placeholder:text-admin-fg-subtle focus:outline-none focus:ring-1 focus:ring-admin-accent"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: faithful single-screen preview */}
        <div className="lg:col-span-5 space-y-3">
          <div className="sticky top-6">
            <div className="flex items-center justify-between px-1 mb-2">
              <span className="text-xs font-bold text-admin-fg flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-admin-accent" />
                Onboarding Screen Preview
              </span>
              <span className="text-[10px] font-mono text-admin-fg-muted">Single screen</span>
            </div>

            <div className="rounded-2xl border border-admin-border bg-admin-bg p-5 shadow-md space-y-5">
              <div className="text-center space-y-1">
                <h4 className="text-base font-bold text-admin-fg font-serif">Let&apos;s set up your path</h4>
                <p className="text-[11px] text-admin-fg-muted">
                  Two quick choices and you&apos;re learning. Profile &amp; portfolio come later in Settings.
                </p>
              </div>

              {/* Goal preview */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-admin-fg flex items-center justify-between">
                  <span>Primary goal</span>
                  <span className="text-[10px] text-admin-accent font-mono">Required</span>
                </span>
                <div className="space-y-1.5">
                  {enabledGoals.length === 0 ? (
                    <p className="text-[11px] text-admin-fg-muted italic">No active goal options.</p>
                  ) : (
                    enabledGoals.map((option, i) => {
                      const Icon = getIconComponent(option.icon, Target)
                      const isFirst = i === 0
                      return (
                        <div
                          key={option.id}
                          className={cn(
                            'w-full p-2.5 rounded-xl border text-left flex items-start gap-2.5',
                            isFirst
                              ? 'border-admin-accent bg-admin-accent-soft ring-1 ring-admin-accent/30'
                              : 'border-admin-border bg-admin-surface'
                          )}
                        >
                          <div className={cn('p-1.5 rounded-lg shrink-0', isFirst ? 'bg-admin-accent text-admin-accent-fg' : 'bg-admin-surface-raised text-admin-fg-muted')}>
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <p className="text-xs font-bold text-admin-fg truncate">{option.label}</p>
                              {option.badge && (
                                <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-admin-surface-raised text-admin-fg-muted border border-admin-border">
                                  {option.badge}
                                </span>
                              )}
                            </div>
                            {option.description && (
                              <p className="text-[10px] text-admin-fg-muted mt-0.5 leading-snug line-clamp-2">
                                {option.description}
                              </p>
                            )}
                          </div>
                          {isFirst && <CheckCircle2 className="w-3.5 h-3.5 text-admin-accent shrink-0 mt-0.5" />}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Experience preview */}
              <div className="space-y-1.5 pt-1 border-t border-admin-border/60">
                <span className="text-[11px] font-semibold text-admin-fg flex items-center justify-between">
                  <span>Experience level</span>
                  <span className="text-[10px] text-admin-accent font-mono">Required</span>
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {enabledExperience.length === 0 ? (
                    <p className="text-[11px] text-admin-fg-muted italic col-span-2">No active experience options.</p>
                  ) : (
                    enabledExperience.map((option, i) => {
                      const isFirst = i === 0
                      return (
                        <div
                          key={option.id}
                          className={cn(
                            'p-2 rounded-lg border text-left flex items-center justify-between gap-1',
                            isFirst
                              ? 'border-admin-accent bg-admin-accent-soft font-semibold text-admin-fg'
                              : 'border-admin-border bg-admin-surface text-admin-fg-muted'
                          )}
                        >
                          <span className="text-[11px] truncate">{option.label}</span>
                          {isFirst && <CheckCircle2 className="w-3 h-3 text-admin-accent shrink-0" />}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Recommended start hint — mirrors the live screen */}
              {previewRecommendation && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-admin-accent-soft border border-admin-accent/20">
                  <div className="w-8 h-8 rounded-lg bg-admin-surface border border-admin-accent/20 text-admin-accent shrink-0 flex items-center justify-center">
                    <CurriculumModuleIcon slugOrIcon={previewRecommendation.slug} className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-admin-fg-muted flex items-center gap-1">
                      <GraduationCap className="w-3 h-3 text-admin-accent" /> Recommended start
                    </p>
                    <p className="text-xs font-bold text-admin-fg mt-0.5 truncate">{previewRecommendation.name}</p>
                  </div>
                </div>
              )}

              {/* CTA row (read-only mock) */}
              <div className="flex items-center gap-2 pt-1">
                <div className="flex-1 h-9 rounded-xl border border-admin-border bg-admin-surface text-admin-fg-muted text-xs font-medium flex items-center justify-center">
                  Explore Curriculum
                </div>
                <div className="flex-1 h-9 rounded-xl bg-admin-accent text-admin-accent-fg text-xs font-semibold flex items-center justify-center gap-1.5">
                  <Rocket className="w-3.5 h-3.5" /> Start Learning
                </div>
              </div>
            </div>

            <p className="text-[10px] text-admin-fg-muted text-center mt-2 px-2">
              Preview highlights the first active option in each group. Username, avatar, bio and social
              links are intentionally deferred to Settings → Portfolio.
            </p>
          </div>
        </div>
      </div>

      {/* Action Bar */}
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
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-admin-accent text-admin-accent-fg hover:bg-admin-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
        >
          <Save className="w-3.5 h-3.5" />
          {isSaving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}
