'use client'

import React from 'react'
import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AuthSuccessNoticeProps {
  children: React.ReactNode
  className?: string
}

/**
 * Success sibling of `AuthErrorNotice`.
 *
 * The auth screens carried four copies of this block, drifted between `items-center`
 * and `items-start` so a wrapping message aligned differently depending on the screen.
 * Sharing one component keeps success and failure reading as the same system: same
 * padding, radius, icon size and text scale, only the colour role changes.
 *
 * The emerald values are kept rather than moved to the `--color-success` token. That
 * token belongs to the `components/feedback/*` family, while every auth surface —
 * including this component's error sibling — is on the `destructive`/shadcn family.
 * Moving one half of the pair across families would widen the split, not close it.
 */
export function AuthSuccessNotice({ children, className }: AuthSuccessNoticeProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-start gap-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3',
        'text-xs font-medium text-emerald-700 dark:text-emerald-300',
        className
      )}
    >
      <CheckCircle2
        className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 break-words">{children}</span>
    </div>
  )
}
