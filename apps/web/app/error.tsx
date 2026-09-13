'use client'

import { useEffect } from 'react'

/**
 * Root segment error boundary. It renders *inside* the root layout, so it must
 * not emit its own document shell — a nested html/body pair breaks
 * hydration (F-COR-5). The document-shell version lives in
 * `app/global-error.tsx`, which only runs when the root layout itself fails.
 *
 * Route groups carry their own boundaries (`app/(app)/error.tsx`,
 * `app/admin/(console)/error.tsx`); this one catches everything outside them.
 */
export default function RootSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[RootSegmentError Boundary] Logged:', error)
  }, [error])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center bg-background">
      <p className="text-body-sm text-locked font-medium mb-3">500</p>
      <h1 className="text-h1 font-semibold text-foreground mb-3">
        We hit an unexpected issue.
      </h1>
      <p className="text-body text-locked max-w-[480px] mb-8">
        Refresh the page or try again in a moment.
      </p>
      {error.digest && (
        <p className="text-body-sm text-locked font-mono mb-8 break-all">
          Error ID: {error.digest}
        </p>
      )}
      <button
        type="button"
        onClick={reset}
        className="
          inline-flex items-center px-5 py-2.5
          bg-primary text-primary-foreground
          text-body-sm font-medium rounded-sm
          hover:opacity-90 active:scale-[0.98]
          transition-all duration-[120ms]
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus
        "
      >
        Refresh
      </button>
    </div>
  )
}
