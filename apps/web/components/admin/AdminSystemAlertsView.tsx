'use client'

import React, { useState, useEffect } from 'react'
import { AlertCircle, AlertTriangle, ShieldAlert, Filter, RefreshCw, Clock, Inbox } from 'lucide-react'
import { useIsMounted } from '@/lib/admin/use-is-mounted'
import { AdminErrorState } from './AdminErrorState'
import { AdminEmptyState } from './AdminEmptyState'

export interface SystemErrorAlert {
  id: string
  timestamp: string
  severity: 'critical' | 'error' | 'warning'
  category: string
  status: 'new' | 'acknowledged' | 'resolved'
  operation: string
  message: string
  template_key?: string | null
  queue_id?: string | null
  resend_id?: string | null
  user_id?: string | null
  /** Structured taxonomy from the error pipeline. Null on pre-migration rows. */
  domain?: string | null
  kind?: string | null
  retryability?: string | null
  next_action?: string | null
  occurrence_count?: number | null
  first_seen_at?: string | null
  details?: Record<string, unknown>
}

const KIND_OPTIONS = [
  'all',
  'provider_quota',
  'provider_outage',
  'provider_timeout',
  'provider_rejected',
  'config_missing',
  'auth_failed',
  'db_unavailable',
  'validation',
  'unexpected',
] as const

const RETRYABILITY_OPTIONS = ['all', 'auto_retrying', 'manual_retry', 'terminal'] as const

const RETRYABILITY_LABELS: Record<string, string> = {
  auto_retrying: 'Retrying automatically',
  manual_retry: 'Needs a manual retry',
  terminal: 'Will not succeed on retry',
}

/** Reads the provider recorded in the sanitized details payload. */
function alertProvider(alert: SystemErrorAlert): string | null {
  const provider = alert.details?.provider
  return typeof provider === 'string' ? provider : null
}

/** Context fields safe to surface. Values are already redacted at write time (P8). */
function alertContext(alert: SystemErrorAlert): Array<{ label: string; value: string }> {
  const out: Array<{ label: string; value: string }> = []
  if (alert.template_key) out.push({ label: 'Template', value: alert.template_key })
  if (alert.queue_id) out.push({ label: 'Queue', value: alert.queue_id })
  if (alert.user_id) out.push({ label: 'User', value: alert.user_id })
  const masked = alert.details?.maskedEmail
  if (typeof masked === 'string') out.push({ label: 'Recipient', value: masked })
  const status = alert.details?.providerStatusCode
  if (typeof status === 'number') out.push({ label: 'Status', value: String(status) })
  if (alert.resend_id) out.push({ label: 'Provider ID', value: alert.resend_id })
  return out
}

