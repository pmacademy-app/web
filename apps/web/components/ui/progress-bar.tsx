import * as React from 'react'
import { cn } from '@/lib/utils'

export interface ProgressBarProps {
  value: number
  max?: number
  label?: string
  variant?: 'linear' | 'skill' | 'accent'
  className?: string
}

/**
 * Accessible ProgressBar component.
 * Props: value, max, label, variant.
 * ARIA: role="progressbar", aria-valuenow, aria-valuemin, aria-valuemax.
 * Fluid CSS width transition with reduced-motion support.
 */
export function ProgressBar({
  value,
  max = 100,
  label,
  variant = 'linear',
  className,
}: ProgressBarProps) {
  const percentage = Math.min(Math.max(Math.round((value / max) * 100), 0), 100)

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <div className="flex justify-between mb-1.5">
          <span className="text-caption font-medium text-foreground">{label}</span>
          <span className="text-caption font-semibold text-foreground">{percentage}%</span>
        </div>
      )}

      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label ?? 'Progress'}
        className="h-2 w-full bg-surface-muted rounded-full overflow-hidden"
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none',
            variant === 'linear' && 'bg-primary',
            variant === 'accent' && 'bg-accent',
            variant === 'skill' && 'bg-primary',
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
