import { ArrowRight } from 'lucide-react'

import { Reveal } from '@/components/marketing/motion/reveal'
import { TrackedLink } from '@/components/marketing/tracked-link'
import { FinalCtaLink } from '@/components/marketing/sections/final-cta-link'
import {
  ARROW_NUDGE,
  BAND_DEEP,
  CONTAINER,
  DISPLAY_TITLE,
  LINK_QUIET,
  SECTION_Y,
} from '@/components/marketing/styles'
import { cn } from '@/lib/utils'

interface FinalCTASectionProps {
  showTrustStrip?: boolean
}

/** Focus ring on the deep band: the band re-points --color-focus to primary-foreground; offset in band colour. */
const BAND_FOCUS = 'focus-visible:ring-offset-primary'

/**
 * Final CTA, the closing band of the homepage (round 2).
 *
 * Server component. One deep green band (BAND_DEEP: primary background, static grain,
 * colour tokens re-pointed inside so text, borders and focus rings stay legible in
 * light and dark). It absorbs the former belief band: the brand line is the display
 * heading, its first two sentences softer and the last at full strength so the eye
 * lands on the outcome. Beside it (below on a phone) sit the offer and the two
 * actions, bottom-aligned with the heading; a hairline rule runs the full height of
 * the heading so the column reads as a deliberate panel, not leftover space. What a
 * learner earns is shown once, in the "What you leave with" section, not repeated here.
 *
 * Contrast on the light band (white on primary green): full text about 6.4:1, the
 * softer heading lines (80%) about 4.8:1, ink-muted (86%) about 5.4:1. The dark-mode
 * band is a deep green with foreground text, higher still.
 *
 * Client code is limited to two islands: `FinalCtaLink` (signup, fires
 * `trackHeroCTAClick('final_cta')`) and a `TrackedLink` to the first lesson.
 */
export function FinalCTASection({ showTrustStrip = false }: FinalCTASectionProps) {
  return (
    <section
      id="final-cta"
      aria-labelledby="cta-heading"
      data-home-section="final-cta"
      className={`${SECTION_Y} ${BAND_DEEP} scroll-mt-24 lg:scroll-mt-28`}
    >
      <div className={CONTAINER}>
        <Reveal
          amount={0.3}
          className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-stretch lg:gap-x-12"
        >
          <div className="lg:col-span-7">
            {showTrustStrip && (
              <p className="mb-5 text-body-sm font-medium text-ink-muted">
                Built for the first wave of learners. Help shape what comes next.
              </p>
            )}

            <h2 id="cta-heading" className={cn(
                DISPLAY_TITLE,
                'text-[clamp(2.75rem,5.2vw,4.75rem)] leading-[1.02] text-primary-foreground',
              )}>
              <span className="block text-primary-foreground/80">Learn product.</span>
              <span className="block text-primary-foreground/80">Build the work.</span>
              <span className="block">Show the proof.</span>
            </h2>
          </div>

          <div className="flex min-w-0 flex-col justify-end border-t border-border pt-8 lg:col-span-5 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
            <p className="text-[1.5rem] font-semibold leading-snug tracking-[-0.015em] text-primary-foreground sm:text-[1.75rem]">
              Start your portfolio today.
            </p>
            <p className="mt-1.5 text-body sm:text-body-lg text-ink-muted">Free. No trial, no card.</p>

            <div className="mt-8 flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
              <FinalCtaLink />
              <TrackedLink
                href="/lessons/lesson-001"
                event="home_secondary_cta_click"
                args={{ location: 'final_cta', target: 'sample_lesson' }}
                className={cn(
                  LINK_QUIET,
                  BAND_FOCUS,
                  'justify-center text-primary-foreground decoration-primary-foreground/50 sm:justify-start',
                )}
              >
                <span>Read the first lesson</span>
                <ArrowRight size={15} aria-hidden="true" className={ARROW_NUDGE} />
              </TrackedLink>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
