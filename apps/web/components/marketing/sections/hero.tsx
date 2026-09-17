/**
 * Landing page hero (B12-B — server component).
 *
 * ## What changed and why
 *
 * B12-A measured this page at 529.1 KB of gzipped JavaScript against the 345 KB every
 * other route shares, with 171.7 KB of the difference being framer-motion, and mobile
 * Lighthouse at 44 with a 7.7 s LCP. The hero was the largest single contributor: its
 * entire left column — eyebrow, headline, subheadline, CTAs, value anchors — was inside
 * `motion.div` wrappers purely to fade and slide on mount, which made the whole section
 * a client component and put an animation engine in front of the LCP element.
 *
 * The wrappers are gone; the animation is not. Entry motion is now `animate-in` from
 * tw-animate-css, which is CSS and therefore runs at first paint instead of waiting for
 * 683 KB of JavaScript to parse and execute. Two client islands remain, each for a real
 * reason: `HeroCtaLink` because it fires an analytics event, and `HeroWorkbench` because
 * it owns a timer and interactive state.
 *
 * ## The headline deliberately does not fade
 *
 * An element at `opacity: 0` is not eligible to be the Largest Contentful Paint, so a
 * fade-in on the h1 moves LCP to the end of the animation. The headline and subheadline
 * therefore animate transform only (`slide-in-from-bottom-*` with no `fade-in`), which
 * paints them opaque on the first frame. Decorative elements around them still fade.
 * This is the one visual difference from the previous implementation, and it is the
 * difference the batch exists to make.
 */

import Link from 'next/link'

import { HeroCtaLink } from '@/components/marketing/sections/hero-cta'
import { HeroWorkbench } from '@/components/marketing/sections/hero-workbench'

/** Entry animation for decorative copy. Safe to fade — not an LCP candidate. */
const ENTER = 'animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both motion-reduce:animate-none'

/** Entry animation for LCP candidates. Transform only, so the text paints opaque. */
const ENTER_OPAQUE = 'animate-in slide-in-from-bottom-2 duration-500 fill-mode-both motion-reduce:animate-none'

export function HeroSection() {
  return (
    <section
      id="hero"
      aria-labelledby="hero-heading"
      className="relative pt-16 pb-10 lg:pt-24 lg:pb-14 overflow-hidden bg-background"
    >
      {/* Precision architectural background grid */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(to_right,rgba(31,107,78,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(31,107,78,0.04)_1px,transparent_1px)] bg-[size:3.5rem_3.5rem] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_10%,#000_60%,transparent_100%)] pointer-events-none"
      />

      <div className="relative max-w-[1180px] mx-auto px-5 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">

          {/* ── Left Column: Value Proposition & CTAs ────────────────────────── */}
          <div className="lg:col-span-6 flex flex-col gap-6">
            {/* Eyebrow */}
            <div className={`${ENTER} text-xs font-mono font-semibold uppercase tracking-wider text-primary`}>
              FREE, STRUCTURED PM CURRICULUM
            </div>

            {/* Main Headline */}
            <h1
              id="hero-heading"
              className={`${ENTER_OPAQUE} delay-75 text-4xl sm:text-5xl lg:text-[3.25rem] font-semibold text-foreground leading-[1.12] tracking-[-0.03em]`}
            >
              The structured path from “I want to break into PM” to a{' '}
              <span className="text-primary underline decoration-primary/30 decoration-wavy underline-offset-4">
                portfolio that proves you can
              </span>
              .
            </h1>

            {/* Subheadline */}
            <p className={`${ENTER_OPAQUE} delay-150 text-base sm:text-lg text-[#70685A] leading-relaxed max-w-[540px]`}>
              Learn product management through 90 structured lessons, applied capstones, and interactive practice — then turn the work you create into a public portfolio you can show. Built for career switchers and anyone building product judgment from scratch.
            </p>

            {/* Action Buttons */}
            <div className={`${ENTER} delay-200 flex flex-wrap items-center gap-3.5 pt-1`}>
              <HeroCtaLink />

              <Link
                href="/curriculum"
                className="
                  group inline-flex items-center gap-2 px-5 py-3.5
                  bg-white text-foreground font-semibold text-sm rounded-lg
                  border border-[#DED8CB] hover:border-[#BDB4A2] hover:bg-[#F2EFE7]
                  transition-all duration-150
                  hover:scale-[1.015] active:scale-[0.98]
                  motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F80ED]
                "
              >
                <span>Explore Curriculum</span>
                <span className="transition-transform duration-200 group-hover:translate-x-1 text-[#70685A] group-hover:text-foreground motion-reduce:transition-none">
                  →
                </span>
              </Link>
            </div>

            {/* Key Value Anchors */}
            <div className={`${ENTER} delay-300 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-[#DED8CB]/80`}>
              <div className="space-y-0.5">
                <div className="text-sm font-bold text-foreground font-mono">90 Lessons</div>
                <div className="text-[11px] text-[#70685A]">9 complete modules</div>
              </div>
              <div className="space-y-0.5">
                <div className="text-sm font-bold text-foreground font-mono">9 Capstones</div>
                <div className="text-[11px] text-[#70685A]">Real PM deliverables</div>
              </div>
              <div className="space-y-0.5">
                <div className="text-sm font-bold text-foreground font-mono">7 Competencies</div>
                <div className="text-[11px] text-[#70685A]">Skill progress tracking</div>
              </div>
              <div className="space-y-0.5">
                <div className="text-sm font-bold text-primary font-mono">₹0 Tuition</div>
                <div className="text-[11px] text-[#70685A]">Free, permanently</div>
              </div>
            </div>
          </div>

          {/* ── Right Column: Interactive Product Workbench ─────────────────── */}
          <HeroWorkbench />
        </div>
      </div>
    </section>
  )
}
