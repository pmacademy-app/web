'use client'

import React from 'react'
import { Flag, Mail, Bell, Zap, Globe, Shield, Calendar } from 'lucide-react'
import { AdminSection } from './AdminSection'
import { AdminDataTable, Column } from './AdminDataTable'
import { AdminStatusBadge } from './AdminStatusBadge'
import { FeatureFlagToggle } from './FeatureFlagToggle'
import type { FeatureFlagRecord } from '@/lib/notifications/feature-flags/types'

// Category mapping for feature flags
const FLAG_CATEGORIES: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  EMAIL_ENABLED: { label: 'Communication', icon: Mail, color: 'text-admin-info' },
  IN_APP_NOTIFICATIONS_ENABLED: { label: 'Communication', icon: Bell, color: 'text-admin-warning' },
  ACHIEVEMENT_EMAIL_ENABLED: { label: 'Communication', icon: Mail, color: 'text-admin-info' },
  PORTFOLIO_EMAILS_ENABLED: { label: 'Communication', icon: Mail, color: 'text-admin-info' },
  WEEKLY_RECAP_ENABLED: { label: 'Scheduled', icon: Calendar, color: 'text-admin-accent' },
  MARKETING_EMAILS_ENABLED: { label: 'Marketing', icon: Globe, color: 'text-admin-purple' },
  QUEUE_PROCESSING_ENABLED: { label: 'Infrastructure', icon: Zap, color: 'text-admin-success' },
  SCHEDULER_ENABLED: { label: 'Infrastructure', icon: Shield, color: 'text-admin-success' },
}

export interface FeatureFlagsSectionProps {
  data: FeatureFlagRecord[]
  isSaving?: boolean
}

export function FeatureFlagsSection({
  data,
  isSaving = false,
}: FeatureFlagsSectionProps) {
  // Group flags by category
  const groupedFlags = data.reduce((acc, flag) => {
    const category = FLAG_CATEGORIES[flag.key]?.label || 'Other'
    if (!acc[category]) acc[category] = []
    acc[category].push(flag)
    return acc
  }, {} as Record<string, FeatureFlagRecord[]>)

  const categoryOrder = ['Communication', 'Scheduled', 'Marketing', 'Infrastructure', 'Other']

  const flagColumns: Column<FeatureFlagRecord>[] = [
    {
      header: 'Feature Flag',
      cell: (flag) => (
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-admin-accent">{flag.key}</span>
          {FLAG_CATEGORIES[flag.key] && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-admin-surface-raised border border-admin-border text-admin-fg-muted">
              {FLAG_CATEGORIES[flag.key].label}
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Description',
      cell: (flag) => (
        <span className="text-sm text-admin-fg-muted max-w-xs truncate block">
          {flag.description || 'No description available'}
        </span>
      ),
    },
    {
      header: 'Status',
      cell: (flag) => (
        <AdminStatusBadge
          status={flag.enabled ? 'healthy' : 'archived'}
          label={flag.enabled ? 'Enabled' : 'Disabled'}
        />
      ),
    },
    {
      header: 'Last Changed',
      cell: (flag) => (
        <span className="text-admin-fg-muted font-mono text-[11px]">
          {new Date(flag.updatedAt).toLocaleString()}
        </span>
      ),
    },
    {
      header: 'Action',
      headerClassName: 'text-right',
      className: 'text-right',
      cell: (flag) => (
        <FeatureFlagToggle flagKey={flag.key} initialEnabled={flag.enabled} disabled={isSaving} />
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {categoryOrder.map((category) => {
        const flags = groupedFlags[category]
        if (!flags || flags.length === 0) return null

        const categoryConfig = flags[0] ? FLAG_CATEGORIES[flags[0].key] : { icon: Flag, color: 'text-admin-fg-muted' }
        const Icon = categoryConfig.icon

        return (
          <AdminSection
            key={category}
            title={category}
            icon={Icon}
            iconColor={categoryConfig.color}
            meta={`${flags.length} flag${flags.length !== 1 ? 's' : ''}`}
          >
            <AdminDataTable
              columns={flagColumns}
              data={flags}
              keyExtractor={(f) => f.key}
              emptyTitle="No feature flags in this category"
              emptyDescription="Feature flags will appear here when configured."
            />
          </AdminSection>
        )
      })}

      {/* Note about feature flag API */}
      <div className="p-4 rounded-lg bg-admin-info-soft/50 border border-admin-info/25">
        <p className="text-sm text-admin-info">
          <strong>Note:</strong> Feature flags are toggled via the dedicated API and persist to the database
          immediately. The toggles above reflect real-time state. Use the
          <code className="font-mono px-1.5 py-0.5 rounded bg-admin-surface border border-admin-border ml-1">
            /api/admin/feature-flags
          </code>
          endpoint for programmatic access.
        </p>
      </div>
    </div>
  )
}