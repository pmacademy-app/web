'use client'

import React, { useState } from 'react'
import { Activity, Server, ShieldCheck, Play, ChevronRight, Lock, AlertCircle, CheckCircle2 } from 'lucide-react'
import { AdminSection } from './AdminSection'
import { AdminSystemStatusBadge } from './AdminSystemStatusBadge'
import { AdminStatusBadge } from './AdminStatusBadge'
import { AdminServiceDetailDrawer } from './AdminServiceDetailDrawer'
import { AdminLoadWarning } from './AdminLoadWarning'
import { AdminAlert } from './AdminAlert'
import { AdminEmptyState } from './AdminEmptyState'
import { AdminDashboardRefreshButton } from './AdminDashboardRefreshButton'
import { ProcessEmailQueueButton } from './ProcessEmailQueueButton'
import { useIsMounted } from '@/lib/admin/use-is-mounted'
import type { AdminSystemHealthOverview, AdminSystemServiceDetail, AdminAuthHealthTelemetry } from '@/lib/admin/types'

interface AdminSystemHealthWorkspaceProps {
  overview: AdminSystemHealthOverview
  serviceDetails: Record<string, AdminSystemServiceDetail>
  authHealth?: AdminAuthHealthTelemetry
}

/**
 * Health tab (spec §7.1–§7.3): overall status, per-service cards, operational
 * diagnostics, auth health telemetry, and manual triggers. Service cards open a detail drawer with
 * server-computed metrics and recent failures.
 */
