import React from 'react'
import {
  Info,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Lightbulb,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type AdminAlertVariant = 'info' | 'success' | 'warning' | 'danger' | 'tip'

const variantStyles: Record<
  AdminAlertVariant,
  { container: string; icon: LucideIcon; iconColor: string }
> = {
  info: {
    container: 'border-admin-info/25 bg-admin-info-soft/40',
    icon: Info,
    iconColor: 'text-admin-info',
  },
  success: {
    container: 'border-admin-success/25 bg-admin-success-soft/40',
    icon: CheckCircle2,
    iconColor: 'text-admin-success',
  },
  warning: {
    container: 'border-admin-warning/25 bg-admin-warning-soft/40',
    icon: AlertTriangle,
    iconColor: 'text-admin-warning',
  },
  danger: {
    container: 'border-admin-danger/25 bg-admin-danger-soft/40',
    icon: XCircle,
    iconColor: 'text-admin-danger',
  },
  tip: {
    container: 'border-admin-accent/25 bg-admin-accent-soft/40',
    icon: Lightbulb,
    iconColor: 'text-admin-accent',
  },
}

/**
 * Admin alert — contextual message banner.
 */
export function AdminAlert({
  variant = 'info',
  title,
  description,
  action,
  className,
}: {
  variant?: AdminAlertVariant
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  const { container, icon: Icon, iconColor } = variantStyles[variant]
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl border px-4 py-3.5',
        container,
        className
      )}
    >
      <Icon className={cn('w-4.5 h-4.5 mt-0.5 shrink-0 stroke-[1.75]', iconColor)} />
      <div className="flex-1 space-y-0.5 min-w-0">
        <p className="text-sm font-semibold text-admin-fg">{title}</p>
        {description && (
          <p className="text-xs text-admin-fg-muted">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
