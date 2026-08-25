'use client'

import React, { useState } from 'react'
import {
  Users,
  LayoutList,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Sparkles,
  Eye,
  EyeOff,
  RotateCcw,
  Save,
  Tag,
  X,
  Check,
  ArrowRight,
  ArrowLeft,
  ListOrdered,
  CheckCircle2,
  Target,
  Briefcase,
  BookOpen,
  Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AdminSection } from './AdminSection'
import { AdminToggle } from './AdminToggle'
import { SettingRow } from './SettingRow'
import {
  DEFAULT_GOAL_OPTIONS,
  DEFAULT_EXPERIENCE_OPTIONS,
  DEFAULT_TOPIC_OPTIONS,
  DEFAULT_PREFERENCE_OPTIONS,
} from '@/lib/admin/settings-service'
import type { OnboardingSettings, OnboardingStepConfig, OnboardingFieldOption, SettingsSectionKey } from '@/lib/admin/types'

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

type OptionGroupKey = 'goal' | 'experience_level' | 'topics' | 'learning_preference'

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
    description: 'Career objectives & target outcomes (Step 2 single-select)',
    defaults: DEFAULT_GOAL_OPTIONS,
  },
  {
    key: 'experience_level',
    label: 'Experience Levels',
    icon: Briefcase,
    description: 'Learner backgrounds & skill baselines (Step 2 single-select)',
    defaults: DEFAULT_EXPERIENCE_OPTIONS,
  },
  {
    key: 'topics',
    label: 'Learning Topics',
    icon: Layers,
    description: 'Curriculum interest competencies (Step 3 multi-select)',
    defaults: DEFAULT_TOPIC_OPTIONS,
  },
  {
    key: 'learning_preference',
    label: 'Learning Preferences',
    icon: BookOpen,
    description: 'Preferred study styles & formats (Step 3 single-select)',
    defaults: DEFAULT_PREFERENCE_OPTIONS,
  },
]

// Preset recommended profile attributes
const PRESET_FIELDS: Array<{ key: string; label: string; description: string; hasOptions?: boolean }> = [
  { key: 'username', label: 'Unique Username', description: 'Handle used for public portfolio URL' },
  { key: 'name', label: 'Full Name', description: 'Learner display name on certificates and profile' },
  { key: 'career_role', label: 'Experience Level', description: 'Learner experience tier (configurable options)', hasOptions: true },
  { key: 'goal', label: 'Primary Goal', description: 'Career path or study objective (configurable options)', hasOptions: true },
  { key: 'topics', label: 'Priority Topics', description: 'Focus competencies (configurable options)', hasOptions: true },
  { key: 'learning_preference', label: 'Learning Style', description: 'Preferred format style (configurable options)', hasOptions: true },
  { key: 'bio', label: 'Short Bio', description: 'Brief bio for public profile' },
  { key: 'linkedin_url', label: 'LinkedIn Profile', description: 'URL to learner professional network' },
  { key: 'twitter_url', label: 'X / Twitter Handle', description: 'Social link' },
  { key: 'github_url', label: 'GitHub Profile', description: 'URL to GitHub code portfolio' },
  { key: 'website_url', label: 'Portfolio Website', description: 'URL to personal product portfolio or resume' },
]

function generateStepId(): string {
  return `step_${Math.random().toString(36).substring(2, 9)}`
}

function generateOptionId(): string {
  return `opt_${Math.random().toString(36).substring(2, 9)}`
}

