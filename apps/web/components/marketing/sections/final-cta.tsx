import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'

import { Reveal } from '@/components/marketing/motion/reveal'
import { FinalCtaLink } from '@/components/marketing/sections/final-cta-link'

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
      className="relative py-24 lg:py-32 overflow-hidden border-t border-[#DED8CB]/80 bg-background scroll-mt-24 lg:scroll-mt-28"
    >
      {/* Subtle ambient light vignette for soft depth */}
      <div className="relative max-w-[1120px] mx-auto px-5 lg:px-8">
        <Reveal
          amount={0.3}
          className="max-w-[720px] mx-auto text-center flex flex-col items-center"
        >
          {/* Trust Strip — only shown when specified */}
          {showTrustStrip && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-card border border-border text-xs text-muted-foreground font-medium mb-4 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-primary inline-block" />
              Built for the first wave of learners. Help shape what comes next.
            </div>
          )}

          {/* Headline */}
          <h2
            id="cta-heading"
            className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-foreground tracking-[-0.03em] leading-[1.16]"
          >
            Build the portfolio that shows what you can do.
          </h2>

          {/* Subtitle */}
          <p className="mt-4 text-base sm:text-lg text-[#70685A] leading-relaxed max-w-[560px]">
            Work through 90 lessons, complete applied capstones, and turn your strongest product work into a public portfolio. Start building for free, permanently.
          </p>

          {/* CTA Action Group */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto">
            <FinalCtaLink />

            <Link
              href="/curriculum"
              className="
                inline-flex items-center justify-center gap-2 w-full sm:w-auto
                px-6 py-4 bg-white text-foreground font-semibold text-sm rounded-xl
                border border-[#DED8CB] hover:border-[#BDB4A2] hover:bg-[#F2EFE7]
                shadow-2xs active:scale-[0.98] transition-all duration-150
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus
              "
            >
              <span>Explore Curriculum</span>
            </Link>
          </div>

          {/* Minimalist Trust Features */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-[#70685A]">
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
