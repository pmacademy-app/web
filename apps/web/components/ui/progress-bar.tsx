'use client'

import { motion } from 'framer-motion'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { cn } from '@/lib/utils'

interface ProgressBarProps {
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
 * Framer Motion fill animation. Reduced motion instant fill.
 */
export function ProgressBar({
  value,
  max = 100,
  label,
  variant = 'linear',
  className,
}: ProgressBarProps) {
  const prefersReducedMotion = useReducedMotion()
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100)

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
        <motion.div
          className={cn(
            'h-full rounded-full',
            variant === 'linear' && 'bg-primary',
            variant === 'accent' && 'bg-accent',
            variant === 'skill' && 'bg-primary',
          )}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={
            prefersReducedMotion
              ? { duration: 0 }
              : { type: 'spring', stiffness: 100, damping: 20 }
          }
        />
      </div>
    </div>
  )
}
