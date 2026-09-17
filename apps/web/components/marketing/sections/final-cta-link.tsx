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

export function FinalCtaLink() {
  return (
    <Link
      href="/signup"
      onClick={() => trackHeroCTAClick('final_cta')}
      className="
        group relative inline-flex items-center justify-center gap-2.5 w-full sm:w-auto
        px-8 py-4 bg-primary text-white font-semibold text-sm rounded-xl
        shadow-[0_4px_20px_rgba(31,107,78,0.25)]
        hover:bg-[#18553E] hover:shadow-[0_6px_25px_rgba(31,107,78,0.35)]
        transition-all duration-200 overflow-hidden
        hover:scale-[1.02] active:scale-[0.98]
        motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus
      "
    >
      {/* Shimmer sweep */}
      <span
        aria-hidden="true"
        className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none motion-reduce:transition-none"
      />
      <span>Start Learning Free</span>
      <ArrowRight
        size={16}
        className="transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none"
        aria-hidden="true"
      />
    </Link>
  )
}
