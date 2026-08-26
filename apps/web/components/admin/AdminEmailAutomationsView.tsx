'use client'

import React, { useState } from 'react'
import {
  ShieldCheck,
  Mail,
  AlertTriangle,
  Lock,
  Zap,
  Play,
  Calendar,
  Save,
  Loader2,
} from 'lucide-react'
import { useAdminToast } from './admin-toast'
import type {
  EmailAutomationsState,
  EmailAutomationMeta,
  EmailDigestSchedules,
} from '@/lib/notifications/automations/types'

interface AdminEmailAutomationsViewProps {
  initialState: EmailAutomationsState
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]

export function AdminEmailAutomationsView({ initialState }: AdminEmailAutomationsViewProps) {
  const { toast } = useAdminToast()
  const [state, setState] = useState<EmailAutomationsState>(initialState)
  const [schedules, setSchedules] = useState<EmailDigestSchedules>(
    initialState.digestSchedules || {
      weeklyRecap: { enabled: true, dayOfWeek: 1, hourUtc: 9, lastRunAt: null },
      dailyReminder: { enabled: true, hourUtc: 9, lastRunAt: null },
    }
  )

  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const [runningType, setRunningType] = useState<string | null>(null)
  const [savingSchedule, setSavingSchedule] = useState<'weekly' | 'daily' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleToggleGlobalPause = async () => {
    setLoadingKey('global_pause')
    setError(null)
    const nextState = !state.globalPause
    try {
      const res = await fetch('/api/admin/emails/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settingKey: 'global_pause', payload: { enabled: nextState } }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setState(data.state)
        toast(nextState ? 'Global email pause enabled.' : 'Global email pause deactivated.', 'info')
      } else {
        setError(data.error || 'Failed to update global pause.')
        toast(data.error || 'Failed to update global pause.', 'error')
      }
    } catch {
      setError('Network error updating global pause.')
      toast('Network error updating global pause.', 'error')
    } finally {
      setLoadingKey(null)
    }
  }

  const handleToggleAutomation = async (automationKey: string, currentEnabled: boolean) => {
    setLoadingKey(automationKey)
    setError(null)
    try {
      const res = await fetch('/api/admin/emails/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settingKey: 'toggle', payload: { automationKey, enabled: !currentEnabled } }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setState(data.state)
        toast(`Automation '${automationKey}' ${!currentEnabled ? 'enabled' : 'disabled'}.`, 'success')
      } else {
        setError(data.error || 'Failed to toggle automation.')
        toast(data.error || 'Failed to toggle automation.', 'error')
      }
    } catch {
      setError('Network error updating automation.')
      toast('Network error updating automation.', 'error')
    } finally {
      setLoadingKey(null)
    }
  }

  const handleUpdateDailyLimit = async (newLimit: number) => {
    setLoadingKey('daily_limit')
    setError(null)
    try {
      const res = await fetch('/api/admin/emails/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settingKey: 'daily_limit', payload: { limit: newLimit } }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setState(data.state)
        toast(`Daily limit updated to ${newLimit} emails.`, 'success')
      } else {
        setError(data.error || 'Failed to update daily limit.')
        toast(data.error || 'Failed to update daily limit.', 'error')
      }
    } catch {
      setError('Network error updating daily limit.')
      toast('Network error updating daily limit.', 'error')
    } finally {
      setLoadingKey(null)
    }
  }

  const handleSaveSchedule = async (type: 'weekly' | 'daily') => {
    setSavingSchedule(type)
    try {
      const res = await fetch('/api/admin/emails/automations/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weeklyRecap: type === 'weekly' ? schedules.weeklyRecap : undefined,
          dailyReminder: type === 'daily' ? schedules.dailyReminder : undefined,
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setSchedules(data.schedules)
        toast(`${type === 'weekly' ? 'Weekly Recap' : 'Daily Reminder'} schedule updated.`, 'success')
      } else {
        toast(data.error || 'Failed to save schedule.', 'error')
      }
    } catch {
      toast('Network error saving schedule.', 'error')
    } finally {
      setSavingSchedule(null)
    }
  }

  const handleRunNow = async (type: 'weekly_recap' | 'daily_reminder') => {
    setRunningType(type)
    try {
      const res = await fetch('/api/admin/emails/automations/run-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast(data.message || `Dispatched ${data.queuedCount} email(s).`, 'success')
      } else {
        toast(data.error || 'Manual dispatch failed.', 'error')
      }
    } catch {
      toast('Network error triggering manual run.', 'error')
    } finally {
      setRunningType(null)
    }
  }

  const criticalAuth = state.automations.filter((a) => a.isCritical)
  const optionalTransactional = state.automations.filter((a) => !a.isCritical && a.category === 'Transactional' && !a.isDeferred)

  return (
    <div className="space-y-8">
      {error && (
        <div className="p-4 rounded-xl bg-admin-danger-soft border border-admin-danger/25 text-admin-danger text-xs font-bold flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-admin-fg-muted hover:text-admin-fg">✕</button>
        </div>
      )}

      {/* Global Master Control Banner */}
      <div className={`p-6 rounded-2xl border transition-all shadow-xl ${state.globalPause ? 'bg-admin-warning-soft border-admin-warning/25' : 'bg-admin-surface border-admin-border'}`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${state.globalPause ? 'bg-admin-warning animate-pulse' : 'bg-admin-success'}`} />
              <h2 className="text-base font-bold text-admin-fg">Global Non-Critical Email Master Switch</h2>
            </div>
            <p className="text-xs text-admin-fg-muted max-w-xl">
              {state.globalPause
                ? 'PAUSED: All optional transactional and scheduled emails are currently held in queue. Critical Auth emails remain active.'
                : 'ACTIVE: Optional automated emails are dispatched normally according to individual toggles and daily quotas.'}
            </p>
          </div>

          <button
            type="button"
            disabled={loadingKey === 'global_pause'}
            onClick={handleToggleGlobalPause}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 ${
              state.globalPause
                ? 'bg-admin-accent hover:bg-admin-accent/90 text-admin-accent-fg shadow-lg shadow-admin-accent/20'
                : 'bg-admin-danger-soft hover:bg-admin-danger/20 text-admin-danger border border-admin-danger/25'
            }`}
          >
            {state.globalPause ? <Zap className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            <span>{state.globalPause ? 'Resume Non-Critical Emails' : 'Pause All Non-Critical Emails'}</span>
          </button>
        </div>
      </div>

      {/* Daily Quota Protection Card */}
      <div className="p-6 rounded-2xl bg-admin-surface border border-admin-border flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-admin-fg flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-admin-info" /> Resend Daily Quota Protection
          </h3>
          <p className="text-xs text-admin-fg-muted">
            Enforces a hard limit on optional automated emails sent per day. Quota is consumed ONLY after Resend accepts sending.
          </p>
        </div>

        <div className="flex items-center gap-8">
          <div className="text-right">
            <span className="text-xs text-admin-fg-muted">Resend Account Outbound</span>
            <div className="text-xl font-mono font-bold text-admin-fg">
              {state.resendOutboundCount} <span className="text-xs text-admin-fg-muted">/ 100 max</span>
            </div>
          </div>

          <div className="text-right border-l border-admin-border pl-6">
            <span className="text-xs text-admin-fg-muted">App Daily Limit</span>
            <div className="flex items-center gap-2 mt-1">
              <select
                aria-label="App Daily Send Limit"
                value={state.dailyLimit}
                disabled={loadingKey === 'daily_limit'}
                onChange={(e) => handleUpdateDailyLimit(Number(e.target.value))}
                className="px-3 py-1.5 rounded-lg border border-admin-border bg-admin-bg text-admin-fg text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-admin-accent cursor-pointer"
              >
                <option value={50}>50 / day</option>
                <option value={75}>75 / day</option>
                <option value={90}>90 / day</option>
                <option value={100}>100 / day</option>
                <option value={200}>200 / day</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Section 1: Critical Auth Notifications */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-admin-accent" />
          <h3 className="text-sm font-bold text-admin-fg uppercase tracking-wider">Critical Auth Notifications</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {criticalAuth.map((item) => (
            <div key={item.key} className="p-5 rounded-xl border border-admin-accent/20 bg-admin-accent-soft/30 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-admin-fg">{item.name}</span>
                  <span className="text-[10px] font-mono text-admin-accent font-semibold">(`{item.key}`)</span>
                </div>
                <p className="text-xs text-admin-fg-muted leading-relaxed">{item.description}</p>
              </div>
              <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-admin-accent/20 text-admin-accent border border-admin-accent/30 shrink-0">
                Always Active
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Section 2: Automated Digest Schedule Controls */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-admin-accent" />
          <h3 className="text-sm font-bold text-admin-fg uppercase tracking-wider">Automated Digest Schedules &amp; Triggers</h3>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Weekly Recap Card */}
          <div className="p-5 rounded-xl bg-admin-surface border border-admin-border space-y-4 shadow-md">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-0.5">
                <h4 className="text-sm font-bold text-admin-fg flex items-center gap-2">
                  <span>Weekly Recap Digest</span>
                  <span className="text-[10px] font-mono text-admin-accent">(`learning.weekly_recap`)</span>
                </h4>
                <p className="text-xs text-admin-fg-muted">
                  Sends weekly summary of XP, lessons, and streaks to active learners.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setSchedules((prev) => ({
                    ...prev,
                    weeklyRecap: { ...prev.weeklyRecap, enabled: !prev.weeklyRecap.enabled },
                  }))
                }
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                  schedules.weeklyRecap.enabled ? 'bg-admin-accent' : 'bg-admin-surface-raised'
                }`}
                role="switch"
                aria-checked={schedules.weeklyRecap.enabled}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-admin-bg shadow-lg ring-0 transition duration-200 ease-in-out ${
                    schedules.weeklyRecap.enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-admin-border">
              <div>
                <label className="block text-[11px] font-semibold text-admin-fg-muted mb-1">Dispatch Day (UTC)</label>
                <select
                  value={schedules.weeklyRecap.dayOfWeek}
                  onChange={(e) =>
                    setSchedules((prev) => ({
                      ...prev,
                      weeklyRecap: { ...prev.weeklyRecap, dayOfWeek: Number(e.target.value) },
                    }))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-admin-border bg-admin-bg text-admin-fg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-admin-accent"
                >
                  {DAYS_OF_WEEK.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-admin-fg-muted mb-1">Dispatch Time (UTC)</label>
                <select
                  value={schedules.weeklyRecap.hourUtc}
                  onChange={(e) =>
                    setSchedules((prev) => ({
                      ...prev,
                      weeklyRecap: { ...prev.weeklyRecap, hourUtc: Number(e.target.value) },
                    }))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-admin-border bg-admin-bg text-admin-fg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-admin-accent"
                >
                  {Array.from({ length: 24 }).map((_, i) => (
                    <option key={i} value={i}>
                      {String(i).padStart(2, '0')}:00 UTC
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-admin-border text-xs">
              <span className="text-[11px] text-admin-fg-muted">
                {schedules.weeklyRecap.lastRunAt
                  ? `Last run: ${new Date(schedules.weeklyRecap.lastRunAt).toLocaleString()}`
                  : 'No execution recorded yet'}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={runningType === 'weekly_recap'}
                  onClick={() => handleRunNow('weekly_recap')}
                  className="px-3 py-1.5 rounded-lg border border-admin-border text-xs font-semibold text-admin-fg hover:bg-admin-surface-raised transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {runningType === 'weekly_recap' ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Play className="w-3 h-3 text-admin-accent" />
                  )}
                  <span>Run Now</span>
                </button>

                <button
                  type="button"
                  disabled={savingSchedule === 'weekly'}
                  onClick={() => handleSaveSchedule('weekly')}
                  className="px-3.5 py-1.5 rounded-lg bg-admin-accent text-admin-accent-fg text-xs font-bold hover:bg-admin-accent/90 transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {savingSchedule === 'weekly' ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Save className="w-3 h-3" />
                  )}
                  <span>Save Schedule</span>
                </button>
              </div>
            </div>
          </div>

          {/* Daily Reminder Card */}
          <div className="p-5 rounded-xl bg-admin-surface border border-admin-border space-y-4 shadow-md">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-0.5">
                <h4 className="text-sm font-bold text-admin-fg flex items-center gap-2">
                  <span>Daily Study Reminder</span>
                  <span className="text-[10px] font-mono text-admin-accent">(`learning.daily_reminder`)</span>
                </h4>
                <p className="text-xs text-admin-fg-muted">
                  Sends daily SRS review reminders and streak freeze alerts to active learners.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setSchedules((prev) => ({
                    ...prev,
                    dailyReminder: { ...prev.dailyReminder, enabled: !prev.dailyReminder.enabled },
                  }))
                }
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                  schedules.dailyReminder.enabled ? 'bg-admin-accent' : 'bg-admin-surface-raised'
                }`}
                role="switch"
                aria-checked={schedules.dailyReminder.enabled}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-admin-bg shadow-lg ring-0 transition duration-200 ease-in-out ${
                    schedules.dailyReminder.enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-admin-border">
              <div>
                <label className="block text-[11px] font-semibold text-admin-fg-muted mb-1">Cadence</label>
                <div className="px-3 py-2 rounded-lg border border-admin-border bg-admin-bg/60 text-admin-fg text-xs font-semibold">
                  Every Day
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-admin-fg-muted mb-1">Dispatch Time (UTC)</label>
                <select
                  value={schedules.dailyReminder.hourUtc}
                  onChange={(e) =>
                    setSchedules((prev) => ({
                      ...prev,
                      dailyReminder: { ...prev.dailyReminder, hourUtc: Number(e.target.value) },
                    }))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-admin-border bg-admin-bg text-admin-fg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-admin-accent"
                >
                  {Array.from({ length: 24 }).map((_, i) => (
                    <option key={i} value={i}>
                      {String(i).padStart(2, '0')}:00 UTC
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-admin-border text-xs">
              <span className="text-[11px] text-admin-fg-muted">
                {schedules.dailyReminder.lastRunAt
                  ? `Last run: ${new Date(schedules.dailyReminder.lastRunAt).toLocaleString()}`
                  : 'No execution recorded yet'}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={runningType === 'daily_reminder'}
                  onClick={() => handleRunNow('daily_reminder')}
                  className="px-3 py-1.5 rounded-lg border border-admin-border text-xs font-semibold text-admin-fg hover:bg-admin-surface-raised transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {runningType === 'daily_reminder' ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Play className="w-3 h-3 text-admin-accent" />
                  )}
                  <span>Run Now</span>
                </button>

                <button
                  type="button"
                  disabled={savingSchedule === 'daily'}
                  onClick={() => handleSaveSchedule('daily')}
                  className="px-3.5 py-1.5 rounded-lg bg-admin-accent text-admin-accent-fg text-xs font-bold hover:bg-admin-accent/90 transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {savingSchedule === 'daily' ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Save className="w-3 h-3" />
                  )}
                  <span>Save Schedule</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: Optional Transactional Automations */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-admin-accent" />
          <h3 className="text-sm font-bold text-admin-fg uppercase tracking-wider">Transactional Automations</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {optionalTransactional.map((item) => (
            <AutomationCard
              key={item.key}
              item={item}
              loadingKey={loadingKey}
              onToggle={() => handleToggleAutomation(item.key, item.enabled)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function AutomationCard({
  item,
  loadingKey,
  onToggle,
}: {
  item: EmailAutomationMeta
  loadingKey: string | null
  onToggle: () => void
}) {
  const isLoading = loadingKey === item.key

  return (
    <div className={`p-5 rounded-xl border transition-all flex items-start justify-between gap-4 ${
      item.isDeferred
        ? 'bg-admin-bg/40 border-admin-border/60 opacity-60'
        : item.enabled
        ? 'bg-admin-surface border-admin-border'
        : 'bg-admin-bg/60 border-admin-border/80'
    }`}>
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-sm text-admin-fg">{item.name}</span>
          <span className="text-[10px] font-mono text-admin-fg-subtle">(`{item.key}`)</span>
          {item.isDeferred && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-admin-surface-raised text-admin-fg-muted border border-admin-border">
              Deferred (Post-Launch)
            </span>
          )}
        </div>
        <p className="text-xs text-admin-fg-muted leading-relaxed">{item.description}</p>
      </div>

      {!item.isDeferred && (
        <button
          type="button"
          disabled={isLoading}
          onClick={onToggle}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-admin-accent disabled:opacity-50 mt-1 ${
            item.enabled ? 'bg-admin-accent' : 'bg-admin-surface-raised'
          }`}
          role="switch"
          aria-checked={item.enabled}
          aria-label={`Toggle ${item.name}`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-admin-bg shadow-lg ring-0 transition duration-200 ease-in-out ${
              item.enabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      )}
    </div>
  )
}
