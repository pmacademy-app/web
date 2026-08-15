import * as React from 'react'
import { Drawer as DrawerPrimitive } from '@base-ui/react/drawer'
import { cn } from '@/lib/utils'
import { XIcon } from 'lucide-react'
import { useAdminShell } from './admin-shell-context'

/**
 * Admin drawer — slide-over panel built on Base UI Drawer.
 * Usage:
 *   <AdminDrawer open={open} onOpenChange={setOpen} title="Title">
 *     content
 *   </AdminDrawer>
 */
function AdminDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  side = 'right',
  size = 'md',
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
  side?: 'left' | 'right'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const sideClass =
    side === 'right' ? 'right-0 top-0 h-full' : 'left-0 top-0 h-full'
  const sizeClass = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-md'
  const shellRef = useAdminShell()

  return (
    <DrawerPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DrawerPrimitive.Portal container={shellRef}>
        <DrawerPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0" />
        <DrawerPrimitive.Popup
          className={cn(
            'fixed z-50 flex w-full flex-col gap-4 bg-admin-surface p-5 text-admin-fg shadow-2xl outline-none ring-1 ring-admin-border duration-200 data-closed:animate-out data-open:animate-in',
            sizeClass,
            side === 'right'
              ? 'data-closed:slide-out-to-right data-open:slide-in-from-right'
              : 'data-closed:slide-out-to-left data-open:slide-in-from-left',
            sideClass,
            className
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <DrawerPrimitive.Title className="text-lg font-bold text-admin-fg">
                {title}
              </DrawerPrimitive.Title>
              {description && (
                <DrawerPrimitive.Description className="text-sm text-admin-fg-muted">
                  {description}
                </DrawerPrimitive.Description>
              )}
            </div>
            <DrawerPrimitive.Close
              render={
                <button
                  type="button"
                  aria-label="Close"
                  className="rounded-lg p-1.5 text-admin-fg-muted transition-colors hover:bg-admin-surface-raised hover:text-admin-fg"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              }
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  )
}

export { AdminDrawer }
