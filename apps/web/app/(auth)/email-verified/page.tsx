'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, XCircle, ArrowRight } from 'lucide-react'

/**
 * Dedicated landing page for the Change Email confirmation link
 * (Settings → Security → Change Email → /api/auth/callback → here).
 * Mirrors the existing /verified (signup) page's structure and styling.
 */
function EmailVerifiedContent() {
  const searchParams = useSearchParams()
  const isError = searchParams.get('status') === 'error'

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 animate-fade-in">
        <div className="w-full max-w-md bg-card border border-border rounded-2xl p-8 md:p-10 shadow-lg text-center space-y-6">
          <div className="flex justify-center">
            <div className="flex items-center justify-center w-20 h-20 rounded-full bg-destructive/10 text-destructive border border-destructive/20 animate-scale-in">
              <XCircle className="h-10 w-10" />
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-bold font-serif text-foreground">Link Expired or Invalid</h1>
            <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mx-auto">
              This email confirmation link is no longer valid — it may have expired or already been used. Your email address has not been changed.
            </p>
          </div>

          <div className="pt-4">
            <Link
              href="/settings?tab=security"
              className="inline-flex items-center justify-center w-full rounded-xl bg-primary px-6 py-3.5 text-sm font-bold text-primary-foreground shadow hover:bg-primary/95 transition-all group"
            >
              Request the Change Again
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 animate-fade-in">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-8 md:p-10 shadow-lg text-center space-y-6">
        <div className="flex justify-center">
          <div className="flex items-center justify-center w-20 h-20 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 animate-scale-in">
            <CheckCircle2 className="h-10 w-10" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-bold font-serif text-foreground">Email Address Updated!</h1>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mx-auto">
            Your new email address has been confirmed and is now active on your account.
          </p>
        </div>

        <div className="pt-4">
          <Link
            href="/settings?tab=security"
            className="inline-flex items-center justify-center w-full rounded-xl bg-primary px-6 py-3.5 text-sm font-bold text-primary-foreground shadow hover:bg-primary/95 transition-all group"
          >
            Go to Security Settings
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function EmailVerifiedPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 text-center">
          <h1 className="text-2xl font-bold font-serif text-foreground mb-2">Confirming your email…</h1>
        </div>
      }
    >
      <EmailVerifiedContent />
    </Suspense>
  )
}
