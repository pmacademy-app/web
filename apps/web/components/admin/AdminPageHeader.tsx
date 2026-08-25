import React from 'react'
import { cn } from '@/lib/utils'

export interface AdminPageHeaderProps {
  title: string
  description?: string
  icon?: React.ElementType
  iconColor?: string
  actions?: React.ReactNode
  className?: string
}

export function AdminPageHeader({
  title,
  description,
  icon: Icon,
  iconColor = 'text-admin-accent',
  actions,
  className,
}: AdminPageHeaderProps) {
  return (
    <div className={cn('flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-admin-border pb-5', className)}>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-admin-fg tracking-tight flex items-center gap-2.5">
          {Icon && (
            <div className="p-1.5 rounded-lg bg-admin-accent-soft border border-admin-accent/25">
              <Icon className={cn('w-5 h-5', iconColor)} />
            </div>
          )}
          <span>{title}</span>
        </h1>
        {description && <p className="text-sm text-admin-fg-muted">{description}</p>}
      </div>

      {actions && (
        <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-start md:self-auto">
          {actions}
        </div>
      )}
    </div>
  )
}
