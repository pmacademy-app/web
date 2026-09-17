import * as React from 'react'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export interface ErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string
  description?: string
  error?: string | Error | null
  onRetry?: () => void
  retryLabel?: string
  action?: React.ReactNode
}

/**
 * Learner error state — displayed when a request, query, or operation fails.
 * Mirrors AdminErrorState while utilizing learner design-system tokens and B11-A Button primitive.
 */
export function ErrorState({
  title = 'Something went wrong',
  description = 'We could not load this content. Please try again.',
  error,
  onRetry,
  retryLabel = 'Try again',
  action,
  className,
  ...props
}: ErrorStateProps) {
  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : null

  return (
    <div
      role="alert"
      aria-live="assertive"
      data-slot="error-state"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-2xl border border-destructive/25 bg-destructive/5 p-8 md:p-12 text-center shadow-xs',
        className
      )}
      {...props}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/10 text-destructive">
        <AlertTriangle className="h-6 w-6 stroke-[1.5]" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-bold font-serif text-foreground">{title}</h3>
        <p className="max-w-md text-xs text-muted-foreground leading-relaxed">{description}</p>
        {errorMessage && (
          <p className="mx-auto max-w-md rounded-lg bg-background/80 border border-destructive/20 px-3 py-2 font-mono text-[11px] text-destructive break-all">
            {errorMessage}
          </p>
        )}
      </div>
      {(onRetry || action) && (
        <div className="mt-2 flex items-center justify-center gap-2">
          {onRetry && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="rounded-xl font-bold"
            >
              {retryLabel}
            </Button>
          )}
          {action}
        </div>
      )}
    </div>
  )
}
