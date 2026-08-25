'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface AdminToggleProps {
  pressed?: boolean
  defaultPressed?: boolean
  onPressedChange?: (pressed: boolean) => void
  disabled?: boolean
  className?: string
  'aria-label'?: string
}

/**
 * Accessible SaaS switch toggle component.
 * Features:
 * - Proper role="switch" & aria-checked
 * - Distinct ON (Prodily Green) / OFF (Neutral Slate) states
 * - Smooth animated sliding thumb
 * - Hover, focus-visible ring and disabled states
 */
export function AdminToggle({
  pressed = false,
  defaultPressed,
  onPressedChange,
  disabled = false,
  className,
  'aria-label': ariaLabel = 'Toggle setting',
}: AdminToggleProps) {
  const [internalPressed, setInternalPressed] = React.useState<boolean>(
    defaultPressed ?? pressed
  )

  const isControlled = pressed !== undefined
  const isChecked = isControlled ? pressed : internalPressed

  const handleToggle = () => {
    if (disabled) return
    const next = !isChecked
    if (!isControlled) {
      setInternalPressed(next)
    }
    onPressedChange?.(next)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      handleToggle()
    }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isChecked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={handleToggle}
      onKeyDown={handleKeyDown}
      className={cn(
        'group relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-accent focus-visible:ring-offset-2 focus-visible:ring-offset-admin-surface',
        isChecked ? 'bg-admin-accent' : 'bg-slate-300 dark:bg-slate-700',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out',
          isChecked ? 'translate-x-5' : 'translate-x-0'
        )}
      />
    </button>
  )
}