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
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 py-3.5 border-b border-admin-border/60 last:border-b-0',
        className
      )}
    >
      <div className={cn('flex-1 min-w-0', labelClassName)}>
        <span className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-admin-fg">
          {label}
          {required && <span className="text-admin-danger" aria-hidden="true">*</span>}
        </span>
        {description && (
          <p className="mt-0.5 text-xs text-admin-fg-muted leading-relaxed">{description}</p>
        )}
      </div>
      <div
        className={cn(
          'shrink-0 w-full sm:w-auto sm:max-w-[320px] flex items-center justify-start sm:justify-end',
          controlClassName
        )}
      >
        {children}
      </div>
    </div>
  )
}