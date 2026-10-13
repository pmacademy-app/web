import { Reveal } from '@/components/marketing/motion/reveal'
import { TrackedLink } from '@/components/marketing/tracked-link'
import { FinalCtaLink } from '@/components/marketing/sections/final-cta-link'
import {
  CHIP,
  CONTAINER,
  LINK_QUIET,
  ARROW_NUDGE,
  SECTION_LEAD,
  SECTION_TITLE,
  SECTION_Y,
} from '@/components/marketing/styles'
import { ArrowRight } from 'lucide-react'

interface FinalCTASectionProps {
  showTrustStrip?: boolean
}

const CHIPS = ['Public portfolio', 'Verifiable certificate', 'PM Fellow'] as const

/**
 * Final CTA, the closing band of the homepage.
 *
 * Server component. The band is a flat primary tint (`bg-primary-soft`), the one
 * coloured band on the page, so the close reads as distinct from the alternating
 * plain/muted sections above it without a glow or pattern. The tint token is defined
 * for both themes, so the band stays calm in dark mode too.
 *
 * Client code is limited to two islands: `FinalCtaLink` (signup, fires
 * `trackHeroCTAClick('final_cta')`) and a `TrackedLink` to the first lesson, which is
 * the only "read a lesson" action on the page besides the hero.
 */
export function FinalCTASection({ showTrustStrip = false }: FinalCTASectionProps) {
  return (
    <section
      id="final-cta"
      aria-labelledby="cta-heading"
      data-home-section="final-cta"
      className={`${SECTION_Y} bg-primary-soft border-t border-primary/15 scroll-mt-24 lg:scroll-mt-28`}
    >
      <div className={CONTAINER}>
        <Reveal
          amount={0.3}
          className="grid gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-end lg:gap-16"
        >
          <div>
            {showTrustStrip && (
              <p className="mb-5 text-body-sm font-medium text-ink-muted">
                Built for the first wave of learners. Help shape what comes next.
              </p>
            )}

            <h2 id="cta-heading" className={SECTION_TITLE}>
              Start your portfolio today.
            </h2>

            <p className={`mt-5 ${SECTION_LEAD}`}>Free. No trial, no card.</p>

            <ul aria-label="What you can earn" className="mt-8 flex flex-wrap gap-2">
              {CHIPS.map((chip) => (
                <li key={chip} className={CHIP}>
                  {chip}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center lg:flex-col lg:items-start">
            <FinalCtaLink />
            <TrackedLink
              href="/lessons/lesson-001"
              event="home_secondary_cta_click"
              args={{ location: 'final_cta', target: 'sample_lesson' }}
              className={`${LINK_QUIET} justify-center sm:justify-start`}
            >
              <span>Read the first lesson</span>
              <ArrowRight size={15} aria-hidden="true" className={ARROW_NUDGE} />
            </TrackedLink>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
