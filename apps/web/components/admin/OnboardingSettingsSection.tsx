'use client'

import React from 'react'
import { Users, LayoutList } from 'lucide-react'
import { AdminPageHeader } from './AdminPageHeader'
import { AdminSection } from './AdminSection'
import { AdminToggle } from './AdminToggle'
import { SettingRow } from './SettingRow'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { OnboardingSettings, SettingsSectionKey } from '@/lib/admin/types'

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

export function OnboardingSettingsSection({
  data,
  onChange,
  onSave,
  onReset,
  isDirty,
  isSaving,
}: OnboardingSettingsSectionProps) {
  const handleToggleEnabled = (enabled: boolean) => {
    onChange({ enabled })
  }

  const handleStepChange = (index: number, field: string, value: string) => {
    const newSteps = [...data.steps]
    newSteps[index] = { ...newSteps[index], [field]: value }
    onChange({ steps: newSteps })
  }

  const addStep = () => {
    onChange({
      steps: [
        ...data.steps,
        {
          id: `step_${Date.now()}`,
          title: 'New Step',
          description: 'Description here',
          requiredFields: []
        }
      ]
    })
  }

  const removeStep = (index: number) => {
    const newSteps = [...data.steps]
    newSteps.splice(index, 1)
    onChange({ steps: newSteps })
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Onboarding Settings"
        description="Configure the new user onboarding flow, including steps and required fields."
        icon={Users}
        iconColor="text-admin-accent"
      />

      <AdminSection title="General" icon={LayoutList} meta="Enable or disable onboarding">
        <SettingRow
          label="Enable Onboarding"
          description="If enabled, new users will go through the onboarding flow after signup."
        >
          <AdminToggle
            pressed={data.enabled}
            onPressedChange={handleToggleEnabled}
            disabled={isSaving}
          />
        </SettingRow>
      </AdminSection>

      <AdminSection title="Steps Configuration" icon={LayoutList} meta="Define the onboarding sequence">
        {data.steps.map((step, index) => (
          <div key={step.id} className="p-4 border border-border rounded-xl space-y-4 mb-4 bg-card">
            <div className="flex justify-between items-center">
              <h4 className="font-bold text-sm">Step {index + 1}</h4>
              <Button variant="destructive" size="sm" onClick={() => removeStep(index)} disabled={isSaving}>
                Remove
              </Button>
            </div>
            
            <SettingRow label="Title" description="The main heading for this step.">
              <Input
                value={step.title}
                onChange={(e) => handleStepChange(index, 'title', e.target.value)}
                disabled={isSaving}
              />
            </SettingRow>
            
            <SettingRow label="Description" description="Subtitle or description text.">
              <Input
                value={step.description}
                onChange={(e) => handleStepChange(index, 'description', e.target.value)}
                disabled={isSaving}
              />
            </SettingRow>
            
            <SettingRow label="Required Fields" description="Comma separated list of required fields (e.g. goal, role).">
              <Input
                value={step.requiredFields.join(', ')}
                onChange={(e) => {
                  const fields = e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                  const newSteps = [...data.steps]
                  newSteps[index] = { ...newSteps[index], requiredFields: fields }
                  onChange({ steps: newSteps })
                }}
                disabled={isSaving}
              />
            </SettingRow>
          </div>
        ))}
        
        <Button variant="outline" onClick={addStep} disabled={isSaving}>
          + Add Step
        </Button>
      </AdminSection>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 border-t border-admin-border pt-4">
        <Button
          variant="outline"
          onClick={onReset}
          disabled={!isDirty || isSaving}
        >
          Reset
        </Button>
        <Button onClick={onSave} disabled={!isDirty || isSaving}>
          {isSaving ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>
    </div>
  )
}
