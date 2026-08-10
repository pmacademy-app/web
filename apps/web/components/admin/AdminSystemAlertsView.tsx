'use client'

import React, { useState, useEffect } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, ShieldAlert, Filter, RefreshCw, Clock } from 'lucide-react'

export interface SystemErrorAlert {
  id: string
  timestamp: string
  severity: 'critical' | 'error' | 'warning'
  category: 'auth' | 'verification' | 'queue' | 'resend' | 'webhook' | 'cron' | 'system'
  status: 'new' | 'acknowledged' | 'resolved'
  operation: string
  message: string
  template_key?: string | null
  queue_id?: string | null
  resend_id?: string | null
  user_id?: string | null
  details?: Record<string, unknown>
}

export function AdminSystemAlertsView() {
  const [alerts, setAlerts] = useState<SystemErrorAlert[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [statusFilter, setStatusFilter] = useState<string>('new')
  const [severityFilter, setSeverityFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [unackCriticalCount, setUnackCriticalCount] = useState<number>(0)

  const loadAlerts = async () => {
    setLoading(true)
    try {
      const query = new URLSearchParams({
        status: statusFilter,
        severity: severityFilter,
        category: categoryFilter,
      })
      const res = await fetch(`/api/admin/system/alerts?${query.toString()}`)
      const data = await res.json()

      if (data.success) {
        setAlerts(data.alerts || [])
        setUnackCriticalCount(data.unacknowledgedCriticalCount || 0)
      }
    } catch (err) {
      console.error('[AdminSystemAlertsView] Error loading alerts:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAlerts()
  }, [statusFilter, severityFilter, categoryFilter])

  const handleUpdateStatus = async (alertId: string, newStatus: 'acknowledged' | 'resolved') => {
    try {
      const res = await fetch('/api/admin/system/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId, newStatus }),
      })
      const data = await res.json()
      if (data.success) {
        setAlerts((prev) => prev.filter((a) => a.id !== alertId))
        void loadAlerts()
      }
    } catch (err) {
      console.error('[AdminSystemAlertsView] Error updating status:', err)
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 sm:p-6 bg-card border border-border rounded-2xl shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-foreground">System Errors &amp; Alerts</h2>
              {unackCriticalCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-extrabold animate-pulse">
                  {unackCriticalCount} Critical
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sanitized, deduplicated operational log of failures across Auth, Verification, Queue, Resend, and Cron.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void loadAlerts()}
          className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-border bg-card hover:bg-secondary/40 text-foreground transition-colors flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Logs</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-card/50 border border-border rounded-xl">
        {/* Status Tabs */}
        <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl">
          {['new', 'acknowledged', 'resolved', 'all'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg capitalize transition-colors cursor-pointer ${
                statusFilter === st
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Category & Severity Selectors */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-muted-foreground font-medium">Severity:</span>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="px-2.5 py-1 text-xs rounded-lg border border-input bg-card text-foreground focus:outline-none"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="error">Error</option>
              <option value="warning">Warning</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground font-medium">Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-2.5 py-1 text-xs rounded-lg border border-input bg-card text-foreground focus:outline-none"
            >
              <option value="all">All Categories</option>
              <option value="auth">Auth</option>
              <option value="verification">Verification</option>
              <option value="queue">Queue</option>
              <option value="resend">Resend</option>
              <option value="webhook">Webhook</option>
              <option value="cron">Cron</option>
              <option value="system">System</option>
            </select>
          </div>
        </div>
      </div>

      {/* Alert Log List */}
      {loading ? (
        <div className="p-12 text-center text-xs text-muted-foreground">Loading system alerts...</div>
      ) : alerts.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-border rounded-2xl bg-card/30">
          <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2 opacity-80" />
          <h3 className="text-sm font-bold text-foreground">No System Alerts Found</h3>
          <p className="text-xs text-muted-foreground mt-1">
            No operational failure records match the current status and filter criteria.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => {
            const isCritical = alert.severity === 'critical'
            const isError = alert.severity === 'error'

            return (
              <div
                key={alert.id}
                className={`p-4 rounded-xl border transition-colors ${
                  isCritical
                    ? 'bg-destructive/5 border-destructive/30'
                    : isError
                    ? 'bg-amber-500/5 border-amber-500/30'
                    : 'bg-card border-border'
                }`}
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    {isCritical ? (
                      <ShieldAlert className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                    ) : isError ? (
                      <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            isCritical
                              ? 'bg-destructive text-destructive-foreground'
                              : isError
                              ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                              : 'bg-blue-500/20 text-blue-700 dark:text-blue-300'
                          }`}
                        >
                          {alert.severity}
                        </span>

                        <span className="px-2 py-0.5 rounded bg-secondary text-secondary-foreground text-[10px] font-mono uppercase">
                          {alert.category}
                        </span>

                        <span className="text-xs font-bold text-foreground font-mono">{alert.operation}</span>

                        <span className="text-[11px] text-muted-foreground flex items-center gap-1 ml-auto sm:ml-0">
                          <Clock className="w-3 h-3" />
                          {new Date(alert.timestamp).toLocaleString()}
                        </span>
                      </div>

                      <p className="text-xs font-mono text-foreground mt-2 break-all bg-background/60 p-2 rounded border border-border">
                        {alert.message}
                      </p>

                      {(alert.template_key || alert.queue_id || alert.resend_id) && (
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground mt-2 font-mono">
                          {alert.template_key && <span>Template: {alert.template_key}</span>}
                          {alert.queue_id && <span>Queue ID: {alert.queue_id}</span>}
                          {alert.resend_id && <span>Resend ID: {alert.resend_id}</span>}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Status Action Buttons */}
                  {alert.status === 'new' && (
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => void handleUpdateStatus(alert.id, 'acknowledged')}
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-border bg-card hover:bg-secondary/40 text-foreground transition-colors cursor-pointer"
                      >
                        Acknowledge
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleUpdateStatus(alert.id, 'resolved')}
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors cursor-pointer"
                      >
                        Resolve
                      </button>
                    </div>
                  )}

                  {alert.status === 'acknowledged' && (
                    <button
                      type="button"
                      onClick={() => void handleUpdateStatus(alert.id, 'resolved')}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shrink-0 self-end sm:self-center cursor-pointer"
                    >
                      Mark Resolved
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
