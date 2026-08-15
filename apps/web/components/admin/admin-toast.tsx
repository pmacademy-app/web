'use client'

import * as React from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastVariant = 'success' | 'error' | 'info'

interface Toast {
  id: number
  variant: ToastVariant
  message: string
}

interface AdminToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void
}

const AdminToastContext = React.createContext<AdminToastContextValue | null>(null)

const VARIANT_STYLES: Record<ToastVariant, { icon: React.ElementType; box: string; iconColor: string }> = {
  success: { icon: CheckCircle2, box: 'border-admin-success/25 bg-admin-success-soft', iconColor: 'text-admin-success' },
  error: { icon: AlertCircle, box: 'border-admin-danger/25 bg-admin-danger-soft', iconColor: 'text-admin-danger' },
  info: { icon: Info, box: 'border-admin-info/25 bg-admin-info-soft', iconColor: 'text-admin-info' },
}

export function AdminToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])
  const idRef = React.useRef(0)

  const dismiss = React.useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = React.useCallback(
    (message: string, variant: ToastVariant = 'info') => {
      const id = ++idRef.current
      setToasts((prev) => [...prev, { id, variant, message }])
      setTimeout(() => dismiss(id), 4000)
    },
    [dismiss]
  )

  const value = React.useMemo(() => ({ toast }), [toast])

  return (
    <AdminToastContext.Provider value={value}>
      {children}
      {/* Toast viewport */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-full max-w-sm">
        {toasts.map((t) => {
          const styles = VARIANT_STYLES[t.variant]
          const Icon = styles.icon
          return (
            <div
              key={t.id}
              role="status"
              className={cn(
                'pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-admin-surface p-3 text-admin-fg shadow-xl animate-in slide-in-from-bottom-2 fade-in duration-200',
                styles.box
              )}
            >
              <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', styles.iconColor)} />
              <p className="flex-1 text-xs font-medium leading-relaxed">{t.message}</p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="rounded p-0.5 text-admin-fg-muted transition-colors hover:text-admin-fg"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </AdminToastContext.Provider>
  )
}

export function useAdminToast() {
  const ctx = React.useContext(AdminToastContext)
  if (!ctx) {
    throw new Error('useAdminToast must be used within an AdminToastProvider')
  }
  return ctx
}