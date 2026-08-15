'use client'

import React from 'react'
import { cn } from '@/lib/utils'

export interface NumberInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  description?: string
  min?: number
  max?: number
  step?: number
  error?: string
}

/**
 * NumberInput — accessible number input with optional label, description, and error.
 * Uses native input[type=number] with proper ARIA attributes.
 */
export function NumberInput({
  label,
  description,
  min,
  max,
  step = 1,
  error,
  className,
  id,
  'aria-describedby': ariaDescribedBy,
  ...props
}: NumberInputProps) {
  const generatedId = React.useId()
  const inputId = id || `number-input-${generatedId}`
  const descriptionId = description ? `${inputId}-description` : undefined
  const errorId = error ? `${inputId}-error` : undefined
  const describedBy = [ariaDescribedBy, descriptionId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block mb-1 text-xs font-medium text-admin-fg">
          {label}
        </label>
      )}
      <input
        type="number"
        id={inputId}
        min={min}
        max={max}
        step={step}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={describedBy}
        className={cn(
          'w-full px-3 py-2 text-sm text-admin-fg bg-admin-surface border rounded-lg',
          'placeholder:text-admin-fg-subtle',
          'focus:outline-none focus:ring-2 focus:ring-admin-accent/50 focus:border-admin-accent',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'hover:border-admin-border-strong transition-colors',
          error ? 'border-admin-danger focus:ring-admin-danger/50' : 'border-admin-border',
          className
        )}
        {...props}
      />
      {description && (
        <p id={descriptionId} className="mt-1.5 text-xs text-admin-fg-muted">
          {description}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1.5 text-xs text-admin-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}