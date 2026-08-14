import * as React from 'react'
import { Select as SelectPrimitive } from '@base-ui/react/select'
import { CheckIcon, ChevronDownIcon, XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAdminShell } from './admin-shell-context'

/**
 * Admin multi-select — Base UI Select with `multiple`, brand styled.
 * Usage:
 *   <AdminMultiSelect
 *     value={selected}
 *     onValueChange={setSelected}
 *     options={[{ value: 'a', label: 'Option A' }]}
 *     placeholder="Select…"
 *   />
 */
function AdminMultiSelect({
  value,
  onValueChange,
  options,
  placeholder = 'Select…',
  disabled,
  className,
}: {
  value: string[]
  onValueChange: (value: string[]) => void
  options: { value: string; label: string }[]
  placeholder?: string
  disabled?: boolean
  className?: string
}) {
  const selectedLabels = React.useMemo(() => {
    const map = new Map(options.map((o) => [o.value, o.label]))
    return value.map((v) => map.get(v) ?? v)
  }, [options, value])

  const shellRef = useAdminShell()

  return (
    <SelectPrimitive.Root
      multiple
      value={value}
      onValueChange={(next) => onValueChange(next as string[])}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        className={cn(
          'flex min-h-9 w-full items-center justify-between gap-1.5 rounded-lg border border-admin-border bg-admin-surface px-3 py-1.5 text-sm text-admin-fg transition-colors outline-none select-none focus-visible:border-admin-accent/60 focus-visible:ring-2 focus-visible:ring-admin-accent/30 data-placeholder:text-admin-fg-subtle disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
      >
        <div className="flex flex-1 flex-wrap items-center gap-1">
          {selectedLabels.length === 0 ? (
            <span className="text-admin-fg-subtle">{placeholder}</span>
          ) : (
            selectedLabels.map((label, i) => (
              <span
                key={`${label}-${i}`}
                className="inline-flex items-center gap-1 rounded-md bg-admin-accent-soft px-2 py-0.5 text-xs font-medium text-admin-accent"
              >
                {label}
                <button
                  type="button"
                  aria-label={`Remove ${label}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onValueChange(value.filter((_, idx) => idx !== i))
                  }}
                  className="rounded-sm hover:text-admin-accent-fg"
                >
                  <XIcon className="h-3 w-3" />
                </button>
              </span>
            ))
          )}
        </div>
        <ChevronDownIcon className="h-4 w-4 shrink-0 text-admin-fg-subtle" />
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal container={shellRef}>
        <SelectPrimitive.Positioner sideOffset={6} className="z-50">
          <SelectPrimitive.Popup className="max-h-64 min-w-52 overflow-y-auto rounded-xl border border-admin-border bg-admin-surface p-1.5 text-admin-fg shadow-2xl outline-none data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95">
            {options.map((option) => {
              const selected = value.includes(option.value)
              return (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm font-medium outline-none select-none data-highlighted:bg-admin-surface-raised"
                >
                  <span>{option.label}</span>
                  {selected && (
                    <CheckIcon className="h-4 w-4 text-admin-accent" />
                  )}
                </SelectPrimitive.Item>
              )
            })}
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

export { AdminMultiSelect }