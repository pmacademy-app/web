'use client'

/**
 * Global error boundary — Sprint 3 error copy verbatim.
 * Must be a Client Component (Next.js requirement).
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
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
