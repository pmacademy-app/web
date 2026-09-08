'use client'

import React from 'react'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ClassifiedAuthError } from '@/lib/auth/errors'

interface AuthErrorNoticeProps {
  error: Pick<ClassifiedAuthError, 'message' | 'errorId'>
  /** Contextual recovery action, e.g. a link to log in. Rendered under the message. */
  children?: React.ReactNode
  className?: string
}

/**
 * One error treatment for the auth screens.
 *
 * Login, signup and reset-password each rendered their own inline block and had drifted
 * apart: reset-password showed an icon, the other two signalled the failure with colour
 * alone, and the paddings and layout directions no longer matched. Colour-only
 * signalling also fails for anyone who cannot distinguish it, so the icon is part of
 * the contract rather than decoration.
 *
 * Uses the canonical `destructive` tokens. A separate `danger` family exists in
 * `components/feedback/error-state.tsx` but is used by one marketing form only.
 */
export function AuthErrorNotice({ error, children, className }: AuthErrorNoticeProps) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        'flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-3',
        'text-xs font-medium text-destructive',
        className
      )}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="break-words">{error.message}</span>

        {error.errorId && (
          <span className="font-mono text-[11px] opacity-70 break-all">
            Reference {error.errorId}. Include this if you contact support.
          </span>
        )}

        {children}
      </div>
    </div>
  )
}
