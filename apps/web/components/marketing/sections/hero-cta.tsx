'use client'

/**
 * The hero's primary call to action (B12-B).
 *
 * Split out of `hero.tsx` for one reason: `trackHeroCTAClick` is an event handler, and
 * an event handler is the only thing in the hero's left column that genuinely requires
 * the client. Isolating it here lets the rest of the column — headline, subheadline,
 * value anchors, the whole LCP surface — render on the server.
 *
 * The analytics call is unchanged. B12-B explicitly excludes analytics changes, so this
 * fires exactly the same event with exactly the same argument as before; only the module
 * boundary moved.
 *
 * The hover and tap feedback that used to be `whileHover`/`whileTap` on a wrapping
 * `motion.div` is now CSS `hover:scale-[1.025] active:scale-[0.975]`, matching what the
 * shared Button primitive already does. `motion-reduce:` opts out.
 */

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { trackHeroCTAClick } from '@/lib/analytics'
import { ARROW_NUDGE, BUTTON_PRIMARY } from '@/components/marketing/styles'

export function HeroCtaLink() {
  return (
    <Link
      href="/signup"
      onClick={() => trackHeroCTAClick('hero')}
      className={`${BUTTON_PRIMARY} overflow-hidden`}
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
