'use client'

/**
 * The homepage signup call to action (B12-B island, reused after the proof section).
 *
 * A client island because it fires an analytics event on click and asks whether the
 * visitor is signed in. Everything around it renders on the server.
 *
 * Signed-in visitors see "Go to dashboard" instead. `useSessionCta` returns false until
 * the session check answers, so the server HTML and the first client render agree on
 * the signup link. Both states share one pill and a minimum width wide enough for the
 * longer label, so the swap changes the words and not the layout. The trailing arrow
 * sits in its own small circle (ARROW_BUBBLE, button-in-button) that nudges on hover.
 *
 * `location` defaults to 'hero'. The hero path keeps its original literal call so the
 * existing event and its guard test are unchanged; the proof section passes 'portfolio'
 * and the Why section passes 'why', so every signup CTA on the page shares one label.
 */

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { useSessionCta } from '@/hooks/use-session-cta'
import { trackDashboardCTAClick, trackHeroCTAClick } from '@/lib/analytics'
import { ARROW_BUBBLE, BUTTON_PRIMARY } from '@/components/marketing/styles'

type HeroCtaLocation = 'hero' | 'portfolio' | 'why'

interface HeroCtaLinkProps {
  location?: HeroCtaLocation
}

/** Same footprint for both labels, so the authenticated swap does not shift layout. */
const SIZE = 'sm:min-w-[13.5rem]'

export function HeroCtaLink({ location = 'hero' }: HeroCtaLinkProps) {
  const { authenticated } = useSessionCta()

  if (authenticated) {
    return (
      <Link
        href="/dashboard"
        onClick={() => trackDashboardCTAClick(location)}
        className={`${BUTTON_PRIMARY} ${SIZE}`}
      >
        <span>Go to dashboard</span>
        <span aria-hidden="true" className={ARROW_BUBBLE}>
          <ArrowRight size={15} strokeWidth={2.25} />
        </span>
      </Link>
    )
  }

  return (
    <Link
      href="/signup"
      onClick={() => {
        if (location === 'hero') trackHeroCTAClick('hero')
        else trackHeroCTAClick(location)
      }}
      className={`${BUTTON_PRIMARY} ${SIZE}`}
    >
      <span>Start Learning Free</span>
      <span aria-hidden="true" className={ARROW_BUBBLE}>
          <ArrowRight size={15} strokeWidth={2.25} />
        </span>
    </Link>
  )
}
