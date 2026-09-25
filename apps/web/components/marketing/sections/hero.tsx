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
import { ARROW_NUDGE, BUTTON_SECONDARY, CONTAINER } from '@/components/marketing/styles'

/** Entry animation for decorative copy. Safe to fade — not an LCP candidate. */
const ENTER = 'animate-in fade-in slide-in-from-bottom-2 duration-700 ease-out-quint fill-mode-both motion-reduce:animate-none'

/** Entry animation for LCP candidates. Transform only, so the text paints opaque. */
const ENTER_OPAQUE = 'animate-in slide-in-from-bottom-2 duration-700 ease-out-quint fill-mode-both motion-reduce:animate-none'

/**
 * The four value anchors under the CTAs. The label strings are asserted against the
 * shipped content by `marketing-homepage-phase0c.test.ts`, so they stay literal.
 */
const ANCHORS = [
  { value: '90 Lessons', detail: '9 complete modules' },
  { value: '9 Capstones', detail: 'Real PM deliverables' },
  { value: '7 Competencies', detail: 'Skill progress tracking' },
  { value: '₹0 Tuition', detail: 'Free, permanently', highlight: true },
] as const

export function HeroSection() {
  return (
    <section
      id="hero"
      aria-labelledby="hero-heading"
      className="relative pt-28 pb-16 sm:pt-32 lg:pt-36 lg:pb-24 overflow-hidden bg-background"
    >
      {/* Architectural grid, tinted from the primary token so it follows the theme. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none bg-[linear-gradient(to_right,color-mix(in_srgb,var(--color-primary)_5%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_srgb,var(--color-primary)_5%,transparent)_1px,transparent_1px)] bg-[size:3.5rem_3.5rem] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,#000_55%,transparent_100%)]"
      />

      {/* Ambient glow behind the workbench. Slow drift, transform only, off for
          reduced motion. Gives the product visual depth without a drop-shadow stack. */}
      <div
        aria-hidden="true"
        className="absolute -top-32 right-[-10%] h-[520px] w-[620px] rounded-full pointer-events-none opacity-70 blur-3xl bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--color-primary)_14%,transparent),transparent)] animate-ambient motion-reduce:animate-none"
      />

      <div className={`relative ${CONTAINER} max-w-[1180px]`}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-14 items-center">

          {/* ── Left Column: Value Proposition & CTAs ────────────────────────── */}
          <div className="lg:col-span-6 flex flex-col gap-6">
            {/* Eyebrow */}
            <div className={`${ENTER} self-start inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary-soft/70 px-3 py-1 text-[11px] font-mono font-semibold uppercase tracking-[0.14em] text-primary`}>
              <span aria-hidden="true" className="relative flex h-1.5 w-1.5">
                <span className="absolute inset-0 rounded-full bg-primary animate-status-ping motion-reduce:hidden" />
                <span className="relative h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              FREE, STRUCTURED PM CURRICULUM
            </div>

            {/* Main Headline */}
            <h1
              id="hero-heading"
              className={`${ENTER_OPAQUE} delay-75 font-display text-[2.375rem] sm:text-5xl lg:text-[3.375rem] font-semibold text-foreground leading-[1.08] tracking-[-0.035em] text-balance`}
            >
              The structured path from “I want to break into PM” to a{' '}
              <span className="text-primary [box-decoration-break:clone] bg-[linear-gradient(transparent_68%,var(--color-primary-soft)_68%)]">
                portfolio that proves you can
              </span>
              .
            </h1>

            {/* Subheadline */}
            <p className={`${ENTER_OPAQUE} delay-150 text-body sm:text-body-lg text-ink-muted leading-relaxed max-w-[520px] text-pretty`}>
              Ninety lessons that build product judgment, and nine capstone deliverables
              that turn it into work you can show. Free, permanently.
            </p>

            {/* Action Buttons */}
            <div className={`${ENTER} delay-200 flex flex-col sm:flex-row sm:items-center gap-3 pt-1`}>
              <HeroCtaLink />

              {/* Secondary CTA points at a real lesson rather than the curriculum index.
                  All 90 lessons are already public, and reading one is a lower-commitment,
                  higher-evidence second step than scanning a module list. */}
              <Link href="/lessons/lesson-001" className={BUTTON_SECONDARY}>
                <span>Read a sample lesson</span>
                <span aria-hidden="true" className={`text-ink-muted group-hover:text-foreground ${ARROW_NUDGE}`}>
                  →
                </span>
              </Link>
            </div>

            {/* Key Value Anchors */}
            <dl className={`${ENTER} delay-300 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-5 pt-6 mt-1 border-t border-border/80`}>
              {ANCHORS.map((anchor) => (
                <div key={anchor.value} className="space-y-1">
                  <dt
                    className={`text-sm font-semibold font-mono tracking-tight ${
                      'highlight' in anchor ? 'text-primary' : 'text-foreground'
                    }`}
                  >
                    {anchor.value}
                  </dt>
                  <dd className="text-xs text-ink-muted leading-snug">{anchor.detail}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* ── Right Column: Interactive Product Workbench ─────────────────── */}
          <HeroWorkbench />
        </div>
      </div>
    </section>
  )
}