export function OnboardingSettingsSection({
  data,
  onChange,
  onSave,
  onReset,
  isDirty,
  isSaving,
}: OnboardingSettingsSectionProps) {
  const [showPreview, setShowPreview] = useState<boolean>(true)
  const [previewStepIndex, setPreviewStepIndex] = useState<number>(0)
  const [customTagInput, setCustomTagInput] = useState<{ [stepId: string]: string }>({})
  const [activeOptionGroup, setActiveOptionGroup] = useState<OptionGroupKey>('goal')
  const [selectedPreviewGoal, setSelectedPreviewGoal] = useState<string>('become_pm')
  const [selectedPreviewExp, setSelectedPreviewExp] = useState<string>('beginner')

  const fieldOptions = data.fieldOptions || {
    goal: DEFAULT_GOAL_OPTIONS,
    experience_level: DEFAULT_EXPERIENCE_OPTIONS,
    topics: DEFAULT_TOPIC_OPTIONS,
    learning_preference: DEFAULT_PREFERENCE_OPTIONS,
  }

  const activeGroupConfig = OPTION_GROUPS.find((g) => g.key === activeOptionGroup) || OPTION_GROUPS[0]
  const currentOptions: OnboardingFieldOption[] =
    fieldOptions[activeOptionGroup] || activeGroupConfig.defaults

  const handleToggleEnabled = (enabled: boolean) => {
    onChange({ enabled })
  }

  const handleStepChange = (index: number, field: keyof OnboardingStepConfig, value: unknown) => {
    const newSteps = [...data.steps]
    newSteps[index] = { ...newSteps[index], [field]: value }
    onChange({ steps: newSteps })
  }

  const handleToggleRequiredField = (stepIndex: number, fieldKey: string) => {
    const currentStep = data.steps[stepIndex]
    if (!currentStep) return

    const exists = currentStep.requiredFields.includes(fieldKey)
    const nextFields = exists
      ? currentStep.requiredFields.filter((f) => f !== fieldKey)
      : [...currentStep.requiredFields, fieldKey]

    handleStepChange(stepIndex, 'requiredFields', nextFields)
  }

  const handleAddCustomTag = (stepIndex: number) => {
    const step = data.steps[stepIndex]
    if (!step) return
    const inputVal = (customTagInput[step.id] || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
    if (!inputVal) return

    if (!step.requiredFields.includes(inputVal)) {
      handleStepChange(stepIndex, 'requiredFields', [...step.requiredFields, inputVal])
    }
    setCustomTagInput((prev) => ({ ...prev, [step.id]: '' }))
  }

  const addStep = () => {
    const newId = generateStepId()
    const newSteps: OnboardingStepConfig[] = [
      ...data.steps,
      {
        id: newId,
        title: 'New Onboarding Step',
        description: 'Provide clear instructions for the learner at this step.',
        requiredFields: [],
      },
    ]
    onChange({ steps: newSteps })
    if (previewStepIndex >= newSteps.length) {
      setPreviewStepIndex(newSteps.length - 1)
    }
  }

  const removeStep = (index: number) => {
    const newSteps = data.steps.filter((_, i) => i !== index)
    onChange({ steps: newSteps })
    if (previewStepIndex >= newSteps.length && newSteps.length > 0) {
      setPreviewStepIndex(newSteps.length - 1)
    }
  }

  const moveStep = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return
    if (direction === 'down' && index === data.steps.length - 1) return

    const targetIndex = direction === 'up' ? index - 1 : index + 1
    const newSteps = [...data.steps]
    const temp = newSteps[index]
    newSteps[index] = newSteps[targetIndex]
    newSteps[targetIndex] = temp
    onChange({ steps: newSteps })
  }

  // Manage Field Options (e.g. goal, experience, topics, preference)
  const updateFieldOptions = (groupKey: OptionGroupKey, newOptions: OnboardingFieldOption[]) => {
    onChange({
      fieldOptions: {
        ...fieldOptions,
        [groupKey]: newOptions,
      },
    })
  }

  const handleAddOption = (groupKey: OptionGroupKey) => {
    const currentList = fieldOptions[groupKey] || activeGroupConfig.defaults
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
    const currentList = [...(fieldOptions[groupKey] || activeGroupConfig.defaults)]
    currentList[index] = { ...currentList[index], ...patch }
    updateFieldOptions(groupKey, currentList)
  }

  const handleDeleteOption = (groupKey: OptionGroupKey, index: number) => {
    const currentList = (fieldOptions[groupKey] || activeGroupConfig.defaults).filter((_, i) => i !== index)
    updateFieldOptions(groupKey, currentList)
  }

  const handleMoveOption = (groupKey: OptionGroupKey, index: number, direction: 'up' | 'down') => {
    const currentList = [...(fieldOptions[groupKey] || activeGroupConfig.defaults)]
    if (direction === 'up' && index === 0) return
    if (direction === 'down' && index === currentList.length - 1) return

    const targetIndex = direction === 'up' ? index - 1 : index + 1
    const temp = currentList[index]
    currentList[index] = currentList[targetIndex]
    currentList[targetIndex] = temp
    updateFieldOptions(groupKey, currentList)
  }

  const activePreviewStep = data.steps[previewStepIndex] || data.steps[0]

  return (
    <div className="space-y-6">
      {/* General Status */}
      <AdminSection
        title="Onboarding Status"
        icon={Users}
        iconColor="text-admin-accent"
        meta="Global learner onboarding activation"
      >
        <SettingRow
          label="Enable Onboarding Flow"
          description="When enabled, newly registered users are guided through the 4-step onboarding flow before accessing the curriculum."
        >
          <AdminToggle
            pressed={data.enabled}
            onPressedChange={handleToggleEnabled}
            disabled={isSaving}
            aria-label="Toggle onboarding flow"
          />
        </SettingRow>
      </AdminSection>

      {/* Step Configuration and Preview Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Step Management */}
        <div className={cn(showPreview ? 'lg:col-span-7' : 'lg:col-span-12', 'space-y-6')}>
          {/* Steps Sequence */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-admin-fg flex items-center gap-2">
                  <LayoutList className="w-4 h-4 text-admin-accent" />
                  Configured Sequence ({data.steps.length} {data.steps.length === 1 ? 'Step' : 'Steps'})
                </h3>
                <p className="text-xs text-admin-fg-muted mt-0.5">
                  Define titles, descriptions, and required fields for each step.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-admin-border bg-admin-surface text-admin-fg-muted hover:text-admin-fg hover:bg-admin-surface-raised transition-colors self-start sm:self-auto"
              >
                {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showPreview ? 'Hide Preview' : 'Show Live Preview'}
              </button>
            </div>

            {data.steps.length === 0 ? (
              <div className="p-8 text-center rounded-xl border border-dashed border-admin-border bg-admin-surface-raised/30 space-y-3">
                <p className="text-xs text-admin-fg-muted">No onboarding steps configured.</p>
                <button
                  type="button"
                  onClick={addStep}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-admin-accent text-admin-accent-fg hover:bg-admin-accent/90 transition-colors shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" /> Add First Step
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {data.steps.map((step, index) => (
                  <div
                    key={step.id}
                    className="p-4 sm:p-5 rounded-xl border border-admin-border bg-admin-surface hover:border-admin-border-strong transition-all space-y-4 shadow-sm"
                  >
                    {/* Step Card Header */}
                    <div className="flex items-center justify-between border-b border-admin-border pb-3">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-admin-accent-soft text-admin-accent border border-admin-accent/25">
                          Step {String(index + 1).padStart(2, '0')}
                        </span>
                        <span className="text-[11px] font-mono text-admin-fg-muted">
                          ID: {step.id}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveStep(index, 'up')}
                          disabled={index === 0 || isSaving}
                          title="Move Up"
                          className="p-1.5 rounded-lg text-admin-fg-muted hover:text-admin-fg hover:bg-admin-surface-raised disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => moveStep(index, 'down')}
                          disabled={index === data.steps.length - 1 || isSaving}
                          title="Move Down"
                          className="p-1.5 rounded-lg text-admin-fg-muted hover:text-admin-fg hover:bg-admin-surface-raised disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => removeStep(index)}
                          disabled={isSaving}
                          title="Delete Step"
                          className="p-1.5 rounded-lg text-admin-danger hover:bg-admin-danger-soft transition-colors ml-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Title & Description Inputs */}
                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <label className="font-medium text-admin-fg">Step Title</label>
                          <span className="text-[10px] text-admin-fg-muted font-mono">
                            {step.title.length}/80
                          </span>
                        </div>
                        <input
                          type="text"
                          maxLength={80}
                          value={step.title}
                          onChange={(e) => handleStepChange(index, 'title', e.target.value)}
                          disabled={isSaving}
                          placeholder="e.g. What is your primary career goal?"
                          className="w-full px-3 py-2 text-sm text-admin-fg bg-admin-surface-raised border border-admin-border rounded-lg placeholder:text-admin-fg-subtle focus:outline-none focus:ring-2 focus:ring-admin-accent/50 focus:border-admin-accent transition-colors"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <label className="font-medium text-admin-fg">Step Description</label>
                          <span className="text-[10px] text-admin-fg-muted font-mono">
                            {step.description.length}/160
                          </span>
                        </div>
                        <textarea
                          rows={2}
                          maxLength={160}
                          value={step.description}
                          onChange={(e) => handleStepChange(index, 'description', e.target.value)}
                          disabled={isSaving}
                          placeholder="e.g. This helps us customize your cohort recommendations."
                          className="w-full px-3 py-2 text-xs text-admin-fg bg-admin-surface-raised border border-admin-border rounded-lg placeholder:text-admin-fg-subtle focus:outline-none focus:ring-2 focus:ring-admin-accent/50 focus:border-admin-accent transition-colors resize-none"
                        />
                      </div>
                    </div>

                    {/* Required Fields Tag Selector */}
                    <div className="pt-2 border-t border-admin-border space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-admin-fg flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5 text-admin-accent" />
                          Required Profile Fields at this Step:
                        </label>
                        <span className="text-[10px] text-admin-fg-muted font-mono">
                          {step.requiredFields.length} selected
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {PRESET_FIELDS.map((preset) => {
                          const isSelected = step.requiredFields.includes(preset.key)
                          return (
                            <button
                              key={preset.key}
                              type="button"
                              onClick={() => handleToggleRequiredField(index, preset.key)}
                              disabled={isSaving}
                              title={preset.description}
                              className={cn(
                                'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border font-medium transition-all',
                                isSelected
                                    ? 'bg-admin-accent-soft border-admin-accent/30 text-admin-accent shadow-xs'
                                    : 'bg-admin-surface-raised border-admin-border text-admin-fg-muted hover:text-admin-fg hover:border-admin-border-strong'
                              )}
                            >
                              {isSelected ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3 opacity-60" />}
                              {preset.label}
                            </button>
                          )
                        })}

                        {/* Custom Added Tags */}
                        {step.requiredFields
                          .filter((f) => !PRESET_FIELDS.some((p) => p.key === f))
                          .map((customField) => (
                            <span
                              key={customField}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border bg-admin-accent-soft border-admin-accent/25 text-admin-accent font-mono"
                            >
                              {customField}
                              <button
                                type="button"
                                onClick={() => handleToggleRequiredField(index, customField)}
                                disabled={isSaving}
                                className="hover:opacity-75"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                      </div>

                      <div className="flex items-center gap-2 pt-1.5">
                        <input
                          type="text"
                          value={customTagInput[step.id] || ''}
                          onChange={(e) =>
                            setCustomTagInput((prev) => ({ ...prev, [step.id]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleAddCustomTag(index)
                            }
                          }}
                          placeholder="Add custom field key..."
                          disabled={isSaving}
                          className="px-2.5 py-1 text-xs text-admin-fg bg-admin-surface-raised border border-admin-border rounded-lg placeholder:text-admin-fg-subtle focus:outline-none focus:ring-1 focus:ring-admin-accent max-w-[200px]"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddCustomTag(index)}
                          disabled={!customTagInput[step.id]?.trim() || isSaving}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-admin-surface-raised border border-admin-border text-admin-fg-muted hover:text-admin-fg hover:border-admin-border-strong disabled:opacity-40"
                        >
                          Add Tag
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addStep}
                  disabled={isSaving}
                  className="w-full py-3 rounded-xl border border-dashed border-admin-border text-admin-fg-muted hover:text-admin-accent hover:border-admin-accent/50 bg-admin-surface-raised/40 hover:bg-admin-accent-soft/30 flex items-center justify-center gap-2 text-xs font-bold transition-all"
                >
                  <Plus className="w-4 h-4" /> Add Step to Onboarding Sequence
                </button>
              </div>
            )}
          </div>

          {/* Configurable Field Choices Editor with Category Tabs */}
          <div className="p-5 rounded-xl border border-admin-border bg-admin-surface shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-admin-border pb-3">
              <div>
                <h3 className="text-sm font-bold text-admin-fg flex items-center gap-2">
                  <ListOrdered className="w-4 h-4 text-admin-accent" />
                  Configurable Field Choices & Options
                </h3>
                <p className="text-xs text-admin-fg-muted mt-0.5">
                  Customize the selectable cards, descriptions, and badges across all onboarding steps.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleAddOption(activeOptionGroup)}
                disabled={isSaving}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-admin-accent text-admin-accent-fg hover:bg-admin-accent/90 transition-colors shadow-sm self-start sm:self-auto"
              >
                <Plus className="w-3.5 h-3.5" /> Add Option
              </button>
            </div>

            {/* Option Category Switcher */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {OPTION_GROUPS.map((grp) => {
                const isSelected = activeOptionGroup === grp.key
                const Icon = grp.icon
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
                  </button>
                )
              })}
            </div>

            <p className="text-xs text-admin-fg-muted italic">
              {activeGroupConfig.description}
            </p>

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
                      placeholder="Describe what the student achieves with this option..."
                      className="w-full px-2.5 py-1.5 text-xs text-admin-fg bg-admin-surface border border-admin-border rounded-lg placeholder:text-admin-fg-subtle focus:outline-none focus:ring-1 focus:ring-admin-accent"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Live Onboarding Flow Preview */}
        {showPreview && (
          <div className="lg:col-span-5 space-y-3">
            <div className="sticky top-6">
              <div className="flex items-center justify-between px-1 mb-2">
                <span className="text-xs font-bold text-admin-fg flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-admin-accent" />
                  Learner Onboarding Simulator
                </span>
                <span className="text-[10px] font-mono text-admin-fg-muted">
                  Live Preview
                </span>
              </div>

              {/* Preview Container Mocking /onboarding Screen */}
              <div className="rounded-2xl border border-admin-border bg-admin-bg p-5 shadow-md space-y-5">
                {/* Stepper Progress */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-mono text-admin-fg-muted">
                    <span>Step {previewStepIndex + 1} of {data.steps.length || 1}</span>
                    <span className="text-admin-accent font-semibold">
                      {Math.round(((previewStepIndex + 1) / (data.steps.length || 1)) * 100)}% Complete
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-admin-surface-raised rounded-full overflow-hidden">
                    <div
                      className="h-full bg-admin-accent transition-all duration-300 rounded-full"
                      style={{
                        width: `${((previewStepIndex + 1) / (data.steps.length || 1)) * 100}%`,
                      }}
                    />
                  </div>
                </div>

                {activePreviewStep ? (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <h4 className="text-base font-bold text-admin-fg font-serif">
                        {activePreviewStep.title || 'Untitled Step'}
                      </h4>
                      <p className="text-xs text-admin-fg-muted leading-relaxed">
                        {activePreviewStep.description || 'No description configured.'}
                      </p>
                    </div>

                    {/* Render Form Preview Fields */}
                    <div className="space-y-3 pt-2">
                      {activePreviewStep.requiredFields.length === 0 ? (
                        <div className="p-4 rounded-lg bg-admin-surface-raised/40 text-center text-xs text-admin-fg-muted italic">
                          Summary / Recommendation Results Step
                        </div>
                      ) : (
                        activePreviewStep.requiredFields.map((fieldKey) => {
                          const preset = PRESET_FIELDS.find((p) => p.key === fieldKey)
                          const label = preset ? preset.label : fieldKey.replace(/_/g, ' ')

                          if (fieldKey === 'goal') {
                            const goals = (fieldOptions.goal || DEFAULT_GOAL_OPTIONS).filter((o) => o.enabled !== false)
                            return (
                              <div key={fieldKey} className="space-y-1.5">
                                <label className="text-xs font-medium text-admin-fg capitalize flex items-center justify-between">
                                  <span>{label}</span>
                                  <span className="text-[10px] text-admin-accent font-mono">Required</span>
                                </label>
                                <div className="space-y-2">
                                  {goals.map((option) => {
                                    const isSelected = selectedPreviewGoal === option.id
                                    return (
                                      <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => setSelectedPreviewGoal(option.id)}
                                        className={cn(
                                          'w-full p-2.5 rounded-xl border text-left flex items-start gap-2.5 transition-all',
                                          isSelected
                                            ? 'border-admin-accent bg-admin-accent-soft text-admin-fg ring-1 ring-admin-accent/30 shadow-xs'
                                            : 'border-admin-border bg-admin-surface text-admin-fg-muted hover:border-admin-border-strong'
                                        )}
                                      >
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center justify-between gap-1">
                                            <p className="text-xs font-bold text-admin-fg">{option.label}</p>
                                            {option.badge && (
                                              <span className="text-[9px] uppercase font-bold px-1.5 py-0.2 rounded bg-admin-surface-raised text-admin-fg-muted border border-admin-border">
                                                {option.badge}
                                              </span>
                                            )}
                                          </div>
                                          {option.description && (
                                            <p className="text-[10px] text-admin-fg-muted mt-0.5 leading-snug">
                                              {option.description}
                                            </p>
                                          )}
                                        </div>
                                        {isSelected && (
                                          <CheckCircle2 className="w-3.5 h-3.5 text-admin-accent shrink-0 mt-0.5" />
                                        )}
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          }

                          if (fieldKey === 'career_role' || fieldKey === 'experience_level') {
                            const exps = (fieldOptions.experience_level || DEFAULT_EXPERIENCE_OPTIONS).filter((o) => o.enabled !== false)
                            return (
                              <div key={fieldKey} className="space-y-1.5">
                                <label className="text-xs font-medium text-admin-fg capitalize flex items-center justify-between">
                                  <span>{label}</span>
                                  <span className="text-[10px] text-admin-accent font-mono">Required</span>
                                </label>
                                <div className="grid grid-cols-2 gap-1.5">
                                  {exps.map((option) => {
                                    const isSelected = selectedPreviewExp === option.id
                                    return (
                                      <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => setSelectedPreviewExp(option.id)}
                                        className={cn(
                                          'p-2 rounded-lg border text-left flex items-center justify-between gap-1 transition-all',
                                          isSelected
                                            ? 'border-admin-accent bg-admin-accent-soft text-admin-fg font-semibold'
                                            : 'border-admin-border bg-admin-surface text-admin-fg-muted'
                                        )}
                                      >
                                        <span className="text-xs truncate">{option.label}</span>
                                        {isSelected && <Check className="w-3 h-3 text-admin-accent shrink-0" />}
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          }

                          return (
                            <div key={fieldKey} className="space-y-1.5">
                              <label className="text-xs font-medium text-admin-fg capitalize flex items-center justify-between">
                                <span>{label}</span>
                                <span className="text-[10px] text-admin-accent font-mono">Required</span>
                              </label>
                              <div className="p-2.5 text-xs rounded-lg border border-admin-border bg-admin-surface text-admin-fg-subtle">
                                Enter {label.toLowerCase()}...
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>

                    {/* Preview Stepper Navigation Controls */}
                    <div className="flex items-center justify-between pt-4 border-t border-admin-border">
                      <button
                        type="button"
                        onClick={() => setPreviewStepIndex((p) => Math.max(0, p - 1))}
                        disabled={previewStepIndex === 0}
                        className="inline-flex items-center gap-1 text-xs text-admin-fg-muted hover:text-admin-fg disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" /> Back
                      </button>

                      <div className="flex gap-1">
                        {data.steps.map((_, sIdx) => (
                          <button
                            key={sIdx}
                            type="button"
                            onClick={() => setPreviewStepIndex(sIdx)}
                            className={cn(
                              'w-2 h-2 rounded-full transition-all',
                              previewStepIndex === sIdx ? 'w-5 bg-admin-accent' : 'bg-admin-surface-raised'
                            )}
                            aria-label={`Jump to step ${sIdx + 1}`}
                          />
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => setPreviewStepIndex((p) => Math.min(data.steps.length - 1, p + 1))}
                        disabled={previewStepIndex >= data.steps.length - 1}
                        className="inline-flex items-center gap-1 text-xs font-bold text-admin-accent hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        {previewStepIndex === data.steps.length - 1 ? 'Finish' : 'Next'} <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-admin-fg-muted">
                    Add steps to see preview.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
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