export function AdminSystemAlertsView() {
  const [alerts, setAlerts] = useState<SystemErrorAlert[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [statusFilter, setStatusFilter] = useState<string>('new')
  const [severityFilter, setSeverityFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [unackCriticalCount, setUnackCriticalCount] = useState<number>(0)
  // A failed alerts query must never render as the green "no alerts" state — that made
  // a broken monitoring pipeline look identical to a healthy system.
  const [error, setError] = useState<string | null>(null)
  const [kindFilter, setKindFilter] = useState<string>('all')
  const [retryabilityFilter, setRetryabilityFilter] = useState<string>('all')
  const [providerFilter, setProviderFilter] = useState<string>('all')
  const [requestId, setRequestId] = useState<number>(0)
  const refresh = React.useCallback(() => setRequestId((n) => n + 1), [])
  const mounted = useIsMounted()

  const formatDateTime = (iso: string) => {
    if (!mounted || !iso) return ''
    try {
      return new Date(iso).toLocaleString()
    } catch {
      return iso
    }
  }

  // Inline effect + `requestId` refresh counter, matching AdminSystemErrorsView.
  // A `useCallback` loader invoked from the effect trips the lint rule against
  // synchronous setState inside an effect body.
  useEffect(() => {
    let isMounted = true
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const query = new URLSearchParams({
          status: statusFilter,
          severity: severityFilter,
          category: categoryFilter,
          // Facets below are applied client-side, so pull the API's maximum window.
          limit: '100',
        })
        const res = await fetch(`/api/admin/system/alerts?${query.toString()}`)
        const data = await res.json()
        if (!isMounted) return

        if (data.success) {
          setAlerts(data.alerts || [])
          setUnackCriticalCount(data.unacknowledgedCriticalCount || 0)
        } else {
          // Never fall back to an empty list: an empty list renders as the green
          // all-clear, which is indistinguishable from a healthy system.
          setAlerts([])
          setError(data.error || 'The alerts service returned an unexpected response.')
        }
      } catch (err) {
        console.error('[AdminSystemAlertsView] Error loading alerts:', err)
        if (isMounted) {
          setAlerts([])
          setError('Could not reach the alerts service. Check your connection and try again.')
        }
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    void run()
    return () => {
      isMounted = false
    }
  }, [statusFilter, severityFilter, categoryFilter, requestId])

  const providerOptions = React.useMemo(() => {
    const found = new Set<string>()
    for (const alert of alerts) {
      const provider = alertProvider(alert)
      if (provider) found.add(provider)
    }
    return ['all', ...Array.from(found).sort()]
  }, [alerts])

  const visibleAlerts = React.useMemo(
    () =>
      alerts.filter((alert) => {
        if (kindFilter !== 'all' && alert.kind !== kindFilter) return false
        if (retryabilityFilter !== 'all' && alert.retryability !== retryabilityFilter) return false
        if (providerFilter !== 'all' && alertProvider(alert) !== providerFilter) return false
        return true
      }),
    [alerts, kindFilter, retryabilityFilter, providerFilter]
  )

  const hasFacetFilter =
    kindFilter !== 'all' || retryabilityFilter !== 'all' || providerFilter !== 'all'

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
        refresh()
      }
    } catch (err) {
      console.error('[AdminSystemAlertsView] Error updating status:', err)
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 sm:p-6 bg-admin-surface border border-admin-border rounded-2xl shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-admin-danger-soft text-admin-danger flex items-center justify-center">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-admin-fg">System Errors &amp; Alerts</h2>
              {unackCriticalCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-admin-danger text-admin-fg text-[10px] font-extrabold animate-pulse">
                  {unackCriticalCount} Critical
                </span>
              )}
            </div>
            <p className="text-xs text-admin-fg-muted mt-0.5">
              Sanitized, deduplicated operational log of failures across Auth, Verification, Queue, Resend, and Cron.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={refresh}
          className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-admin-border bg-admin-surface hover:bg-admin-surface-raised text-admin-fg transition-colors flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Logs</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-admin-surface/50 border border-admin-border rounded-xl">
        {/* Status Tabs */}
        <div className="flex items-center gap-1 bg-admin-bg/60 p-1 rounded-xl">
          {['new', 'acknowledged', 'resolved', 'all'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg capitalize transition-colors cursor-pointer ${
                statusFilter === st
                  ? 'bg-admin-surface-raised text-admin-fg shadow-sm'
                  : 'text-admin-fg-muted hover:text-admin-fg'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Filters. Wraps: five selects do not fit one row on a phone. */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
          <div className="flex items-center gap-1.5 text-xs">
            <Filter className="w-3.5 h-3.5 text-admin-fg-muted" />
            <span className="text-admin-fg-muted font-medium">Severity:</span>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="px-2.5 py-1 text-xs rounded-lg border border-admin-border bg-admin-surface text-admin-fg focus:outline-none"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="error">Error</option>
              <option value="warning">Warning</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-admin-fg-muted font-medium">Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-2.5 py-1 text-xs rounded-lg border border-admin-border bg-admin-surface text-admin-fg focus:outline-none"
            >
              <option value="all">All Categories</option>
              <option value="auth">Auth</option>
              <option value="verification">Verification</option>
              <option value="queue">Queue</option>
              <option value="resend">Resend</option>
              <option value="webhook">Webhook</option>
              <option value="cron">Cron</option>
              <option value="system">System</option>
              <option value="brevo">Brevo</option>
              <option value="email">Email</option>
              <option value="admin">Admin</option>
              <option value="db">Database</option>
              <option value="api">API</option>
              <option value="config">Config</option>
            </select>
          </div>

          {/* Taxonomy facets. Applied to the loaded set rather than the query, since
              kind/retryability are not server filters and provider lives inside the
              JSONB details payload. */}
          <div className="flex items-center gap-1.5 text-xs">
            <label htmlFor="alert-kind-filter" className="text-admin-fg-muted font-medium">
              Kind:
            </label>
            <select
              id="alert-kind-filter"
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
              className="px-2.5 py-1 text-xs rounded-lg border border-admin-border bg-admin-surface text-admin-fg focus:outline-none"
            >
              {KIND_OPTIONS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind === 'all' ? 'All Kinds' : kind.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <label htmlFor="alert-retryability-filter" className="text-admin-fg-muted font-medium">
              Recovery:
            </label>
            <select
              id="alert-retryability-filter"
              value={retryabilityFilter}
              onChange={(e) => setRetryabilityFilter(e.target.value)}
              className="px-2.5 py-1 text-xs rounded-lg border border-admin-border bg-admin-surface text-admin-fg focus:outline-none"
            >
              {RETRYABILITY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === 'all' ? 'Any Recovery' : RETRYABILITY_LABELS[option]}
                </option>
              ))}
            </select>
          </div>

          {providerOptions.length > 1 && (
            <div className="flex items-center gap-1.5 text-xs">
              <label htmlFor="alert-provider-filter" className="text-admin-fg-muted font-medium">
                Provider:
              </label>
              <select
                id="alert-provider-filter"
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value)}
                className="px-2.5 py-1 text-xs rounded-lg border border-admin-border bg-admin-surface text-admin-fg focus:outline-none"
              >
                {providerOptions.map((provider) => (
                  <option key={provider} value={provider}>
                    {provider === 'all' ? 'All Providers' : provider}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Alert Log List */}
      {error ? (
        <AdminErrorState
          title="Unable to load system alerts"
          description="Alerts could not be read, so this list is not a reliable picture of system health."
          error={error}
          onRetry={refresh}
        />
      ) : loading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading system alerts">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-admin-surface border border-admin-border animate-pulse" />
          ))}
        </div>
      ) : visibleAlerts.length === 0 ? (
        <AdminEmptyState
          icon={Inbox}
          title="No alerts match these filters"
          description={
            hasFacetFilter
              ? `${alerts.length} loaded alert${alerts.length === 1 ? '' : 's'} were filtered out by the current facets.`
              : 'No operational failure records match the current status and filter criteria.'
          }
        />
      ) : (
        <div className="space-y-3">
          {visibleAlerts.map((alert) => {
            const isCritical = alert.severity === 'critical'
            const isError = alert.severity === 'error'

            // Three tiers, each with icon, chip and container in agreement. The
            // warning tier previously rendered on a plain neutral surface while its
            // icon and chip were info-toned, so a warning read as an ordinary row.
            // Info tint keeps recoverable failures visible without the red reserved
            // for incidents that have actually stopped something.
            return (
              <div
                key={alert.id}
                className={`p-4 rounded-xl border transition-colors ${
                  isCritical
                    ? 'bg-admin-danger-soft border-admin-danger/25'
                    : isError
                    ? 'bg-admin-warning-soft border-admin-warning/25'
                    : 'bg-admin-info-soft/40 border-admin-info/20'
                }`}
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    {isCritical ? (
                      <ShieldAlert className="w-5 h-5 text-admin-danger shrink-0 mt-0.5" />
                    ) : isError ? (
                      <AlertTriangle className="w-5 h-5 text-admin-warning shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-admin-info shrink-0 mt-0.5" />
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            isCritical
                              ? 'bg-admin-danger text-admin-fg'
                              : isError
                              ? 'bg-admin-warning-soft text-admin-warning'
                              : 'bg-admin-info-soft text-admin-info'
                          }`}
                        >
                          {alert.severity}
                        </span>

                        <span className="px-2 py-0.5 rounded bg-admin-surface-raised text-admin-fg-muted text-[10px] font-mono uppercase">
                          {alert.category}
                        </span>

                        {alert.kind && (
                          <span className="px-2 py-0.5 rounded bg-admin-surface-raised text-admin-fg text-[10px] font-mono">
                            {alert.kind.replace(/_/g, ' ')}
                          </span>
                        )}

                        {alert.retryability && (
                          <span
                            className="px-2 py-0.5 rounded border border-admin-border text-admin-fg-muted text-[10px]"
                            title={RETRYABILITY_LABELS[alert.retryability] || alert.retryability}
                          >
                            {RETRYABILITY_LABELS[alert.retryability] || alert.retryability}
                          </span>
                        )}

                        {typeof alert.occurrence_count === 'number' && alert.occurrence_count > 1 && (
                          <span className="px-2 py-0.5 rounded bg-admin-warning-soft text-admin-warning text-[10px] font-bold">
                            ×{alert.occurrence_count}
                          </span>
                        )}

                        <span className="text-xs font-bold text-admin-fg font-mono">{alert.operation}</span>

                        <span className="text-[11px] text-admin-fg-muted flex items-center gap-1 ml-auto sm:ml-0">
                          <Clock className="w-3 h-3" />
                          {formatDateTime(alert.timestamp)}
                        </span>
                      </div>

                      <p className="text-xs font-mono text-admin-fg mt-2 break-all bg-admin-bg/60 p-2 rounded border border-admin-border">
                        {alert.message}
                      </p>

                      {alert.next_action && (
                        <p className="mt-2 rounded border border-admin-info/25 bg-admin-info-soft/40 p-2 text-[11px] leading-relaxed text-admin-fg">
                          <span className="font-bold">Next step: </span>
                          {alert.next_action}
                        </p>
                      )}

                      {alert.first_seen_at &&
                        typeof alert.occurrence_count === 'number' &&
                        alert.occurrence_count > 1 && (
                          <p className="mt-2 text-[11px] text-admin-fg-muted">
                            Seen {alert.occurrence_count} times, first at {formatDateTime(alert.first_seen_at)}
                          </p>
                        )}

                      {alertContext(alert).length > 0 && (
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-admin-fg-muted mt-2 font-mono">
                          {alertContext(alert).map((entry) => (
                            <span key={entry.label}>
                              {entry.label}: {entry.value}
                            </span>
                          ))}
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
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-admin-border bg-admin-surface hover:bg-admin-surface-raised text-admin-fg transition-colors cursor-pointer"
                      >
                        Acknowledge
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleUpdateStatus(alert.id, 'resolved')}
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-admin-success text-admin-fg hover:bg-admin-success/90 transition-colors cursor-pointer"
                      >
                        Resolve
                      </button>
                    </div>
                  )}

                  {alert.status === 'acknowledged' && (
                    <button
                      type="button"
                      onClick={() => void handleUpdateStatus(alert.id, 'resolved')}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-admin-success text-admin-fg hover:bg-admin-success/90 transition-colors shrink-0 self-end sm:self-center cursor-pointer"
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
