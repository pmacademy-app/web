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
  iconColor = 'text-amber-400',
  badgeText,
  className,
}: AdminKpiCardProps) {
  return (
    <div
      className={cn(
        'p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2 shadow-xl hover:border-slate-700/80 transition-all group relative overflow-hidden',
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</span>
        {Icon && (
          <div className="p-2 rounded-lg bg-slate-800/60 border border-slate-700/50 group-hover:scale-105 transition-transform">
            <Icon className={cn('w-4 h-4', iconColor)} />
          </div>
        )}
      </div>

      <div className="flex items-baseline justify-between pt-1">
        <p className="text-3xl font-extrabold text-white tracking-tight">{value}</p>

        {trend && (
          <div
            className={cn(
              'flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border',
              trend.positive !== false
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
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
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
            {badgeText}
          </span>
        )}
      </div>

      {subtitle && <p className="text-xs text-slate-400 font-medium">{subtitle}</p>}
    </div>
  )
}
