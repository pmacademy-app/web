import React from 'react'
import Link from 'next/link'
import { Activity, ShieldAlert, AlertTriangle, ScrollText, Flag } from 'lucide-react'
import { SystemService } from '@/lib/admin/system-service'
import { AdminConsoleService } from '@/lib/admin/service'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminSection } from '@/components/admin/AdminSection'
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge'
import { ProcessEmailQueueButton } from '@/components/admin/ProcessEmailQueueButton'
import { AdminSystemHealthWorkspace } from '@/components/admin/AdminSystemHealthWorkspace'
import { AdminSystemAlertsView } from '@/components/admin/AdminSystemAlertsView'
import { AdminSystemErrorsView } from '@/components/admin/AdminSystemErrorsView'
import { AdminSystemAuditView } from '@/components/admin/AdminSystemAuditView'
import type { AdminErrorGroupResult, AdminAuditLogResult } from '@/lib/admin/types'

export const revalidate = 0

interface PageProps {
  searchParams: Promise<{ tab?: string }>
}

const TABS = [
  { key: 'health', label: 'Health', icon: Activity },
  { key: 'alerts', label: 'Alerts', icon: ShieldAlert },
  { key: 'errors', label: 'Errors', icon: AlertTriangle },
  { key: 'audit', label: 'Audit Log', icon: ScrollText },
] as const

const EMPTY_ERROR_RESULT: AdminErrorGroupResult = {
  groups: [],
  total: 0,
  page: 1,
  pageSize: 25,
  totalPages: 1,
}

const EMPTY_AUDIT_RESULT: AdminAuditLogResult = {
  entries: [],
  total: 0,
  page: 1,
  pageSize: 25,
  totalPages: 1,
}

/**
 * System Workspace (Phase 7): Health, Alerts, Errors and Audit Log tabs.
 * Health + service details are always fetched (default tab); the Errors and
 * Audit Log datasets are only fetched when their tab is active to avoid
 * unnecessary queries. Each tab view handles its own loading/empty/error
 * states and refetches client-side on filter changes.
 */
export default async function AdminSystemPage({ searchParams }: PageProps) {
  const params = await searchParams
  const tab = TABS.some((t) => t.key === params.tab) ? params.tab! : 'health'

  const [overview, serviceDetails, flags, authHealth] = await Promise.all([
    SystemService.getHealthOverview().catch((err) => {
      console.error('[AdminSystemPage] getHealthOverview failed:', err)
      return {
        overallStatus: 'unknown' as const,
        environment: process.env.NODE_ENV || 'development',
        nextVersion: '',
        lastCheckedAt: new Date().toISOString(),
        databaseLatencyMs: null,
        services: [],
        cronJobs: [],
        integrations: [],
        failed: true,
      }
    }),
    SystemService.getServiceDetails().catch((err) => {
      console.error('[AdminSystemPage] getServiceDetails failed:', err)
      return {}
    }),
    AdminConsoleService.getFeatureFlags().catch((err) => {
      console.error('[AdminSystemPage] getFeatureFlags failed:', err)
      return []
    }),
    SystemService.getAuthHealthTelemetry().catch((err) => {
      console.error('[AdminSystemPage] getAuthHealthTelemetry failed:', err)
      return {
        status: 'degraded' as const,
        failures24h: 0,
        failures7d: 0,
        providerFailures24h: 0,
        networkFailures24h: 0,
        isSpikeDetected: false,
        topCategories: [],
        recentFailures: [],
        lastCheckedAt: new Date().toISOString(),
      }
    }),
  ])

  const errorGroups =
    tab === 'errors'
      ? await SystemService.getErrorGroups({ page: 1, pageSize: 25 }).catch((err) => {
          console.error('[AdminSystemPage] getErrorGroups failed:', err)
          return { ...EMPTY_ERROR_RESULT, failed: true }
        })
      : EMPTY_ERROR_RESULT
  const auditEntries =
    tab === 'audit'
      ? await SystemService.getAuditLog({ page: 1, pageSize: 25 }).catch((err) => {
          console.error('[AdminSystemPage] getAuditLog failed:', err)
          return { ...EMPTY_AUDIT_RESULT, failed: true }
        })
      : EMPTY_AUDIT_RESULT

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="System"
        description="Operational health, alerts, errors and audit history for the Prodily platform."
        icon={Activity}
        actions={<ProcessEmailQueueButton />}
      />

      {/* Secondary navigation tabs */}
      <nav aria-label="System sections" className="border-b border-admin-border flex gap-1 overflow-x-auto scrollbar-thin scrollbar-thumb-admin-border">
        {TABS.map(({ key, label, icon: Icon }) => (
          <Link
            key={key}
            href={`/admin/system?tab=${key}`}
            aria-current={tab === key ? 'page' : undefined}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap rounded-t-lg transition-colors border-b-2 -mb-px ${
              tab === key
                ? 'border-admin-accent text-admin-accent bg-admin-accent-soft/50 font-semibold'
                : 'border-transparent text-admin-fg-muted hover:text-admin-fg hover:bg-admin-surface-raised/50'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </Link>
        ))}
      </nav>

      {tab === 'health' && (
        <>
          <AdminSystemHealthWorkspace overview={overview} serviceDetails={serviceDetails} authHealth={authHealth} />
          {/* Feature Flags Diagnostic (read-only) */}
          <AdminSection title="Feature Flags Diagnostic" icon={Flag} meta="Runtime feature flag state">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {flags.map((flag) => (
                <div key={flag.key} className="p-3 rounded-lg bg-admin-bg/60 border border-admin-border flex items-center justify-between">
                  <span className="font-mono text-admin-accent font-semibold">{flag.key}</span>
                  <AdminStatusBadge
                    status={flag.enabled ? 'healthy' : 'archived'}
                    label={flag.enabled ? 'ENABLED' : 'DISABLED'}
                  />
                </div>
              ))}
            </div>
          </AdminSection>
        </>
      )}
      {tab === 'alerts' && <AdminSystemAlertsView />}
      {tab === 'errors' && <AdminSystemErrorsView initial={errorGroups} />}
      {tab === 'audit' && <AdminSystemAuditView initial={auditEntries} />}
    </div>
  )
}