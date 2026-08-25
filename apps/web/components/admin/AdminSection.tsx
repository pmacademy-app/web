import React from 'react'
import { cn } from '@/lib/utils'

export interface AdminSectionProps {
  title: string
  icon?: React.ElementType
  iconColor?: string
  /** Right-aligned meta text (e.g. "Daily", "All-time journey"). */
  meta?: React.ReactNode
  /** Right-aligned actions (buttons, toggles). */
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}

/**
 * Shared card chrome for dashboard panels (Phase 2).
 *
 * Consolidates the repeated `p-6 rounded-xl bg-admin-surface border ...`
 * wrapper + header row that was copy-pasted across every dashboard panel, so
 * spacing, hierarchy and the header treatment stay consistent.
 */
export function AdminSection({
  title,
  icon: Icon,
  iconColor = 'text-admin-accent',
  meta,
  actions,
  children,
  className,
  bodyClassName,
}: AdminSectionProps) {
  return (
    <section
      className={cn(
        'p-5 sm:p-6 rounded-xl bg-admin-surface border border-admin-border shadow-xl',
        className
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-admin-border pb-4 mb-4">
        <h2 className="text-sm font-bold text-admin-fg uppercase tracking-wider flex items-center gap-2 min-w-0">
          {Icon && <Icon className={cn('w-4 h-4 shrink-0', iconColor)} />}
          <span className="truncate">{title}</span>
        </h2>
        <div className="flex items-center gap-2 shrink-0">
          {actions}
          {meta && <span className="text-[11px] font-mono text-admin-fg-muted">{meta}</span>}
        </div>
      </header>
      <div className={cn('space-y-4', bodyClassName)}>{children}</div>
    </section>
  )
}