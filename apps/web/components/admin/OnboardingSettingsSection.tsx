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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AdminSection } from './AdminSection'
import { AdminToggle } from './AdminToggle'
import { SettingRow } from './SettingRow'
import type { OnboardingSettings, OnboardingStepConfig, SettingsSectionKey } from '@/lib/admin/types'

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

// Preset recommended profile attributes
const PRESET_FIELDS: Array<{ key: string; label: string; description: string }> = [
  { key: 'goal', label: 'Primary Goal', description: 'Career path or study objective (job search, fill gaps, etc.)' },
  { key: 'career_role', label: 'Target PM Role', description: 'Current or aspiring product role title' },
  { key: 'learning_purpose', label: 'Learning Purpose', description: 'Personal motivation and outcome expectations' },
  { key: 'name', label: 'Full Name', description: 'Learner display name on certificates and profile' },
  { key: 'username', label: 'Unique Username', description: 'Handle used for public portfolio URL' },
  { key: 'linkedin_url', label: 'LinkedIn Profile', description: 'URL to learner professional network profile' },
  { key: 'website_url', label: 'Portfolio Website', description: 'URL to personal product portfolio or resume' },
]

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
    const newId = `step_${Date.now().toString(36)}`
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

  const activePreviewStep = data.steps[previewStepIndex] || data.steps[0]

  return (
    <div className="space-y-6">
      {/* General Controls */}
      <AdminSection
        title="Onboarding Status"
        icon={Users}
        iconColor="text-admin-accent"
        meta="Global learner onboarding activation"
      >
        <SettingRow
          label="Enable Onboarding Flow"
          description="When enabled, newly registered users are guided through the multi-step profile builder before unlocking the curriculum."
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
        <div className={cn(showPreview ? 'lg:col-span-7' : 'lg:col-span-12', 'space-y-4')}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-admin-fg flex items-center gap-2">
                <LayoutList className="w-4 h-4 text-admin-accent" />
                Configured Onboarding Sequence ({data.steps.length} {data.steps.length === 1 ? 'Step' : 'Steps'})
              </h3>
              <p className="text-xs text-admin-fg-muted mt-0.5">
                Define and order the sequence of questions shown to new students.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-admin-border bg-admin-surface text-admin-fg-muted hover:text-admin-fg hover:bg-admin-surface-raised transition-colors"
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-admin-accent text-admin-bg hover:bg-admin-accent/90 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add First Step
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {data.steps.map((step, index) => (
                <div
                  key={step.id}
                  className="p-4 rounded-xl border border-admin-border bg-admin-surface hover:border-admin-border-strong transition-colors space-y-4 shadow-sm"
                >
                  {/* Step Card Header */}
                  <div className="flex items-center justify-between border-b border-admin-border pb-3">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-admin-accent/15 text-admin-accent border border-admin-accent/30">
                        Step {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="text-[11px] font-mono text-admin-fg-muted">
                        ID: {step.id}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Reorder Up */}
                      <button
                        type="button"
                        onClick={() => moveStep(index, 'up')}
                        disabled={index === 0 || isSaving}
                        title="Move Up"
                        className="p-1 rounded text-admin-fg-muted hover:text-admin-fg hover:bg-admin-surface-raised disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>

                      {/* Reorder Down */}
                      <button
                        type="button"
                        onClick={() => moveStep(index, 'down')}
                        disabled={index === data.steps.length - 1 || isSaving}
                        title="Move Down"
                        className="p-1 rounded text-admin-fg-muted hover:text-admin-fg hover:bg-admin-surface-raised disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => removeStep(index)}
                        disabled={isSaving}
                        title="Delete Step"
                        className="p-1 rounded text-admin-danger hover:bg-admin-danger-soft/50 transition-colors ml-1"
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
                        placeholder="e.g. This helps us customize your cohort recommendations and curriculum pace."
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

                    {/* Interactive Chips Selector */}
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
                                ? 'bg-admin-accent/15 border-admin-accent/40 text-admin-accent shadow-xs'
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
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border bg-admin-purple-soft/50 border-admin-purple/30 text-admin-purple font-mono"
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

                    {/* Custom Tag Input */}
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
                        placeholder="Add custom metadata key..."
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

              {/* Add Step Button */}
              <button
                type="button"
                onClick={addStep}
                disabled={isSaving}
                className="w-full py-3 rounded-xl border border-dashed border-admin-border text-admin-fg-muted hover:text-admin-accent hover:border-admin-accent/50 bg-admin-surface-raised/20 hover:bg-admin-accent/5 flex items-center justify-center gap-2 text-xs font-bold transition-colors"
              >
                <Plus className="w-4 h-4" /> Add Step to Onboarding Sequence
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Live Onboarding Flow Preview */}
        {showPreview && (
          <div className="lg:col-span-5 space-y-3">
            <div className="sticky top-6">
              <div className="flex items-center justify-between px-1 mb-2">
                <span className="text-xs font-bold text-admin-fg flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-admin-accent" />
                  Learner Onboarding Preview
                </span>
                <span className="text-[10px] font-mono text-admin-fg-muted">
                  Interactive Simulator
                </span>
              </div>

              {/* Preview Container Mocking /onboarding Screen */}
              <div className="rounded-2xl border border-admin-border bg-admin-bg p-5 shadow-lg space-y-5">
                {/* Simulated Stepper Progress */}
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
                          No required input fields at this step.
                        </div>
                      ) : (
                        activePreviewStep.requiredFields.map((fieldKey) => {
                          const preset = PRESET_FIELDS.find((p) => p.key === fieldKey)
                          const label = preset ? preset.label : fieldKey.replace(/_/g, ' ')

                          return (
                            <div key={fieldKey} className="space-y-1">
                              <label className="text-xs font-medium text-admin-fg capitalize flex items-center justify-between">
                                <span>{label}</span>
                                <span className="text-[10px] text-admin-accent font-mono">Required</span>
                              </label>
                              {fieldKey === 'goal' ? (
                                <div className="space-y-1.5">
                                  {['Transition to PM', 'Level Up Skills', 'Build a Portfolio'].map((option, idx) => (
                                    <div
                                      key={option}
                                      className={cn(
                                        'p-2.5 rounded-lg border text-xs flex items-center justify-between',
                                        idx === 0
                                          ? 'border-admin-accent bg-admin-accent/10 text-admin-fg'
                                          : 'border-admin-border bg-admin-surface text-admin-fg-muted'
                                      )}
                                    >
                                      <span>{option}</span>
                                      <div
                                        className={cn(
                                          'w-3.5 h-3.5 rounded-full border flex items-center justify-center',
                                          idx === 0 ? 'border-admin-accent' : 'border-admin-border'
                                        )}
                                      >
                                        {idx === 0 && <div className="w-2 h-2 rounded-full bg-admin-accent" />}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="p-2 text-xs rounded-lg border border-admin-border bg-admin-surface text-admin-fg-subtle">
                                  Enter {label.toLowerCase()}...
                                </div>
                              )}
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
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-admin-accent text-admin-bg hover:bg-admin-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
        >
          <Save className="w-3.5 h-3.5" />
          {isSaving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}
