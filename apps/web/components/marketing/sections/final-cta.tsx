'use client'

import { motion } from 'framer-motion'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { WaitlistForm } from '@/components/forms/waitlist-form'

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
            Join the waitlist for launch updates, preview lessons, and early access.
          </p>

          <div className="w-full bg-surface border border-border rounded-lg p-6 lg:p-8 shadow-sm">
            <WaitlistForm />
          </div>
        </motion.div>
      </div>
    </section>
  )
}
