'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { Cookie } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCookieConsent, useCookiePreferencesReopen } from '@/hooks/use-cookie-consent'

/**
 * Consent banner for non-essential cookies.
 *
 * Scope: Google Analytics 4, Google Tag Manager (when configured) and the 30-day
 * `prodily_referrer` attribution cookie. Authentication session cookies are
 * strictly necessary and are not covered — accepting or rejecting here never
 * affects a signed-in session.
 *
 * Accept and Reject are given equal visual weight on purpose: a reject path that is
 * harder to find than the accept path is not a free choice.
 */
export function CookieConsentBanner() {
  const { isHydrated, hasDecided, accept, reject } = useCookieConsent()
  const [isReopened, setIsReopened] = useState(false)

  const handleReopen = useCallback(() => setIsReopened(true), [])
  useCookiePreferencesReopen(handleReopen)

  const handleAccept = useCallback(() => {
    accept()
    setIsReopened(false)
  }, [accept])

  const handleReject = useCallback(() => {
    reject()
    setIsReopened(false)
  }, [reject])

  // Nothing renders server-side or before hydration: the decision lives in a cookie
  // this component can only read in the browser.
  if (!isHydrated) return null
  if (hasDecided && !isReopened) return null

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Cookie preferences"
      className="fixed inset-x-0 bottom-0 z-50 p-4 sm:p-6"
    >
      <div className="mx-auto max-w-3xl rounded-xl border border-border bg-card p-5 shadow-lg">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex-1 space-y-2">
            <p className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Cookie className="h-4 w-4 text-primary" aria-hidden="true" />
              Cookies on this site
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Cookies needed to sign you in and keep you signed in are always on. We would also like
              to set optional cookies for anonymous usage analytics and to credit a learner who
              referred you. Nothing optional is loaded until you choose.{' '}
              <Link href="/privacy" className="font-semibold text-primary hover:underline">
                Read the Privacy Policy
              </Link>
              .
            </p>
          </div>

          <div className="flex shrink-0 flex-col gap-2 sm:w-44">
            <Button type="button" onClick={handleAccept} className="w-full">
              Accept optional
            </Button>
            <Button type="button" variant="outline" onClick={handleReject} className="w-full">
              Reject optional
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
