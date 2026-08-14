import React from 'react'
import { CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Admin date picker — lightweight native date input with brand styling.
 * Uses the browser's native date picker (no extra dependency).
 */
export function AdminDatePicker({
  value,
  onValueChange,
  placeholder = 'Select date',
  min,
  max,
  disabled,
  className,
  'aria-label': ariaLabel = 'Date',
}: {
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  min?: string
  max?: string
  disabled?: boolean
  className?: string
  'aria-label'?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <CalendarIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-admin-fg-subtle" />
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => onValueChange(e.target.value)}
        aria-label={ariaLabel}
        className={cn(
          'h-9 w-full rounded-lg border border-admin-border bg-admin-surface pl-9 pr-3 text-sm text-admin-fg transition-colors outline-none focus-visible:border-admin-accent/60 focus-visible:ring-2 focus-visible:ring-admin-accent/30 disabled:cursor-not-allowed disabled:opacity-50',
          !value && 'text-transparent [&::-webkit-datetime-edit]:text-transparent',
          '[&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:hover:opacity-100'
        )}
      />
      {!value && (
        <span className="pointer-events-none absolute top-1/2 left-9 -translate-y-1/2 text-sm text-admin-fg-subtle">
          {placeholder}
        </span>
      )}
    </div>
  )
}