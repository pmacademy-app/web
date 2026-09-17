import * as React from 'react'
import { Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ElementType | React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}

/**
 * Learner empty state — displayed when a collection, list, or queue is empty.
 * Mirrors AdminEmptyState while utilizing learner design-system tokens.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  const renderIcon = () => {
    if (!Icon) return null
    if (React.isValidElement(Icon)) {
      return Icon
    }
    const IconComponent = Icon as React.ElementType
    return <IconComponent className="h-6 w-6 stroke-[1.5]" aria-hidden="true" />
  }

  return (
    <div
      role="status"
      data-slot="empty-state"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/60 p-8 md:p-12 text-center shadow-xs',
        className
      )}
      {...props}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-secondary/80 text-foreground/70">
        {renderIcon()}
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-bold font-serif text-foreground">{title}</h3>
        {description && (
          <p className="max-w-md text-xs text-muted-foreground leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
