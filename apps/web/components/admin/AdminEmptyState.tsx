import React from 'react'
import { Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Admin empty state — shown when a dataset is empty.
 */
export function AdminEmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ElementType
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-admin-border-strong bg-admin-surface/40 px-6 py-14 text-center',
        className
      )}
    >
      <div className="p-3 rounded-xl bg-admin-surface-raised border border-admin-border">
        <Icon className="w-6 h-6 text-admin-fg-subtle stroke-[1.5]" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-bold text-admin-fg">{title}</p>
        {description && (
          <p className="max-w-sm text-xs text-admin-fg-muted">{description}</p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
