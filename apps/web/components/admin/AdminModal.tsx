'use client'

import React from 'react'
import { XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

interface AdminModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}

/**
 * Accessible modal dialog shared across the admin panel, built on base-ui Dialog.
 *
 * - base-ui Dialog primitive provides focus trap, Escape dismissal, and focus restoration
 * - Labelled by DialogTitle and DialogDescription
 */
export function AdminModal({ open, onClose, title, description, children, className }: AdminModalProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent
        showCloseButton={false}
        className={cn('bg-admin-surface border border-admin-border rounded-2xl max-w-lg w-full max-h-[calc(100dvh-2rem)] overflow-y-auto p-6 shadow-2xl space-y-5 relative', className)}
      >
        <div className="flex items-center justify-between border-b border-admin-border pb-4">
          <div>
            <DialogTitle className="text-base font-bold text-admin-fg">
              {title}
            </DialogTitle>
            {description && (
              <DialogDescription className="text-xs text-admin-fg-muted mt-0.5">
                {description}
              </DialogDescription>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 text-admin-fg-muted hover:text-admin-fg rounded-lg transition-colors cursor-pointer"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        {children}
      </DialogContent>
    </Dialog>
  )
}