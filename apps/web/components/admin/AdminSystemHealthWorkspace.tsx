'use client'

import React, { useState } from 'react'
import { Activity, Server, ShieldCheck, Play, ChevronRight } from 'lucide-react'
import { AdminSection } from './AdminSection'
import { AdminSystemStatusBadge } from './AdminSystemStatusBadge'
import { AdminStatusBadge } from './AdminStatusBadge'
import { AdminServiceDetailDrawer } from './AdminServiceDetailDrawer'
import { AdminLoadWarning } from './AdminLoadWarning'
import { AdminAlert } from './AdminAlert'
import { AdminEmptyState } from './AdminEmptyState'
import { AdminDashboardRefreshButton } from './AdminDashboardRefreshButton'
import { ProcessEmailQueueButton } from './ProcessEmailQueueButton'
import type { AdminSystemHealthOverview, AdminSystemServiceDetail } from '@/lib/admin/types'

interface AdminSystemHealthWorkspaceProps {
  overview: AdminSystemHealthOverview
  serviceDetails: Record<string, AdminSystemServiceDetail>
}

/**
 * Health tab (spec §7.1–§7.3): overall status, per-service cards, operational
 * diagnostics and manual triggers. Service cards open a detail drawer with
 * server-computed metrics and recent failures.
 */
export function AdminSystemHealthWorkspace({ overview, serviceDetails }: AdminSystemHealthWorkspaceProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const selectedDetail = selected ? serviceDetails[selected] : null

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
              {overview.environment} environment · Last checked{' '}
              {new Date(overview.lastCheckedAt).toLocaleString()}
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
                  Checked {new Date(service.lastChecked).toLocaleTimeString()}
                </span>
                <span className="text-[11px] font-semibold text-admin-accent inline-flex items-center gap-0.5 group-hover:gap-1 transition-all">
                  View Details <ChevronRight className="w-3 h-3" />
                </span>
              </div>
            </button>
          ))}
        </div>
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