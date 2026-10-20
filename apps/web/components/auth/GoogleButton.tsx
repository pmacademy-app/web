'use client'

import type React from 'react'
import { cn } from '@/lib/utils'

export interface GoogleButtonProps {
  /** Start-route href, normally from buildGoogleStartHref(). */
  href: string
  /** When true the control is announced as unavailable and does not navigate. */
  disabled?: boolean
  className?: string
  /** Id of text that explains the control, e.g. why it is unavailable. */
  'aria-describedby'?: string
}

/**
 * "Continue with Google" control, following Google's sign-in branding guidelines:
 * the unmodified multicolour G on a neutral white surface, a #747775 outline and
 * #1F1F1F label (well above 4.5:1 contrast), 40px tall, logo on the left.
 *
 * It is an anchor, not a button: the OAuth start is a full-page navigation to a
 * server route, so a plain <a href> (not next/link, which would try a client-side
 * fetch of an API route) is the honest element. When disabled the href is removed and
 * clicks are cancelled so nothing can navigate, while `aria-disabled` keeps it in the
 * accessibility tree and the tab order as an unavailable link, so keyboard and
 * screen-reader users can still reach it and hear why (via `aria-describedby`).
 *
 * Only the label and outline dim when disabled. The G logo is never altered, per
 * Google's branding rules.
 */
export function GoogleButton({
  href,
  disabled = false,
  className,
  'aria-describedby': ariaDescribedBy,
}: GoogleButtonProps) {
  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (disabled) event.preventDefault()
  }

  return (
    <a
      href={disabled ? undefined : href}
      role="link"
      aria-disabled={disabled ? 'true' : undefined}
      aria-describedby={ariaDescribedBy}
      // Without an href an anchor is not focusable, so keep it in the tab order.
      tabIndex={disabled ? 0 : undefined}
      onClick={handleClick}
      className={cn(
        'inline-flex h-10 w-full select-none items-center justify-center gap-2.5 rounded-lg border px-3',
        'border-[#747775] bg-white text-sm font-medium text-[#1F1F1F] shadow-xs',
        'transition-colors outline-none',
        'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
        disabled
          ? 'cursor-not-allowed border-[#1F1F1F]/15 text-[#1F1F1F]/40'
          : 'cursor-pointer hover:bg-[#F2F2F2] active:bg-[#E8E8E8]',
        className
      )}
    >
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 48 48"
        className="h-[18px] w-[18px] shrink-0"
      >
        <path
          fill="#EA4335"
          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
        />
        <path
          fill="#4285F4"
          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
        />
        <path
          fill="#FBBC05"
          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
        />
        <path
          fill="#34A853"
          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
        />
      </svg>
      <span>Continue with Google</span>
    </a>
  )
}
