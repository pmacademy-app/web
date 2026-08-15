'use client'

import React from 'react'
import { cn } from '@/lib/utils'

export interface SettingRowProps {
  label: string
  description?: string
  children: React.ReactNode
  required?: boolean
  className?: string
  labelClassName?: string
  controlClassName?: string
}

/**
 * SettingRow — reusable label + control row for settings forms.
 * Handles responsive layout: side-by-side on desktop, stacked on mobile.
 */
export function SettingRow({
  label,
  description,
  children,
  required = false,
  className,
  labelClassName,
  controlClassName,
}: SettingRowProps) {
  return (
    <div className={cn('flex items-start gap-4 py-3', className)}>
      <label
        className={cn(
          'flex-1 min-w-0 pt-0.5 text-sm font-medium text-admin-fg',
          labelClassName
        )}
      >
        <span className="flex items-center gap-1.5">
          {label}
          {required && <span className="text-admin-danger" aria-hidden="true">*</span>}
        </span>
        {description && (
          <p className="mt-0.5 text-xs text-admin-fg-muted">{description}</p>
        )}
      </label>
      <div className={cn('shrink-0 w-full max-w-[320px]', controlClassName)}>
        {children}
      </div>
    </div>
  )
}