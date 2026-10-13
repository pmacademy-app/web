/**
 * Landing page hero (server component).
 *
 * One idea: learn product management, leave with proof. The H1 runs across most of the
 * container in display type above everything else; the sub, the two calls to action and
 * the course counts sit in a narrow left column, and the visual (one captioned capstone
 * page) takes the right. No ambient glows, no gradients, no auto-advancing mock.
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

import { ArrowRight } from 'lucide-react'

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
} from '@/components/marketing/styles'

/** Entry animation for secondary elements. Safe to fade: not an LCP candidate. */
const ENTER = 'animate-in fade-in slide-in-from-bottom-2 duration-700 ease-out-quint fill-mode-both motion-reduce:animate-none'

/** Entry animation for LCP candidates. Transform only, so the text paints opaque. */
const ENTER_OPAQUE = 'animate-in slide-in-from-bottom-2 duration-700 ease-out-quint fill-mode-both motion-reduce:animate-none'

export function HeroSection() {
  return (
    <section
      id="hero"
      aria-labelledby="hero-heading"
      data-home-section="hero"
      className={`${BAND_MUTED} pt-28 pb-20 sm:pt-32 sm:pb-24 lg:pt-36 lg:pb-32`}
    >
      <div className={CONTAINER}>
        <h1 id="hero-heading" className={`${ENTER_OPAQUE} ${DISPLAY_TITLE}`}>
          Learn product management.{' '}
          <span className="block text-primary">Leave with proof.</span>
        </h1>

        <div className="mt-10 grid grid-cols-1 gap-14 lg:mt-14 lg:grid-cols-12 lg:gap-12">
          <div className="flex flex-col gap-8 lg:col-span-5">
            <p className={`${ENTER_OPAQUE} delay-100 ${DISPLAY_LEAD}`}>
              90 lessons and 9 capstones build a public portfolio you can share. Free,
              permanently.
            </p>

            <div className={`${ENTER} delay-200 flex flex-col gap-3 sm:flex-row sm:items-center`}>
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

          <div className={`${ENTER} delay-300 lg:col-span-7`}>
            <HeroWorkbench />
          </div>
        </div>
      </div>
    </section>
  )
}
