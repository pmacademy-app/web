'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RotateCcw, Home } from 'lucide-react'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an analytics or reporting service
    console.error('[AppError Boundary] Logged:', error)
  }, [error])

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6 space-y-6">
      <div className="p-4 rounded-full bg-destructive/10 text-destructive border border-destructive/20 animate-bounce">
        <AlertTriangle className="w-10 h-10" />
      </div>

      <div className="space-y-2 max-w-md">
        <h2 className="text-2xl font-bold font-serif text-foreground">
          Something went wrong
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          We encountered an unexpected issue while rendering this section of the academy.
        </p>
        {error.message && (
          <p className="text-xs font-mono bg-secondary/80 text-muted-foreground p-3 rounded-lg border border-border/80 break-words mt-2 max-h-32 overflow-y-auto">
            {error.message}
          </p>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs justify-center pt-2">
        <button
          type="button"
          onClick={reset}
          className="flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 px-4 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
          Try Again
        </button>
        <Link
          href="/dashboard"
          className="flex items-center justify-center gap-2 rounded-lg border border-input bg-card py-2.5 px-4 text-sm font-semibold text-foreground shadow hover:bg-secondary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-colors"
        >
          <Home className="w-4 h-4 text-muted-foreground" />
          Dashboard Home
        </Link>
      </div>
    </div>
  )
}
