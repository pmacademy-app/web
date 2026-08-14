'use client'

import React, { useState } from 'react'
import { ShieldCheck, Mail, AlertTriangle, CheckCircle2, Lock, Zap, Clock } from 'lucide-react'
import type { EmailAutomationsState, EmailAutomationMeta } from '@/lib/notifications/automations/types'

interface AdminEmailAutomationsViewProps {
  initialState: EmailAutomationsState
}

export function AdminEmailAutomationsView({ initialState }: AdminEmailAutomationsViewProps) {
  const [state, setState] = useState<EmailAutomationsState>(initialState)
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
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
      } else {
        setError(data.error || 'Failed to update global pause.')
      }
    } catch {
      setError('Network error updating global pause.')
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
      } else {
        setError(data.error || 'Failed to toggle automation.')
      }
    } catch {
      setError('Network error updating automation.')
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
      } else {
        setError(data.error || 'Failed to update daily limit.')
      }
    } catch {
      setError('Network error updating daily limit.')
    } finally {
      setLoadingKey(null)
    }
  }

  const criticalAuth = state.automations.filter((a) => a.isCritical)
  const optionalTransactional = state.automations.filter((a) => !a.isCritical && a.category === 'Transactional' && !a.isDeferred)
  const scheduledAutomations = state.automations.filter((a) => a.category === 'Scheduled')

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
            <p className="text-sm font-bold font-mono text-admin-success">
              {state.resendOutboundCount} / 100 limit
            </p>
          </div>
          <div className="w-px h-8 bg-admin-border"></div>
          <div className="text-right">
            <span className="text-xs text-admin-fg-muted">Prodily Automation Quota</span>
            <p className="text-sm font-bold font-mono text-admin-warning">
              {state.dailySentCount} / {state.dailyLimit} sent
            </p>
          </div>

          <select
            value={state.dailyLimit}
            disabled={loadingKey === 'daily_limit'}
            onChange={(e) => handleUpdateDailyLimit(Number(e.target.value))}
            className="px-3 py-2 rounded-lg bg-admin-bg border border-admin-border text-xs text-admin-fg font-mono focus:outline-none focus:border-admin-accent/50 cursor-pointer"
          >
            <option value={50}>50 / day</option>
            <option value={100}>100 / day (Default)</option>
            <option value={250}>250 / day</option>
            <option value={500}>500 / day</option>
          </select>
        </div>
      </div>

      {/* Section 1: Critical Authentication Emails (Always On) */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-admin-success" />
          <h3 className="text-sm font-bold text-admin-fg uppercase tracking-wider">Critical Authentication Emails (Protected)</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {criticalAuth.map((item) => (
            <div key={item.key} className="p-5 rounded-xl bg-admin-bg/80 border border-admin-success/25 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-admin-fg">{item.name}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-admin-success-soft text-admin-success border border-admin-success/25">
                    Always On
                  </span>
                </div>
                <p className="text-xs text-admin-fg-muted">{item.description}</p>
                <p className="text-[10px] text-admin-fg-subtle font-mono">Bypasses queue &amp; optional global pause via Supabase Auth Hook</p>
              </div>
              <CheckCircle2 className="w-5 h-5 text-admin-success shrink-0 mt-0.5" />
            </div>
          ))}
        </div>
      </div>

      {/* Section 2: Optional Transactional Automations */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-admin-accent" />
          <h3 className="text-sm font-bold text-admin-fg uppercase tracking-wider">Optional Event Automations</h3>
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

      {/* Section 3: Scheduled Digests & Reminders */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-admin-info" />
          <h3 className="text-sm font-bold text-admin-fg uppercase tracking-wider">Scheduled Digests &amp; Reminders</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {scheduledAutomations.map((item) => (
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
