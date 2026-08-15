import React from 'react'
import { cn } from '@/lib/utils'

export type AdminStatusVariant =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'pending'
  | 'processing'
  | 'delivered'
  | 'failed'
  | 'draft'
  | 'published'
  | 'archived'
  | 'healthy'
  | 'unhealthy'
  | 'unmonitored'
  | 'admin'
  | 'learner'

export interface AdminStatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: AdminStatusVariant | string
  label?: string
  dot?: boolean
}

export function AdminStatusBadge({ status, label, dot = true, className, ...props }: AdminStatusBadgeProps) {
  const normalizedStatus = status.toLowerCase() as AdminStatusVariant

  let badgeStyle = 'bg-admin-surface-raised text-admin-fg-muted border-admin-border'
  let dotStyle = 'bg-admin-neutral'
  let displayLabel = label || status

  switch (normalizedStatus) {
    case 'success':
    case 'published':
    case 'healthy':
    case 'delivered':
      badgeStyle = 'bg-admin-success-soft text-admin-success border-admin-success/25'
      dotStyle = 'bg-admin-success'
      displayLabel = label || (normalizedStatus === 'healthy' ? 'Healthy' : normalizedStatus === 'published' ? 'Published' : 'Active')
      break
    case 'warning':
    case 'pending':
    case 'processing':
      badgeStyle = 'bg-admin-warning-soft text-admin-warning border-admin-warning/25'
      dotStyle = 'bg-admin-warning animate-pulse'
      displayLabel = label || (normalizedStatus === 'pending' ? 'Pending' : 'Warning')
      break
    case 'danger':
    case 'unhealthy':
    case 'failed':
      badgeStyle = 'bg-admin-danger-soft text-admin-danger border-admin-danger/25'
      dotStyle = 'bg-admin-danger'
      displayLabel = label || (normalizedStatus === 'unhealthy' ? 'Unhealthy' : 'Failed')
      break
    case 'info':
    case 'draft':
      badgeStyle = 'bg-admin-info-soft text-admin-info border-admin-info/25'
      dotStyle = 'bg-admin-info'
      displayLabel = label || (normalizedStatus === 'draft' ? 'Draft' : 'Info')
      break
    case 'archived':
      badgeStyle = 'bg-admin-surface-raised text-admin-fg-subtle border-admin-border'
      dotStyle = 'bg-admin-neutral'
      displayLabel = label || 'Archived'
      break
    case 'unmonitored':
      badgeStyle = 'bg-admin-surface-raised text-admin-fg-muted border-admin-border'
      dotStyle = 'bg-admin-neutral'
      displayLabel = label || 'Unmonitored'
      break
    case 'admin':
      badgeStyle = 'bg-admin-accent-soft text-admin-accent border-admin-accent/25'
      dotStyle = 'bg-admin-accent'
      displayLabel = label || 'Admin'
      break
    case 'learner':
      badgeStyle = 'bg-admin-surface-raised text-admin-fg-muted border-admin-border'
      dotStyle = 'bg-admin-neutral'
      displayLabel = label || 'Learner'
      break
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border tracking-tight transition-all',
        badgeStyle,
        className
      )}
      {...props}
    >
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotStyle)} />}
      <span className="capitalize">{displayLabel}</span>
    </span>
  )
}
