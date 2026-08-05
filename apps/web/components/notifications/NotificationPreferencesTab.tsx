'use client'

import React, { useState, useEffect } from 'react'
import { Bell, Clock, Save, CheckCircle2 } from 'lucide-react'

export function NotificationPreferencesTab() {
  const [loading, setLoading] = useState<boolean>(true)
  const [saving, setSaving] = useState<boolean>(false)
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false)
  const [preferences, setPreferences] = useState<{
    inAppEnabled: boolean
    emailEnabled: boolean
    reminderHour: number
    categories: {
      learning: { inApp: boolean; email: boolean }
      achievements: { inApp: boolean; email: boolean }
      security: { inApp: boolean; email: boolean }
      marketing: { inApp: boolean; email: boolean }
    }
  }>({
    inAppEnabled: true,
    emailEnabled: true,
    reminderHour: 20,
    categories: {
      learning: { inApp: true, email: true },
      achievements: { inApp: true, email: true },
      security: { inApp: true, email: true },
      marketing: { inApp: false, email: false },
    },
  })

  useEffect(() => {
    const fetchPrefs = async () => {
      try {
        const res = await fetch('/api/settings/notifications')
        const data = await res.json()
        if (data.success && data.preferences) {
          const p = data.preferences
          setPreferences({
            inAppEnabled: p.in_app_enabled ?? true,
            emailEnabled: p.email_enabled ?? true,
            reminderHour: p.preferred_reminder_hour ?? 20,
            categories: {
              learning: {
                inApp: p.learning_in_app ?? true,
                email: p.learning_email ?? true,
              },
              achievements: {
                inApp: p.achievements_in_app ?? true,
                email: p.achievements_email ?? true,
              },
              security: {
                inApp: p.security_in_app ?? true,
                email: p.security_email ?? true,
              },
              marketing: {
                inApp: p.marketing_in_app ?? false,
                email: p.marketing_email ?? false,
              },
            },
          })
        }
      } catch (err) {
        console.warn('[NotificationPreferencesTab] Error loading preferences:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchPrefs()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setSavedSuccess(false)
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

      const res = await fetch('/api/settings/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (data.success) {
        setSavedSuccess(true)
        setTimeout(() => setSavedSuccess(false), 3000)
      }
    } catch (err) {
      console.error('[NotificationPreferencesTab] Save error:', err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-xs text-muted-foreground">Loading notification settings...</div>
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
                setPreferences((prev) => ({ ...prev, inAppEnabled: e.target.checked }))
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
                setPreferences((prev) => ({ ...prev, emailEnabled: e.target.checked }))
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
                      setPreferences((prev) => ({
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
                      setPreferences((prev) => ({
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
              setPreferences((prev) => ({ ...prev, reminderHour: parseInt(e.target.value, 10) }))
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
      <div className="flex items-center justify-between pt-2">
        {savedSuccess ? (
          <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" />
            Preferences saved successfully!
          </span>
        ) : (
          <span />
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-xs cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>
    </div>
  )
}
