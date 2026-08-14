import * as React from 'react'
import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox'
import { CheckIcon, MinusIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Admin checkbox — Base UI Checkbox with brand styling.
 * Supports checked / indeterminate / disabled states.
 */
function AdminCheckbox({
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  indeterminate,
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root> & {
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  indeterminate?: boolean
}) {
  return (
    <CheckboxPrimitive.Root
      checked={checked}
      defaultChecked={defaultChecked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className={cn(
        'flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-md border border-admin-border-strong bg-admin-surface transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-admin-accent/50 data-checked:border-admin-accent data-checked:bg-admin-accent data-checked:text-admin-accent-fg data-indeterminate:border-admin-accent data-indeterminate:bg-admin-accent data-indeterminate:text-admin-accent-fg data-disabled:cursor-not-allowed data-disabled:opacity-50',
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center">
        {indeterminate ? (
          <MinusIcon className="w-3 h-3" />
        ) : (
          <CheckIcon className="w-3 h-3" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { AdminCheckbox }