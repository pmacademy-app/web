/**
 * Landing page hero (server component).
 *
 * One idea: learn product management, leave with a portfolio you can share. Round 2
 * layout is an
 * editorial split with no orphan column: the pill, H1, sub and the two calls to action
 * sit on the left (6 of 12 columns), vertically centred against the visual on the
 * right (6 of 12), a layered capstone page with a portfolio card and a Skill Radar
 * card (see hero-workbench.tsx). A static, masked dot grid sits behind the section.
 *
 * The pill ("Learn at your own pace") carries the only motion in the copy column: a
 * slow highlight sweep (SHINY_TEXT), plain text under reduced motion. The H1 itself
 * gets no effect. "Free" is already in the sub, so the hero adds no separate "Free"
 * line; that line lives in the closing band.
 *
 * ## The headline deliberately does not fade
 *
 * An element at `opacity: 0` is not eligible to be the Largest Contentful Paint, so a
 * fade-in on the h1 would move LCP to the end of the animation. The headline and sub
 * therefore animate transform only (ENTER_OPAQUE: `slide-in-from-bottom` with no
 * fade), which paints them opaque on the first frame. Secondary elements may fade.
 *
 * Client JavaScript: HeroCtaLink (analytics and the signed-in swap) and the TrackedLink
 * on the sample lesson button. Everything else, including the visual, is server HTML.
 */

import { ArrowRight, Clock3 } from 'lucide-react'

import { HeroCtaLink } from '@/components/marketing/sections/hero-cta'
import { HeroWorkbench } from '@/components/marketing/sections/hero-workbench'
import { TrackedLink } from '@/components/marketing/tracked-link'
import {
  ARROW_NUDGE,
  BAND_MUTED,
  BUTTON_SECONDARY,
  CONTAINER,
  DISPLAY_LEAD,
  DISPLAY_TITLE,
  DOT_GRID,
  SHINY_TEXT,
} from '@/components/marketing/styles'
import { cn } from '@/lib/utils'

/** Entry animation for secondary elements. Safe to fade: not an LCP candidate. */
const ENTER = 'animate-in fade-in slide-in-from-bottom-2 duration-700 ease-out-quint fill-mode-both motion-reduce:animate-none'

/** Entry animation for LCP candidates. Transform only, so the text paints opaque. */
const ENTER_OPAQUE = 'animate-in slide-in-from-bottom-2 duration-700 ease-out-quint fill-mode-both motion-reduce:animate-none'

/**
 * The hero H1 shares a half-width column with nothing else, so it steps down from the
 * full DISPLAY_TITLE clamp (88px) to 64px at most: three short lines, never four.
 */
const HERO_TITLE = cn(DISPLAY_TITLE, 'text-[clamp(2.625rem,4.6vw,4rem)] leading-[1.02]')

export function HeroSection() {
  return (
    <section
      id="hero"
      aria-labelledby="hero-heading"
      data-home-section="hero"
      className={`${BAND_MUTED} ${DOT_GRID} overflow-x-clip pt-28 pb-16 sm:pt-32 sm:pb-20 lg:pt-32 lg:pb-24`}
    >
      <div className={CONTAINER}>
        <div className="grid grid-cols-1 items-center gap-12 md:gap-14 lg:grid-cols-12 lg:gap-10">
          <div className="flex min-w-0 flex-col items-start lg:col-span-6">
            <p
              className={`${ENTER} inline-flex items-center rounded-full border border-border bg-surface/80 px-3.5 py-1 text-body-sm font-medium text-foreground shadow-tinted`}
            >
              <Clock3 size={14} aria-hidden="true" className="mr-2 shrink-0 text-primary" />
              <span className={SHINY_TEXT}>Learn at your own pace</span>
            </p>

            <h1 id="hero-heading" className={`${ENTER_OPAQUE} mt-6 ${HERO_TITLE}`}>
              Learn product management.{' '}
              <span className="block text-primary">Leave with a portfolio you can share.</span>
            </h1>

            <p className={`${ENTER_OPAQUE} delay-100 mt-6 ${DISPLAY_LEAD} max-w-[34ch]`}>
              90 lessons and 9 capstones. You choose which deliverables to publish.
              Free, permanently.
            </p>

            <div
              className={`${ENTER} delay-200 mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center`}
            >
              <HeroCtaLink />
              <TrackedLink
                href="/lessons/lesson-001"
                event="home_secondary_cta_click"
                args={{ location: 'hero', target: 'sample_lesson' }}
                className={BUTTON_SECONDARY}
              >
                <span>Read a sample lesson</span>
                <ArrowRight
                  size={16}
                  aria-hidden="true"
                  className={`text-ink-muted group-hover:text-foreground ${ARROW_NUDGE}`}
                />
              </TrackedLink>
            </div>
          </div>

          <div className={`${ENTER} delay-300 min-w-0 lg:col-span-6`}>
            <HeroWorkbench />
          </div>
        </div>
      </div>
    </section>
  )
}
