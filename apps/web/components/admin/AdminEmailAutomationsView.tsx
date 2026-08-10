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
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-bold flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Global Master Control Banner */}
      <div className={`p-6 rounded-2xl border transition-all shadow-xl ${state.globalPause ? 'bg-amber-500/10 border-amber-500/30' : 'bg-slate-900/80 border-slate-800'}`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${state.globalPause ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
              <h2 className="text-base font-bold text-white">Global Non-Critical Email Master Switch</h2>
            </div>
            <p className="text-xs text-slate-400 max-w-xl">
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
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20'
                : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30'
            }`}
          >
            {state.globalPause ? <Zap className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            <span>{state.globalPause ? 'Resume Non-Critical Emails' : 'Pause All Non-Critical Emails'}</span>
          </button>
        </div>
      </div>

      {/* Daily Quota Protection Card */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-400" /> Resend Daily Quota Protection
          </h3>
          <p className="text-xs text-slate-400">
            Enforces a hard limit on optional automated emails sent per day. Quota is consumed ONLY after Resend accepts sending.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-xs text-slate-400">Today&apos;s Usage</span>
            <p className="text-sm font-bold font-mono text-amber-400">
              {state.dailySentCount} / {state.dailyLimit} sent
            </p>
          </div>

          <select
            value={state.dailyLimit}
            disabled={loadingKey === 'daily_limit'}
            onChange={(e) => handleUpdateDailyLimit(Number(e.target.value))}
            className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white font-mono focus:outline-none focus:border-amber-500/50 cursor-pointer"
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
          <Lock className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Critical Authentication Emails (Protected)</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {criticalAuth.map((item) => (
            <div key={item.key} className="p-5 rounded-xl bg-slate-950/80 border border-emerald-500/20 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-white">{item.name}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    Always On
                  </span>
                </div>
                <p className="text-xs text-slate-400">{item.description}</p>
                <p className="text-[10px] text-slate-500 font-mono">Bypasses queue &amp; optional global pause via Supabase Auth Hook</p>
              </div>
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            </div>
          ))}
        </div>
      </div>

      {/* Section 2: Optional Transactional Automations */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Optional Event Automations</h3>
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
          <Clock className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Scheduled Digests &amp; Reminders</h3>
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
        ? 'bg-slate-950/40 border-slate-800/60 opacity-60'
        : item.enabled
        ? 'bg-slate-900/80 border-slate-800'
        : 'bg-slate-950/60 border-slate-800/80'
    }`}>
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-sm text-white">{item.name}</span>
          <span className="text-[10px] font-mono text-slate-500">(`{item.key}`)</span>
          {item.isDeferred && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
              Deferred (Post-Launch)
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">{item.description}</p>
      </div>

      {!item.isDeferred && (
        <button
          type="button"
          disabled={isLoading}
          onClick={onToggle}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:opacity-50 mt-1 ${
            item.enabled ? 'bg-amber-400' : 'bg-slate-800'
          }`}
          role="switch"
          aria-checked={item.enabled}
          aria-label={`Toggle ${item.name}`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-slate-950 shadow-lg ring-0 transition duration-200 ease-in-out ${
              item.enabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      )}
    </div>
  )
}
