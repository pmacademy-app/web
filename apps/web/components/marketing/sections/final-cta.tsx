import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'

import { Reveal } from '@/components/marketing/motion/reveal'
import { FinalCtaLink } from '@/components/marketing/sections/final-cta-link'
import { BUTTON_SECONDARY, CONTAINER, SECTION_LEAD } from '@/components/marketing/styles'

interface FinalCTASectionProps {
  showTrustStrip?: boolean
}

/**
 * Final CTA section — Minimalist, elegant layout with direct action controls.
 *
 * ## B12-B — server component
 *
 * The whole section was `'use client'` for two things: a `whileInView` fade on the
 * container and a `whileHover`/`whileTap` scale on the primary button. The first is now
 * `<Reveal>` (IntersectionObserver plus a CSS transition), the second is CSS
 * `hover:scale`. The analytics click handler is the only genuine client requirement and
 * lives in `FinalCtaLink`; the event it fires is unchanged.
 */
export function FinalCTASection({ showTrustStrip = false }: FinalCTASectionProps) {
  return (
    <section
      id="final-cta"
      aria-labelledby="cta-heading"
      className="relative py-24 lg:py-32 overflow-hidden border-t border-border/80 bg-background scroll-mt-24 lg:scroll-mt-28 isolate"
    >
      {/* Subtle ambient light for soft depth. Tinted from the primary token, drifts
          slowly, and holds still for reduced-motion users. */}
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 -z-10 h-[460px] w-[760px] max-w-[140vw] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
      >
        <div className="h-full w-full rounded-full blur-3xl bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--color-primary)_13%,transparent),transparent)] animate-ambient motion-reduce:animate-none" />
      </div>
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 pointer-events-none bg-[radial-gradient(color-mix(in_srgb,var(--color-primary)_9%,transparent)_1px,transparent_1px)] bg-[size:22px_22px] [mask-image:radial-gradient(ellipse_55%_60%_at_50%_50%,#000_20%,transparent_75%)]"
      />
      <div className={`relative ${CONTAINER}`}>
        <Reveal
          amount={0.3}
          className="max-w-[720px] mx-auto text-center flex flex-col items-center"
        >
          {/* Trust Strip — only shown when specified */}
          {showTrustStrip && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface border border-border text-xs text-ink-muted font-medium mb-5 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-primary inline-block" />
              Built for the first wave of learners. Help shape what comes next.
            </div>
          )}

          {/* Headline */}
          <h2
            id="cta-heading"
            className="font-display text-[2rem] sm:text-5xl lg:text-[3.25rem] font-semibold text-foreground tracking-[-0.035em] leading-[1.08] text-balance"
          >
            Build the portfolio that shows what you can do.
          </h2>

          {/* Subtitle */}
          <p className={`mt-5 max-w-[560px] ${SECTION_LEAD}`}>
            Ninety lessons, nine applied capstones, and a portfolio you keep. No fee, no
            trial, no card.
          </p>

          {/* CTA Action Group */}
          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto">
            <FinalCtaLink />

            {/* Same secondary as the hero: read the product before committing to it. */}
            <Link href="/lessons/lesson-001" className={`${BUTTON_SECONDARY} w-full sm:w-auto`}>
              <span>Read a sample lesson</span>
            </Link>
          </div>

          {/* Minimalist Trust Features */}
          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-ink-muted">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 size={13} className="text-primary" />
              90 lessons
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 size={13} className="text-primary" />
              9 applied capstones
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 size={13} className="text-primary" />
              Public portfolio
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
