'use client'

import React, { useState } from 'react'
import { Target, Clock, Save, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useApiQuery } from '@/lib/api/hooks'
import { apiPost } from '@/lib/api/client'
import { useDirtyFormGuard, areFormsEqual } from '@/hooks/use-dirty-form-guard'
import type { GoalGetResponse } from '@/lib/api/contracts/settings'

const LESSON_GOAL_OPTIONS = [
  { value: '', label: 'No goal set' },
  { value: '1', label: '1 lesson per week' },
  { value: '2', label: '2 lessons per week' },
  { value: '3', label: '3 lessons per week (Recommended)' },
  { value: '4', label: '4 lessons per week' },
  { value: '5', label: '5 lessons per week' },
  { value: '6', label: '6 lessons per week' },
  { value: '7', label: '7 lessons per week' },
]

const SESSION_MINUTE_OPTIONS = [
  { value: '', label: 'No preference' },
  { value: '10', label: '10 minutes' },
  { value: '15', label: '15 minutes' },
  { value: '20', label: '20 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '45', label: '45 minutes' },
  { value: '60', label: '60 minutes' },
]

interface WeeklyGoalFormContentProps {
  goalData?: GoalGetResponse | null
  onSaveSuccess: () => void
}

function WeeklyGoalFormContent({ goalData, onSaveSuccess }: WeeklyGoalFormContentProps) {
  const initialWeeklyGoal = goalData?.weekly_goal_lessons ? String(goalData.weekly_goal_lessons) : ''
  const initialSessionMinutes = goalData?.session_minutes ? String(goalData.session_minutes) : ''

  const [persistedData, setPersistedData] = useState({
    weeklyGoal: initialWeeklyGoal,
    sessionMinutes: initialSessionMinutes,
  })

  const [formData, setFormData] = useState({
    weeklyGoal: initialWeeklyGoal,
    sessionMinutes: initialSessionMinutes,
  })

  const [saving, setSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const isDirty = !areFormsEqual(formData, persistedData)
  useDirtyFormGuard(isDirty)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return

    setSaving(true)
    setErrorMessage(null)
    setSuccessMessage(false)

    try {
      const res = await apiPost<{ success: boolean; error?: string }>('/api/settings/goal', {
        weekly_goal_lessons: formData.weeklyGoal ? parseInt(formData.weeklyGoal, 10) : null,
        session_minutes: formData.sessionMinutes ? parseInt(formData.sessionMinutes, 10) : null,
      })

      if (res.ok && res.data.success) {
        setPersistedData({ ...formData })
        setSuccessMessage(true)
        onSaveSuccess()
        setTimeout(() => setSuccessMessage(false), 3000)
      } else {
        const errorText = !res.ok ? res.error.message : (res.data.error || 'Failed to update weekly goal.')
        setErrorMessage(errorText)
      }
    } catch {
      setErrorMessage('Failed to update weekly goal. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-primary" />
            Weekly Learning Goal
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Set your target pace for weekly progress recaps and milestone check-ins.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        <div className="space-y-1">
          <label htmlFor="settings-weekly-goal-lessons" className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-primary" /> Lessons per week
          </label>
          <select
            id="settings-weekly-goal-lessons"
            value={formData.weeklyGoal}
            onChange={(e) => setFormData({ ...formData, weeklyGoal: e.target.value })}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base md:text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {LESSON_GOAL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="settings-session-minutes" className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-primary" /> Target session length
          </label>
          <select
            id="settings-session-minutes"
            value={formData.sessionMinutes}
            onChange={(e) => setFormData({ ...formData, sessionMinutes: e.target.value })}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base md:text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {SESSION_MINUTE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2 border-t border-border/60">
        <div className="flex-1">
          {successMessage && (
            <span className="text-xs font-semibold text-success flex items-center gap-1.5 animate-in fade-in-0" role="status">
              <CheckCircle2 className="w-4 h-4 shrink-0" /> Goal updated successfully!
            </span>
          )}
          {errorMessage && (
            <span className="text-xs font-semibold text-destructive flex items-center gap-1.5 animate-in fade-in-0" role="alert">
              <AlertCircle className="w-4 h-4 shrink-0" /> {errorMessage}
            </span>
          )}
          {!successMessage && !errorMessage && isDirty && (
            <span className="text-[11px] font-medium text-warning bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-md">
              Unsaved changes
            </span>
          )}
        </div>

        <Button
          type="submit"
          disabled={saving || !isDirty}
          size="sm"
          className="flex items-center gap-2 font-semibold shadow-2xs shrink-0"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save Goal
        </Button>
      </div>
    </form>
  )
}

export function WeeklyGoalCard() {
  const { data, isLoading, mutate } = useApiQuery<GoalGetResponse>('/api/settings/goal')

  if (isLoading && !data) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-center text-muted-foreground text-xs py-6">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        <span>Loading goal settings...</span>
      </div>
    )
  }

  const key = data ? `${data.weekly_goal_lessons ?? 'none'}-${data.session_minutes ?? 'none'}` : 'empty'

  return (
    <WeeklyGoalFormContent
      key={key}
      goalData={data}
      onSaveSuccess={() => void mutate()}
    />
  )
}
