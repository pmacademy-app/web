'use client'

import React, { useCallback, useEffect, useRef } from 'react'
import { XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AdminModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}

/**
 * Accessible modal dialog shared across the admin panel.
 *
 * - `role="dialog"` + `aria-modal` + labelled by `title`
 * - Escape closes the dialog
 * - Focus is trapped inside while open
 * - Focus returns to the previously focused element on close
 * - Backdrop click closes the dialog
 */
export function AdminModal({ open, onClose, title, description, children, className }: AdminModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const dialog = dialogRef.current
      if (!dialog) return

      const focusable = dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    },
    [onClose]
  )

  useEffect(() => {
    if (!open) return
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null
    document.addEventListener('keydown', handleKeyDown)
    // Move focus into the dialog on open.
    const timer = window.setTimeout(() => {
      dialogRef.current?.querySelector<HTMLElement>('input, textarea, select, button, a[href]')?.focus()
    }, 0)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      window.clearTimeout(timer)
      previouslyFocusedRef.current?.focus?.()
    }
  }, [open, handleKeyDown])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-modal-title"
      aria-describedby={description ? 'admin-modal-description' : undefined}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className={cn('bg-admin-surface border border-admin-border rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 relative', className)}
      >
        <div className="flex items-center justify-between border-b border-admin-border pb-4">
          <div>
            <h3 id="admin-modal-title" className="text-base font-bold text-admin-fg">
              {title}
            </h3>
            {description && (
              <p id="admin-modal-description" className="text-xs text-admin-fg-muted mt-0.5">
                {description}
              </p>
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
      </div>
    </div>
  )
}