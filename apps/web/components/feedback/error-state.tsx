'use client'

import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ErrorStateProps {
  message?: string
  onRetry?: () => void
  className?: string
}

/**
 * Inline error state for form and API failures.
 * Sprint 3 error copy patterns.
 */
export function ErrorState({
  message = 'Something went wrong on our side. Try again in a moment.',
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        'flex items-start gap-3 p-4 rounded-md',
        'bg-danger-bg border border-danger/20',
        className,
      )}
    >
      <AlertCircle
        size={18}
        className="text-danger flex-shrink-0 mt-0.5"
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <p className="text-body-sm text-foreground">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="
              mt-2 text-body-sm font-medium text-primary
              hover:underline underline-offset-2
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-xs
              transition-colors duration-[120ms]
            "
          >
            Try Again
          </button>
        )}
      </div>
    </div>
  )
}
