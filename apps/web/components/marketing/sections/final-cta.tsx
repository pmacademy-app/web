'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

interface FinalCTASectionProps {
  showTrustStrip?: boolean
}

/**
 * Final CTA section — Sprint 2 §19 + Sprint 3 final CTA copy.
 * Centered layout with WaitlistForm.
 * showTrustStrip: only shown when testimonials count is 0 (spec §7).
 */
export function FinalCTASection({ showTrustStrip = false }: FinalCTASectionProps) {
  const prefersReducedMotion = useReducedMotion()

  return (
    <section
      id="final-cta"
      aria-labelledby="cta-heading"
      className="py-20 lg:py-28 bg-surface-muted border-t border-border scroll-mt-24 lg:scroll-mt-28"
    >
      <div className="max-w-[1120px] mx-auto px-5 lg:px-8">
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.24, ease: [0, 0, 0.2, 1] }}
          className="max-w-[640px] mx-auto text-center flex flex-col items-center gap-6"
        >
          {/* Trust Strip — only shown when 0 testimonials */}
          {showTrustStrip && (
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-surface border border-border text-caption text-locked font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              Built for the first wave of learners — help shape what comes next.
            </div>
          )}

          <h2
            id="cta-heading"
            className="font-display text-h1 lg:text-display-lg font-semibold text-foreground leading-tight tracking-tight"
          >
            Start building your portfolio. Not another line on your resume that says &ldquo;took a course.&rdquo;
          </h2>
          <p className="text-body-lg text-locked leading-relaxed">
            90 lessons, 9 capstone projects, a public portfolio. Free, permanently.
          </p>

          <div className="w-full bg-surface border border-border rounded-xl p-8 shadow-xs flex flex-col items-center gap-4">
            <Link
              href="/signup"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-primary text-white hover:text-white font-bold text-sm rounded-lg shadow-sm hover:opacity-90 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:text-white"
            >
              <span>Start Learning Free</span>
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
