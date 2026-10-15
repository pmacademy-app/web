'use client'

/**
 * The final CTA's primary action (B12-B).
 *
 * Same split as `HeroCtaLink`, same reason: `trackHeroCTAClick` is an event handler, and
 * isolating it leaves the rest of the section on the server. The event and its
 * `'final_cta'` argument are unchanged.
 *
 * Inverse pill for the deep closing band (BAND_DEEP): `bg-primary-foreground` with
 * `text-primary`, which the band keeps legible in light and dark (about 6.4:1 on the
 * light band). The trailing arrow sits in ARROW_BUBBLE, re-tinted from the button's own
 * text colour so the circle shows on the light pill. Press feedback (`active:scale`)
 * comes from BUTTON_PRIMARY; the focus ring is the band's re-pointed focus colour,
 * offset in the band colour so it reads against the green.
 *
 * Signed-in visitors see "Go to dashboard", matching `HeroCtaLink`. `useSessionCta`
 * returns false until the session check answers, so server HTML and first client
 * render agree. Both states share one footprint, so the swap does not shift layout.
 */

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { useSessionCta } from '@/hooks/use-session-cta'
import { trackDashboardCTAClick, trackHeroCTAClick } from '@/lib/analytics'
import { ARROW_BUBBLE, BUTTON_PRIMARY } from '@/components/marketing/styles'
import { cn } from '@/lib/utils'

/**
 * BUTTON_PRIMARY inverted for the deep band. Same footprint for both labels (min width),
 * so the authenticated swap does not shift layout.
 */
const INVERSE = cn(
  BUTTON_PRIMARY,
  'w-full sm:w-auto sm:min-w-[15.5rem] justify-between',
  'bg-primary-foreground text-primary hover:bg-primary-foreground/90',
  'focus-visible:ring-offset-primary',
)

/** ARROW_BUBBLE re-tinted for a light pill: the circle takes the button's text colour at low alpha. */
const BUBBLE = cn(ARROW_BUBBLE, 'bg-primary/10')

export function FinalCtaLink() {
  const { authenticated } = useSessionCta()

  if (authenticated) {
    return (
      <Link
        href="/dashboard"
        onClick={() => trackDashboardCTAClick('final_cta')}
        className={INVERSE}
      >
        <span>Go to dashboard</span>
        <span aria-hidden="true" className={BUBBLE}>
          <ArrowRight size={15} />
        </span>
      </Link>
    )
  }

  return (
    <Link
      href="/signup"
      onClick={() => trackHeroCTAClick('final_cta')}
      className={INVERSE}
    >
      <span>Start Learning Free</span>
      <span aria-hidden="true" className={BUBBLE}>
        <ArrowRight size={15} />
      </span>
    </Link>
  )
}
