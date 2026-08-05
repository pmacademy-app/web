import React from 'react'
import { Flag } from 'lucide-react'
import { AdminConsoleService } from '@/lib/admin/service'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminDataTable, Column } from '@/components/admin/AdminDataTable'
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge'
import { FeatureFlagToggle } from '@/components/admin/FeatureFlagToggle'

export const revalidate = 0

interface FeatureFlagRow {
  key: string
  enabled: boolean
  updatedAt: string
}

export default async function AdminFeatureFlagsPage() {
  const flags = AdminConsoleService.getFeatureFlags()

  const columns: Column<FeatureFlagRow>[] = [
    {
      header: 'Feature Flag Key',
      cell: (flag) => <span className="font-mono font-bold text-amber-400">{flag.key}</span>,
    },
    {
      header: 'Current State',
      cell: (flag) => (
        <AdminStatusBadge
          status={flag.enabled ? 'healthy' : 'archived'}
          label={flag.enabled ? 'Enabled' : 'Disabled'}
        />
      ),
    },
    {
      header: 'Last Updated',
      cell: (flag) => (
        <span className="text-slate-400 font-mono text-[11px]">
          {new Date(flag.updatedAt).toLocaleString()}
        </span>
      ),
    },
    {
      header: 'Action',
      headerClassName: 'text-right',
      className: 'text-right',
      cell: (flag) => (
        <FeatureFlagToggle flagKey={flag.key} initialEnabled={flag.enabled} />
      ),
    },
  ]

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Runtime Feature Flags"
        description="Control platform capabilities, email delivery switches, and scheduled features in real time."
        icon={Flag}
        iconColor="text-amber-400"
      />

      <AdminDataTable
        columns={columns}
        data={flags}
        keyExtractor={(f) => f.key}
        searchPlaceholder="Filter feature flags..."
        emptyTitle="No feature flags configured"
      />
    </div>
  )
}
