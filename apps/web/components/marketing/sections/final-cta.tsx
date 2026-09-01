'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { trackHeroCTAClick } from '@/lib/analytics'

interface FinalCTASectionProps {
  showTrustStrip?: boolean
}

/**
 * Final CTA section — Minimalist, elegant layout with direct action controls.
 */
export function FinalCTASection({ showTrustStrip = false }: FinalCTASectionProps) {
  const prefersReducedMotion = useReducedMotion()

  return (
    <section
      id="final-cta"
      aria-labelledby="cta-heading"
      className="relative py-24 lg:py-32 overflow-hidden border-t border-[#DED8CB]/80 bg-[#FBFAF6] scroll-mt-24 lg:scroll-mt-28"
    >
      {/* Subtle ambient light vignette for soft depth */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-30"
      >
        <div className="w-[600px] h-[300px] rounded-full bg-[#1F6B4E]/10 blur-[90px]" />
      </div>

      <div className="relative max-w-[1120px] mx-auto px-5 lg:px-8">
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.24, ease: [0, 0, 0.2, 1] }}
          className="max-w-[720px] mx-auto text-center flex flex-col items-center"
        >
          {/* Trust Strip — only shown when specified */}
          {showTrustStrip && (
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-[#DED8CB] text-xs text-[#70685A] font-medium mb-4 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-[#1F6B4E] inline-block" />
              Built for the first wave of learners. Help shape what comes next.
            </div>
          )}

          {/* Headline */}
          <h2
            id="cta-heading"
            className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-[#171A17] tracking-[-0.03em] leading-[1.16]"
          >
            Start building your portfolio. Not another line on your resume that says &ldquo;took a course.&rdquo;
          </h2>

          {/* Subtitle */}
          <p className="mt-4 text-base sm:text-lg text-[#70685A] leading-relaxed max-w-[560px]">
            90 lessons, 9 applied capstone projects, a public portfolio URL. Free, permanently.
          </p>

          {/* CTA Action Group */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto">
            <motion.div
              whileHover={prefersReducedMotion ? undefined : { scale: 1.02 }}
              whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
              className="w-full sm:w-auto"
            >
              <Link
                href="/signup"
                onClick={() => trackHeroCTAClick('final_cta')}
                className="
                  group relative inline-flex items-center justify-center gap-2.5 w-full sm:w-auto
                  px-8 py-4 bg-[#1F6B4E] text-white font-semibold text-sm rounded-xl
                  shadow-[0_4px_20px_rgba(31,107,78,0.25)]
                  hover:bg-[#18553E] hover:shadow-[0_6px_25px_rgba(31,107,78,0.35)]
                  transition-all duration-200 overflow-hidden
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus
                "
              >
                {/* Shimmer sweep */}
                <span
                  aria-hidden="true"
                  className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none"
                />
                <span>Start Learning Free</span>
                <ArrowRight
                  size={16}
                  className="transition-transform duration-200 group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </Link>
            </motion.div>

            <Link
              href="/curriculum"
              className="
                inline-flex items-center justify-center gap-2 w-full sm:w-auto
                px-6 py-4 bg-white text-[#171A17] font-semibold text-sm rounded-xl
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
              <CheckCircle2 size={13} className="text-[#1F6B4E]" />
              No credit card required
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 size={13} className="text-[#1F6B4E]" />
              Instant access to all 90 lessons
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 size={13} className="text-[#1F6B4E]" />
              Free permanently
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
