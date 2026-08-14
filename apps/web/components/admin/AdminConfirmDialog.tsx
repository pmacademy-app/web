import * as React from 'react'
import { AlertDialog as AlertDialogPrimitive } from '@base-ui/react/alert-dialog'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAdminShell } from './admin-shell-context'

/**
 * Admin confirm dialog — destructive or confirm actions.
 * Usage:
 *   <AdminConfirmDialog
 *     open={open}
 *     onOpenChange={setOpen}
 *     title="Delete user?"
 *     description="This action cannot be undone."
 *     confirmLabel="Delete"
 *     destructive
 *     onConfirm={handleDelete}
 *   />
 */
function AdminConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm?: () => void
  onCancel?: () => void
}) {
  const shellRef = useAdminShell()

  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal container={shellRef}>
        <AlertDialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0" />
        <AlertDialogPrimitive.Popup className="fixed top-1/2 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-admin-surface p-5 text-admin-fg shadow-2xl ring-1 ring-admin-border outline-none duration-100 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95">
          <div className="space-y-1.5">
            <AlertDialogPrimitive.Title className="text-base font-bold text-admin-fg">
              {title}
            </AlertDialogPrimitive.Title>
            {description && (
              <AlertDialogPrimitive.Description className="text-sm text-admin-fg-muted">
                {description}
              </AlertDialogPrimitive.Description>
            )}
          </div>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogPrimitive.Close
              render={<Button variant="outline" />}
              onClick={onCancel}
              className="border-admin-border text-admin-fg-muted hover:bg-admin-surface-raised hover:text-admin-fg"
            >
              {cancelLabel}
            </AlertDialogPrimitive.Close>
            <AlertDialogPrimitive.Close
              render={
                <Button variant={destructive ? 'destructive' : 'default'} />
              }
              onClick={onConfirm}
              className={cn(destructive ? '' : 'bg-admin-accent text-admin-accent-fg hover:bg-admin-accent/90')}
            >
              {confirmLabel}
            </AlertDialogPrimitive.Close>
          </div>
        </AlertDialogPrimitive.Popup>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  )
}

export { AdminConfirmDialog }
