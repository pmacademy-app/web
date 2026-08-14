import React from 'react'
import { AdminPageHeader } from './AdminPageHeader'
import { cn } from '@/lib/utils'

export interface AdminPageShellProps {
  title: string
  description?: string
  icon?: React.ElementType
  iconColor?: string
  actions?: React.ReactNode
  /** KPI cards row (usually AdminKpiCard[]). */
  kpis?: React.ReactNode
  /** Search + filters toolbar rendered above the content. */
  toolbar?: React.ReactNode
  /** Main content — table, panels, etc. */
  children: React.ReactNode
  className?: string
}

/**
 * Standard admin page structure (Phase 1):
 * Page Header → KPIs → Toolbar (search/filters) → Content.
 */
export function AdminPageShell({
  title,
  description,
  icon,
  iconColor,
  actions,
  kpis,
  toolbar,
  children,
  className,
}: AdminPageShellProps) {
  return (
    <div className={cn('space-y-6', className)}>
      <AdminPageHeader
        title={title}
        description={description}
        icon={icon}
        iconColor={iconColor}
        actions={actions}
      />

      {kpis && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis}
        </div>
      )}

      {toolbar && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {toolbar}
        </div>
      )}

      <div className="space-y-4">{children}</div>
    </div>
  )
}
