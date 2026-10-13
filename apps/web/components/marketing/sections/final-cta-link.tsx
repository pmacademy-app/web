'use client'

/**
 * The final CTA's primary action (B12-B).
 *
 * Same split as `HeroCtaLink`, same reason: `trackHeroCTAClick` is an event handler, and
 * isolating it leaves the rest of the section on the server. The event and its
 * `'final_cta'` argument are unchanged.
 *
 * Flat pill, no hover sweep: the closing band is quiet on purpose, and the press
 * feedback (`active:scale`) comes from BUTTON_PRIMARY.
 *
 * Signed-in visitors see "Go to dashboard", matching `HeroCtaLink`. `useSessionCta`
 * returns false until the session check answers, so server HTML and first client
 * render agree. Both states share one footprint, so the swap does not shift layout.
 */

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { useSessionCta } from '@/hooks/use-session-cta'
import { trackDashboardCTAClick, trackHeroCTAClick } from '@/lib/analytics'
import { ARROW_NUDGE, BUTTON_PRIMARY } from '@/components/marketing/styles'

/** Same footprint for both labels, so the authenticated swap does not shift layout. */
const SIZE = 'w-full sm:w-auto sm:min-w-[15.5rem] px-8'

export function FinalCtaLink() {
  const { authenticated } = useSessionCta()

  if (authenticated) {
    return (
      <Link
        href="/dashboard"
        onClick={() => trackDashboardCTAClick('final_cta')}
        className={`${BUTTON_PRIMARY} ${SIZE}`}
      >
        <span>Go to dashboard</span>
        <ArrowRight size={16} aria-hidden="true" className={ARROW_NUDGE} />
      </Link>
    )
  }

  return (
    <Link
      href="/signup"
      onClick={() => trackHeroCTAClick('final_cta')}
      className={`${BUTTON_PRIMARY} ${SIZE}`}
    >
      <span>Start Learning Free</span>
      <ArrowRight size={16} aria-hidden="true" className={ARROW_NUDGE} />
    </Link>
  )
}
