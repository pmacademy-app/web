import * as React from 'react'
import { Menu as MenuPrimitive } from '@base-ui/react/menu'
import { cn } from '@/lib/utils'
import { useAdminShell } from './admin-shell-context'

/**
 * Admin dropdown menu — built on Base UI Menu.
 * Usage:
 *   <AdminDropdownMenu
 *     trigger={<Button>Actions</Button>}
 *     items={[
 *       { label: 'Edit', icon: Pencil, onSelect: () => {} },
 *       { label: 'Delete', icon: Trash2, destructive: true, onSelect: () => {} },
 *       { type: 'separator' },
 *     ]}
 *   />
 */
export interface AdminDropdownMenuItem {
  type?: 'item' | 'separator'
  label?: string
  icon?: React.ElementType
  destructive?: boolean
  disabled?: boolean
  onSelect?: () => void
}

function AdminDropdownMenu({
  trigger,
  items,
  align = 'end',
}: {
  trigger: React.ReactElement
  items: AdminDropdownMenuItem[]
  align?: 'start' | 'end' | 'center'
}) {
  const shellRef = useAdminShell()

  return (
    <MenuPrimitive.Root>
      <MenuPrimitive.Trigger
        render={trigger}
        className="outline-none"
      />
      <MenuPrimitive.Portal container={shellRef}>
        <MenuPrimitive.Positioner
          align={align}
          sideOffset={6}
          className="z-50"
        >
          <MenuPrimitive.Popup className="min-w-44 rounded-xl border border-admin-border bg-admin-surface p-1.5 text-admin-fg shadow-2xl outline-none data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95">
            {items.map((item, idx) => {
              if (item.type === 'separator') {
                return (
                  <div
                    key={idx}
                    role="separator"
                    className="my-1 h-px bg-admin-border"
                  />
                )
              }
              const Icon = item.icon
              return (
                <MenuPrimitive.Item
                  key={idx}
                  disabled={item.disabled}
                  onSelect={item.onSelect}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium outline-none select-none data-highlighted:bg-admin-surface-raised data-disabled:cursor-not-allowed data-disabled:opacity-50',
                    item.destructive
                      ? 'text-admin-danger data-highlighted:bg-admin-danger-soft'
                      : 'text-admin-fg'
                  )}
                >
                  {Icon && <Icon className="w-4 h-4 shrink-0" />}
                  {item.label}
                </MenuPrimitive.Item>
              )
            })}
          </MenuPrimitive.Popup>
        </MenuPrimitive.Positioner>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  )
}

export { AdminDropdownMenu }