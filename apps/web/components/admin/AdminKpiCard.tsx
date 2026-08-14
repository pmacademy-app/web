import React from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface AdminKpiCardProps {
  title: string
  value: string | number
  subtitle?: string
  trend?: {
    value: string
    positive?: boolean
  }
  icon?: React.ElementType
  iconColor?: string
  badgeText?: string
  className?: string
}

export function AdminKpiCard({
  title,
  value,
  subtitle,
  trend,
  icon: Icon,
  iconColor = 'text-admin-accent',
  badgeText,
  className,
}: AdminKpiCardProps) {
  return (
    <div
      className={cn(
        'p-5 rounded-xl bg-admin-surface border border-admin-border space-y-2 shadow-xl hover:border-admin-border-strong transition-all group relative overflow-hidden',
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-admin-fg-muted uppercase tracking-wider">{title}</span>
        {Icon && (
          <div className="p-2 rounded-lg bg-admin-accent-soft border border-admin-accent/25 group-hover:scale-105 transition-transform">
            <Icon className={cn('w-4 h-4', iconColor)} />
          </div>
        )}
      </div>

      <div className="flex items-baseline justify-between pt-1">
        <p className="text-3xl font-extrabold text-admin-fg tracking-tight">{value}</p>

        {trend && (
          <div
            className={cn(
              'flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border',
              trend.positive !== false
                ? 'bg-admin-success-soft text-admin-success border-admin-success/25'
                : 'bg-admin-danger-soft text-admin-danger border-admin-danger/25'
            )}
          >
            {trend.positive !== false ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            <span>{trend.value}</span>
          </div>
        )}

        {badgeText && (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-admin-surface-raised text-admin-fg-muted border border-admin-border">
            {badgeText}
          </span>
        )}
      </div>

      {subtitle && <p className="text-xs text-admin-fg-muted font-medium">{subtitle}</p>}
    </div>
  )
}
