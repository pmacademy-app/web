'use client'

import { useEffect } from 'react'

// `global-error.tsx` replaces the root layout when it renders, so the stylesheet
// the layout imports is not applied here. Importing it directly is what keeps the
// last-resort error page from rendering unstyled.
import '@/app/globals.css'

/**
 * Root-level error boundary. This is the only boundary that may emit its own
 * `<html>`/`<body>`: it stands in for the root layout, which has itself failed
 * by the time this renders. Segment-level errors are caught earlier by
 * `app/error.tsx` and the nested boundaries, which render inside the layout and
 * must not repeat the document shell (F-COR-5).
 *
 * Must be a Client Component (Next.js requirement).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[GlobalError Boundary] Root layout render failed:', error)
  }, [error])

  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center bg-background">
          <p className="text-body-sm text-locked font-medium mb-3">500</p>
          <h1 className="text-h1 font-semibold text-foreground mb-3">
            We hit an unexpected issue.
          </h1>
          <p className="text-body text-locked max-w-[480px] mb-8">
            Refresh the page or try again in a moment.
          </p>
          <button
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
      </body>
    </html>
  )
}
