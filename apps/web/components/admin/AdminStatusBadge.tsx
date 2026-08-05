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
  | 'admin'
  | 'learner'

export interface AdminStatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: AdminStatusVariant | string
  label?: string
  dot?: boolean
}

export function AdminStatusBadge({ status, label, dot = true, className, ...props }: AdminStatusBadgeProps) {
  const normalizedStatus = status.toLowerCase() as AdminStatusVariant

  let badgeStyle = 'bg-slate-800 text-slate-300 border-slate-700'
  let dotStyle = 'bg-slate-400'
  let displayLabel = label || status

  switch (normalizedStatus) {
    case 'success':
    case 'published':
    case 'healthy':
    case 'delivered':
      badgeStyle = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
      dotStyle = 'bg-emerald-400'
      displayLabel = label || (normalizedStatus === 'healthy' ? 'Healthy' : normalizedStatus === 'published' ? 'Published' : 'Active')
      break
    case 'warning':
    case 'pending':
    case 'processing':
      badgeStyle = 'bg-amber-500/10 text-amber-400 border-amber-500/25'
      dotStyle = 'bg-amber-400 animate-pulse'
      displayLabel = label || (normalizedStatus === 'pending' ? 'Pending' : 'Warning')
      break
    case 'danger':
    case 'unhealthy':
    case 'failed':
      badgeStyle = 'bg-rose-500/10 text-rose-400 border-rose-500/25'
      dotStyle = 'bg-rose-400'
      displayLabel = label || (normalizedStatus === 'unhealthy' ? 'Unhealthy' : 'Failed')
      break
    case 'info':
    case 'draft':
      badgeStyle = 'bg-blue-500/10 text-blue-400 border-blue-500/25'
      dotStyle = 'bg-blue-400'
      displayLabel = label || (normalizedStatus === 'draft' ? 'Draft' : 'Info')
      break
    case 'archived':
      badgeStyle = 'bg-slate-800 text-slate-400 border-slate-700'
      dotStyle = 'bg-slate-500'
      displayLabel = label || 'Archived'
      break
    case 'admin':
      badgeStyle = 'bg-purple-500/10 text-purple-400 border-purple-500/25'
      dotStyle = 'bg-purple-400'
      displayLabel = label || 'Admin'
      break
    case 'learner':
      badgeStyle = 'bg-slate-800/80 text-slate-300 border-slate-700'
      dotStyle = 'bg-slate-400'
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
