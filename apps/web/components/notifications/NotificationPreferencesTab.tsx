'use client'

import React, { useState, useRef } from 'react'
import { Bell, Clock, Save, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { useApiQuery } from '@/lib/api/hooks'
import { apiPatch } from '@/lib/api/client'
import { useDirtyFormGuard, areFormsEqual } from '@/hooks/use-dirty-form-guard'
import { showClientToast } from '@/lib/events/client-event-bus'
import type { NotificationPreferencesResponse } from '@/lib/api/contracts/settings'

type PreferencesState = ReturnType<typeof buildPreferencesState>

function buildPreferencesState(p?: NotificationPreferencesResponse['preferences']) {
  return {
    inAppEnabled: p?.in_app_enabled ?? true,
    emailEnabled: p?.email_enabled ?? true,
    reminderHour: p?.preferred_reminder_hour ?? 20,
    categories: {
      learning: {
        inApp: p?.learning_in_app ?? true,
        email: p?.learning_email ?? true,
      },
      achievements: {
        inApp: p?.achievements_in_app ?? true,
        email: p?.achievements_email ?? true,
      },
      security: {
        inApp: p?.security_in_app ?? true,
        email: p?.security_email ?? true,
      },
      marketing: {
        inApp: p?.marketing_in_app ?? false,
        email: p?.marketing_email ?? false,
      },
    },
  }
}

function NotificationPreferencesForm({
  initialPreferences,
  onSaveSuccess,
}: {
  initialPreferences?: NotificationPreferencesResponse['preferences']
  onSaveSuccess: () => void
}) {
  const [persistedPreferences, setPersistedPreferences] = useState<PreferencesState>(() => buildPreferencesState(initialPreferences))
  const [preferences, setPreferences] = useState<PreferencesState>(() => buildPreferencesState(initialPreferences))
  const [saving, setSaving] = useState<boolean>(false)
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const saveCountRef = useRef(0)

  const isDirty = !areFormsEqual(preferences, persistedPreferences)
  useDirtyFormGuard(isDirty)

  const handleSave = async () => {
    if (saving) return
    const currentSaveId = ++saveCountRef.current
    setSaving(true)
    setSavedSuccess(false)
    setErrorMessage(null)

    try {
      const payload = {
        in_app_enabled: preferences.inAppEnabled,
        email_enabled: preferences.emailEnabled,
        preferred_reminder_hour: preferences.reminderHour,
        learning_in_app: preferences.categories.learning.inApp,
        learning_email: preferences.categories.learning.email,
        achievements_in_app: preferences.categories.achievements.inApp,
        achievements_email: preferences.categories.achievements.email,
        security_in_app: preferences.categories.security.inApp,
        security_email: preferences.categories.security.email,
        marketing_in_app: preferences.categories.marketing.inApp,
        marketing_email: preferences.categories.marketing.email,
      }

      const res = await apiPatch<NotificationPreferencesResponse>('/api/settings/notifications', payload)

      if (currentSaveId !== saveCountRef.current) return

      if (res.ok && res.data.success) {
        setPersistedPreferences(preferences)
        setSavedSuccess(true)
        showClientToast('Preferences Saved', 'Your notification preferences have been successfully updated.', 'success')
        onSaveSuccess()
        setTimeout(() => setSavedSuccess(false), 3000)
      } else {
        const errorText = !res.ok ? res.error.message : ((res.data as unknown as { error?: string })?.error || 'Failed to update preferences. Please try again.')
        setErrorMessage(errorText)
        showClientToast('Save Failed', errorText, 'error')
      }
    } catch (err) {
      if (currentSaveId !== saveCountRef.current) return
      const errorText = err instanceof Error ? err.message : 'Network error updating preferences.'
      setErrorMessage(errorText)
      showClientToast('Save Failed', errorText, 'error')
    } finally {
      if (currentSaveId === saveCountRef.current) {
        setSaving(false)
      }
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Global Channel Master Controls */}
      <div className="p-5 rounded-2xl border border-border bg-card space-y-4">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" />
          Global Channel Permissions
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <label className="flex items-center justify-between p-3 rounded-xl border border-border bg-card/60 cursor-pointer hover:bg-secondary/40">
            <div>
              <span className="text-xs font-bold text-foreground block">In-App Notifications</span>
              <span className="text-[11px] text-muted-foreground">Alerts in bell menu & drawer</span>
            </div>
            <input
              type="checkbox"
              checked={preferences.inAppEnabled}
              onChange={(e) =>
                setPreferences((prev: PreferencesState) => ({ ...prev, inAppEnabled: e.target.checked }))
              }
              className="w-4 h-4 rounded text-primary border-border focus:ring-primary"
            />
          </label>

          <label className="flex items-center justify-between p-3 rounded-xl border border-border bg-card/60 cursor-pointer hover:bg-secondary/40">
            <div>
              <span className="text-xs font-bold text-foreground block">Email Notifications</span>
              <span className="text-[11px] text-muted-foreground">Transactional & milestone emails</span>
            </div>
            <input
              type="checkbox"
              checked={preferences.emailEnabled}
              onChange={(e) =>
                setPreferences((prev: PreferencesState) => ({ ...prev, emailEnabled: e.target.checked }))
              }
              className="w-4 h-4 rounded text-primary border-border focus:ring-primary"
            />
          </label>
        </div>
      </div>

      {/* Category Permissions Matrix */}
      <div className="p-5 rounded-2xl border border-border bg-card space-y-4">
        <h3 className="text-sm font-bold text-foreground">Notification Categories</h3>

        <div className="space-y-3">
          {(
            [
              { key: 'learning', title: 'Learning & Progress', desc: 'Module completion, SRS review reminders, streak milestones' },
              { key: 'achievements', title: 'Achievements & Badges', desc: 'New badges unlocked, level ups, certificate issuance' },
              { key: 'security', title: 'Security & Account', desc: 'Password resets, email verification, login alerts' },
              { key: 'marketing', title: 'Product Updates & News', desc: 'New features, cohort announcements, weekly digests' },
            ] as const
          ).map((cat) => (
            <div key={cat.key} className="p-3.5 rounded-xl border border-border/80 bg-card/40 flex items-center justify-between flex-wrap gap-3">
              <div>
                <h4 className="text-xs font-bold text-foreground">{cat.title}</h4>
                <p className="text-[11px] text-muted-foreground">{cat.desc}</p>
              </div>

              <div className="flex items-center gap-4 text-xs font-medium">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.categories[cat.key].inApp}
                    onChange={(e) =>
                      setPreferences((prev: PreferencesState) => ({
                        ...prev,
                        categories: {
                          ...prev.categories,
                          [cat.key]: { ...prev.categories[cat.key], inApp: e.target.checked },
                        },
                      }))
                    }
                    className="w-3.5 h-3.5 rounded text-primary border-border"
                  />
                  <span>In-App</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.categories[cat.key].email}
                    onChange={(e) =>
                      setPreferences((prev: PreferencesState) => ({
                        ...prev,
                        categories: {
                          ...prev.categories,
                          [cat.key]: { ...prev.categories[cat.key], email: e.target.checked },
                        },
                      }))
                    }
                    className="w-3.5 h-3.5 rounded text-primary border-border"
                  />
                  <span>Email</span>
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Reminder Hour Selection */}
      <div className="p-5 rounded-2xl border border-border bg-card space-y-3">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          Daily Reminder Schedule
        </h3>

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <p className="text-xs text-muted-foreground">
            Select the preferred time of day (local time) to receive study habit reminders.
          </p>

          <select
            value={preferences.reminderHour}
            onChange={(e) =>
              setPreferences((prev: PreferencesState) => ({ ...prev, reminderHour: parseInt(e.target.value, 10) }))
            }
            className="px-3 py-1.5 rounded-lg border border-input bg-card text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {Array.from({ length: 24 }).map((_, i) => (
              <option key={i} value={i}>
                {i === 0 ? '12:00 AM (Midnight)' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM (Noon)' : `${i - 12}:00 PM`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Save Trigger */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
        <div className="flex-1">
          {savedSuccess ? (
            <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5 animate-in fade-in-0" role="status">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Preferences saved successfully!
            </span>
          ) : errorMessage ? (
            <span className="text-xs font-semibold text-destructive flex items-center gap-1.5 animate-in fade-in-0" role="alert">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {errorMessage}
            </span>
          ) : isDirty ? (
            <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-md">
              Unsaved changes
            </span>
          ) : (
            <span />
          )}
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !isDirty}
          aria-disabled={saving || !isDirty}
          className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-xs cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>
    </div>
  )
}

export function NotificationPreferencesTab() {
  const { data, isLoading, mutate } = useApiQuery<NotificationPreferencesResponse>('/api/settings/notifications')

  if (isLoading && !data) {
    return <div className="p-8 text-center text-xs text-muted-foreground">Loading notification settings...</div>
  }

  return (
    <NotificationPreferencesForm
      key={data?.preferences ? 'loaded' : 'loading'}
      initialPreferences={data?.preferences}
      onSaveSuccess={() => void mutate()}
    />
  )
}