export function AdminSystemHealthWorkspace({ overview, serviceDetails, authHealth }: AdminSystemHealthWorkspaceProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const mounted = useIsMounted()
  const selectedDetail = selected ? serviceDetails[selected] : null

  const formatTime = (iso: string) => {
    if (!mounted || !iso) return ''
    try {
      return new Date(iso).toLocaleTimeString()
    } catch {
      return ''
    }
  }

  const formatDateTime = (iso: string) => {
    if (!mounted || !iso) return ''
    try {
      return new Date(iso).toLocaleString()
    } catch {
      return ''
    }
  }

  return (
    <div className="space-y-8">
      {overview.failed && (
        <AdminLoadWarning message="Live system telemetry could not be loaded. Showing configuration and diagnostics only." />
      )}

      {/* Summary strip */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 sm:p-5 rounded-xl bg-admin-surface border border-admin-border shadow-xl">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-3 rounded-xl bg-admin-accent-soft border border-admin-accent/25 shrink-0">
            <Activity className="w-5 h-5 text-admin-accent" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-bold text-admin-fg">System Health</h2>
              <AdminSystemStatusBadge status={overview.overallStatus} />
            </div>
            <p className="text-xs text-admin-fg-muted mt-0.5">
              {overview.environment} environment{mounted && overview.lastCheckedAt ? ` · Last checked ${formatDateTime(overview.lastCheckedAt)}` : ''}
              {overview.nextVersion ? ` · ${overview.nextVersion}` : ''}
            </p>
          </div>
        </div>
        <AdminDashboardRefreshButton />
      </div>

      {overview.overallStatus === 'degraded' && (
        <AdminAlert
          variant="warning"
          title="One or more services are degraded"
          description="Review the service cards below and the Alerts tab for details."
        />
      )}

      {/* Service grid */}
      {overview.services.length === 0 ? (
        <AdminEmptyState
          icon={Server}
          title="No service telemetry available"
          description="Live health data could not be loaded. Check the database connection and try again."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {overview.services.map((service) => (
            <button
              key={service.id}
              type="button"
              onClick={() => setSelected(service.id)}
              aria-label={`View ${service.label} details`}
              className="group text-left p-5 rounded-xl bg-admin-surface border border-admin-border shadow-xl hover:border-admin-accent/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-accent/50"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-admin-fg-muted uppercase tracking-wider">{service.label}</p>
                <AdminSystemStatusBadge status={service.status} />
              </div>
              <p className="text-lg font-extrabold text-admin-fg mt-3">{service.summary}</p>
              <p className="text-[11px] text-admin-fg-muted mt-1">{service.detail}</p>
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-admin-border">
                <span className="text-[10px] font-mono text-admin-fg-subtle">
                  {mounted && service.lastChecked ? `Checked ${formatTime(service.lastChecked)}` : 'Live telemetry'}
                </span>
                <span className="text-[11px] font-semibold text-admin-accent inline-flex items-center gap-0.5 group-hover:gap-1 transition-all">
                  View Details <ChevronRight className="w-3 h-3" />
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Authentication Observability & Health (Phase 6) */}
      {authHealth && (
        <AdminSection
          title="Authentication Observability"
          icon={Lock}
          meta="Client-side failure telemetry & provider health"
        >
          <div className="space-y-4">
            {authHealth.isSpikeDetected && (
              <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-destructive">Authentication Outage / Spike Detected</h4>
                  <p className="text-[11px] text-destructive/80 mt-0.5">
                    More than 5 critical authentication or provider failures were recorded within the last 15 minutes.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-admin-bg/60 border border-admin-border">
                <p className="text-[11px] font-semibold text-admin-fg-muted">Failures (24h)</p>
                <p className="text-xl font-extrabold text-admin-fg mt-1">{authHealth.failures24h}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-admin-bg/60 border border-admin-border">
                <p className="text-[11px] font-semibold text-admin-fg-muted">Failures (7d)</p>
                <p className="text-xl font-extrabold text-admin-fg mt-1">{authHealth.failures7d}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-admin-bg/60 border border-admin-border">
                <p className="text-[11px] font-semibold text-admin-fg-muted">Provider Outages (24h)</p>
                <p className={`text-xl font-extrabold mt-1 ${authHealth.providerFailures24h > 0 ? 'text-destructive' : 'text-admin-fg'}`}>
                  {authHealth.providerFailures24h}
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-admin-bg/60 border border-admin-border">
                <p className="text-[11px] font-semibold text-admin-fg-muted">Network Errors (24h)</p>
                <p className={`text-xl font-extrabold mt-1 ${authHealth.networkFailures24h > 5 ? 'text-amber-500' : 'text-admin-fg'}`}>
                  {authHealth.networkFailures24h}
                </p>
              </div>
            </div>

            {authHealth.topCategories.length > 0 ? (
              <div className="p-4 rounded-xl bg-admin-bg/60 border border-admin-border space-y-2">
                <p className="text-xs font-semibold text-admin-fg">Top Failure Classifications (24h)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {authHealth.topCategories.slice(0, 6).map((cat) => (
                    <div key={cat.category} className="flex items-center justify-between p-2 rounded-lg bg-admin-surface border border-admin-border">
                      <span className="font-mono text-[11px] text-admin-accent">{cat.category}</span>
                      <span className="font-bold text-admin-fg">{cat.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-admin-bg/60 border border-admin-border flex items-center gap-2 text-xs text-admin-fg-muted">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Zero authentication anomalies recorded in the last 24 hours.</span>
              </div>
            )}
          </div>
        </AdminSection>
      )}

      {/* Operational diagnostics */}
      <AdminSection
        title="Operational Diagnostics"
        icon={ShieldCheck}
        meta="External platform integration & telemetry status"
      >
        <div className="space-y-3">
          {overview.integrations.map((integration) => (
            <div
              key={integration.id}
              className="p-4 rounded-lg bg-admin-bg/60 border border-admin-border flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold text-admin-fg">{integration.name}</p>
                <p className="text-[11px] text-admin-fg-muted mt-0.5">{integration.description}</p>
              </div>
              {integration.configured && integration.monitored ? (
                integration.healthy ? (
                  <AdminStatusBadge status="healthy" label="Connected & Monitored" />
                ) : (
                  <AdminStatusBadge status="unhealthy" label="Unreachable" />
                )
              ) : integration.configured ? (
                integration.healthy ? (
                  <AdminStatusBadge status="unmonitored" label="Configured · No Telemetry" />
                ) : (
                  <AdminStatusBadge status="unhealthy" label="Configured · Unhealthy" />
                )
              ) : (
                <AdminStatusBadge status="archived" label="Not Configured" />
              )}
            </div>
          ))}
        </div>
      </AdminSection>

      {/* Manual triggers */}
      <AdminSection title="Manual System Triggers" icon={Play} meta="Operational actions">
        <div className="flex flex-wrap gap-4">
          <ProcessEmailQueueButton />
        </div>
      </AdminSection>

      <AdminServiceDetailDrawer
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
        detail={selectedDetail}
      />
    </div>
  )
}