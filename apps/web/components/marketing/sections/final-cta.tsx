'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

/**
 * Final CTA section — Sprint 2 §19 + Sprint 3 final CTA copy.
 * Centered layout with WaitlistForm.
 */
export function FinalCTASection() {
  const prefersReducedMotion = useReducedMotion()

  return (
    <section
      id="waitlist"
      aria-labelledby="cta-heading"
      className="py-20 lg:py-28 bg-surface-muted border-t border-border"
    >
      <div className="max-w-[1120px] mx-auto px-5 lg:px-8">
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.24, ease: [0, 0, 0.2, 1] }}
          className="max-w-[560px] mx-auto text-center flex flex-col items-center gap-6"
        >
          <h2
            id="cta-heading"
            className="font-display text-h1 lg:text-display-lg font-semibold text-foreground leading-tight tracking-tight"
          >
            Start building product judgment before you pay for another course.
          </h2>
          <p className="text-body-lg text-locked leading-relaxed">
            90 structured lessons, 9 modules, 9 portfolio capstones, and interactive spaced-repetition flashcards—100% Free Forever.
          </p>

          <div className="w-full bg-surface border border-border rounded-xl p-8 shadow-xs flex flex-col items-center gap-4">
            <Link
              href="/signup"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-primary text-primary-foreground font-bold text-sm rounded-lg shadow-sm hover:opacity-90 transition-all"
            >
              <span>Start Learning Free Now</span>
            </Link>
            <p className="text-xs text-muted-foreground">
              No credit card required. Instant access to all 90 lessons.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
