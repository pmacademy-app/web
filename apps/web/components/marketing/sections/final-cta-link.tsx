'use client'

/**
 * The final CTA's primary action (B12-B).
 *
 * Same split as `HeroCtaLink`, same reason: `trackHeroCTAClick` is an event handler, and
 * isolating it leaves the rest of the section on the server. The event and its
 * `'final_cta'` argument are unchanged — B12-B excludes analytics changes.
 *
 * The `whileHover`/`whileTap` scale that used to wrap this in a `motion.div` is CSS.
 */

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { trackHeroCTAClick } from '@/lib/analytics'
import { ARROW_NUDGE, BUTTON_PRIMARY } from '@/components/marketing/styles'

export function FinalCtaLink() {
  return (
    <Link
      href="/signup"
      onClick={() => trackHeroCTAClick('final_cta')}
      className={`${BUTTON_PRIMARY} overflow-hidden w-full sm:w-auto px-8`}
    >
      {/* Light sweep on hover. Hover-capable pointers only, so it never sticks on touch. */}
      <span
        aria-hidden="true"
        className="absolute inset-0 -translate-x-full [@media(hover:hover)]:group-hover:translate-x-full transition-transform duration-700 ease-out-quint bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none motion-reduce:hidden"
      />
      <span className="relative">Start Learning Free</span>
      <ArrowRight size={16} aria-hidden="true" className={`relative ${ARROW_NUDGE}`} />
    </Link>
  )
}
