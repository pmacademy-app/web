/**
 * Proof section: the public portfolio, then the nine capstones behind it (server component).
 *
 * The first section after the belief band, so the outcome arrives before the mechanics.
 * It carries one of the page's two eyebrows. The sample link goes to a real public
 * portfolio (SAMPLE_PORTFOLIO_PATH), not to signup.
 *
 * Copy rule for this file: capstones are deliverables the learner writes to a brief and
 * chooses to publish. Nothing here may describe them as checked, scored or marked.
 *
 * Client JavaScript here is limited to the islands it composes: Reveal (scroll entry),
 * TrackedLink and HeroCtaLink (analytics on click). The wall itself is static.
 */

import { ArrowRight } from 'lucide-react'

import { HeroCtaLink } from '@/components/marketing/sections/hero-cta'
import { PortfolioShowcase } from '@/components/marketing/sections/portfolio-showcase'
import { Reveal } from '@/components/marketing/motion/reveal'
import { TrackedLink } from '@/components/marketing/tracked-link'
import {
  ARROW_NUDGE,
  BAND_PLAIN,
  CONTAINER,
  EYEBROW,
  EYEBROW_RULE,
  LINK_QUIET,
  SECTION_LEAD,
  SECTION_TITLE,
  SECTION_Y,
} from '@/components/marketing/styles'
import { SAMPLE_PORTFOLIO_PATH } from '@/config/marketing'

export function PortfolioSection() {
  return (
    <section
      id="portfolio"
      aria-labelledby="portfolio-heading"
      data-home-section="proof"
      className={`${BAND_PLAIN} ${SECTION_Y} scroll-mt-24 lg:scroll-mt-28`}
    >
      <div className={CONTAINER}>
        <Reveal amount={0.25} className="max-w-3xl">
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
          <TrackedLink
            href={SAMPLE_PORTFOLIO_PATH}
            event="home_secondary_cta_click"
            args={{ location: 'proof', target: 'sample_portfolio' }}
            className={`${LINK_QUIET} mt-4`}
          >
            See a real portfolio
            <ArrowRight size={16} aria-hidden="true" className={ARROW_NUDGE} />
          </TrackedLink>
        </Reveal>

        <div className="mt-20 grid grid-cols-1 gap-10 lg:mt-28 lg:grid-cols-12 lg:gap-12">
          <Reveal amount={0.3} className="lg:col-span-4">
            <div className="lg:sticky lg:top-28">
              <h3 className="font-sans text-[clamp(1.375rem,2.4vw,1.875rem)] font-semibold leading-[1.15] tracking-[-0.015em] text-foreground text-balance">
                Nine briefs. Nine deliverables.
              </h3>
              <p className="mt-4 text-body text-ink-muted leading-relaxed text-pretty max-w-[40ch]">
                You write the opportunity brief, the PRD, the roadmap. You choose what goes
                public.
              </p>
            </div>
          </Reveal>

          <Reveal amount={0.1} delay={80} className="lg:col-span-8">
            <PortfolioShowcase />
          </Reveal>
        </div>

        <div className="mt-14 flex flex-col gap-3 sm:flex-row sm:items-center lg:mt-16">
          <HeroCtaLink location="portfolio" />
        </div>
      </div>
    </section>
  )
}
