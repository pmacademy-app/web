import * as React from 'react'
import { Toggle as TogglePrimitive } from '@base-ui/react/toggle'
import { cn } from '@/lib/utils'

/**
 * Admin toggle — two-state button (Base UI Toggle).
 */
function AdminToggle({
  pressed,
  defaultPressed,
  onPressedChange,
  disabled,
  className,
  children,
  ...props
}: React.ComponentProps<typeof TogglePrimitive> & {
  pressed?: boolean
  defaultPressed?: boolean
  onPressedChange?: (pressed: boolean) => void
}) {
  return (
    <TogglePrimitive
      pressed={pressed}
      defaultPressed={defaultPressed}
      onPressedChange={onPressedChange}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg border border-admin-border bg-admin-surface px-3 py-1.5 text-sm font-medium text-admin-fg-muted transition-colors outline-none select-none hover:bg-admin-surface-raised hover:text-admin-fg focus-visible:ring-2 focus-visible:ring-admin-accent/50 data-pressed:border-admin-accent/40 data-pressed:bg-admin-accent-soft data-pressed:text-admin-accent disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      {children}
    </TogglePrimitive>
  )
}

export { AdminToggle }