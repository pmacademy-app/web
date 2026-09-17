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

export function HeroCtaLink() {
  return (
    <Link
      href="/signup"
      onClick={() => trackHeroCTAClick('hero')}
      className="
        group relative overflow-hidden inline-flex items-center gap-2.5 px-6 py-3.5
        bg-primary text-white font-semibold text-sm rounded-lg
        shadow-[0_2px_14px_rgba(31,107,78,0.3)]
        hover:bg-[#18553E] hover:shadow-[0_4px_24px_rgba(31,107,78,0.45)]
        transition-all duration-200
        hover:scale-[1.025] active:scale-[0.975]
        motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F80ED]
      "
    >
      {/* Shimmer light sweep on hover */}
      <span
        aria-hidden="true"
        className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none motion-reduce:transition-none"
      />

      <span className="relative z-10">Start Learning Free</span>
      <ArrowRight
        size={16}
        aria-hidden="true"
        className="relative z-10 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none"
      />
    </Link>
  )
}
