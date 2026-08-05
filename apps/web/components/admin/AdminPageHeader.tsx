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
  iconColor = 'text-amber-400',
  actions,
  className,
}: AdminPageHeaderProps) {
  return (
    <div className={cn('flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5', className)}>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
          {Icon && (
            <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <Icon className={cn('w-5 h-5', iconColor)} />
            </div>
          )}
          <span>{title}</span>
        </h1>
        {description && <p className="text-sm text-slate-400">{description}</p>}
      </div>

      {actions && <div className="flex items-center gap-3 shrink-0">{actions}</div>}
    </div>
  )
}
