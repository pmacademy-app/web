/**
 * Proof section: the public portfolio, then the nine capstones behind it (server component).
 *
 * Placed so the outcome arrives before the mechanics. It carries one of the page's two
 * eyebrows. The sample portfolio link is held back until the exemplar portfolio is
 * finished (SAMPLE_PORTFOLIO_PATH in config/marketing.ts).
 *
 * ## Layout (round 2)
 *
 * The header spans the container: the section heading and lead on the left, the wall's
 * own heading and lead on the right, bottom-aligned, so neither column is
 * empty. The 3x3 wall then runs full width beneath it, and the signup CTA closes the
 * section once the proof has been shown.
 *
 * Copy rule for this file: capstones are deliverables the learner writes to a brief and
 * chooses to publish. Nothing here may describe them as checked, scored or marked.
 *
 * Client JavaScript here is limited to the islands it composes: Reveal (scroll entry),
 * SpotlightGroup (pointer glow on the wall) and HeroCtaLink (analytics on click).
 */

import { HeroCtaLink } from '@/components/marketing/sections/hero-cta'
import { PortfolioShowcase } from '@/components/marketing/sections/portfolio-showcase'
import { Reveal } from '@/components/marketing/motion/reveal'
import {
  BAND_PLAIN,
  CONTAINER,
  EYEBROW,
  EYEBROW_RULE,
  SECTION_LEAD,
  SECTION_TITLE,
  SECTION_Y,
} from '@/components/marketing/styles'

export function PortfolioSection() {
  return (
    <section
      id="portfolio"
      aria-labelledby="portfolio-heading"
      data-home-section="proof"
      className={`${BAND_PLAIN} ${SECTION_Y} scroll-mt-24 lg:scroll-mt-28`}
    >
      <div className={CONTAINER}>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-end lg:gap-12">
          <Reveal amount={0.25} className="min-w-0 lg:col-span-7">
            <p className={`${EYEBROW} mb-5`}>
              <span aria-hidden="true" className={EYEBROW_RULE} />
              Portfolio
            </p>
            <h2 id="portfolio-heading" className={`${SECTION_TITLE} mb-5`}>
              Finish with work you can show.
            </h2>
            <p className={SECTION_LEAD}>
              Publish the pieces you are proud of. Share one link. No login to view.
            </p>
          </Reveal>

          <Reveal
            amount={0.25}
            delay={80}
            className="min-w-0 border-t border-border pt-6 lg:col-span-5 lg:border-t-0 lg:border-l lg:pl-10 lg:pt-0"
          >
            <h3 className="font-sans text-[clamp(1.25rem,2vw,1.5rem)] font-semibold leading-[1.2] tracking-[-0.015em] text-foreground text-balance">
              Nine briefs. Nine deliverables.
            </h3>
            <p className="mt-3 text-body text-ink-muted leading-relaxed text-pretty max-w-[44ch]">
              You write the opportunity brief, the PRD, the roadmap. You choose what goes
              public.
            </p>
          </Reveal>
        </div>

        <Reveal amount={0.1} delay={120} className="mt-10 min-w-0 lg:mt-14">
          <PortfolioShowcase />
        </Reveal>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center lg:mt-12">
          <HeroCtaLink location="portfolio" />
        </div>
      </div>
    </section>
  )
}
