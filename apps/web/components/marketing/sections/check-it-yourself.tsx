import Image from 'next/image'
import { ArrowRight } from 'lucide-react'

import { TrackedLink } from '@/components/marketing/tracked-link'
import {
  ARROW_NUDGE,
  BAND_MUTED,
  CONTAINER,
  LINK_QUIET,
  SECTION_TITLE,
  SECTION_Y,
} from '@/components/marketing/styles'
import {
  SAMPLE_CERTIFICATE_LABEL,
  SAMPLE_CERTIFICATE_SRC,
  SAMPLE_LEARNER_NAME,
  SAMPLE_PORTFOLIO_PATH,
} from '@/config/marketing'
import { FeedbackAdminService } from '@/lib/admin/feedback-service'

/**
 * "Check it yourself": the trust slot when there are no testimonials to show.
 *
 * `PublishedTestimonialsSection` renders only at three or more published rows. Below
 * that, this takes its place with things a visitor can verify directly: the public
 * curriculum, a labelled sample certificate, and a real public portfolio. It makes no
 * claim about other learners, so it carries no quotes, names or ratings.
 *
 * The count comes from the same cached service call as the testimonials section, so
 * the two never disagree. A failed lookup counts as zero and shows this fallback.
 */

/** Keep in step with MINIMUM_TO_RENDER in published-testimonials.tsx. */
const TESTIMONIALS_THRESHOLD = 3

async function publishedTestimonialCount(): Promise<number> {
  try {
    const rows = await FeedbackAdminService.getPublishedTestimonials()
    return Array.isArray(rows) ? rows.length : 0
  } catch {
    return 0
  }
}

const ROW = 'grid gap-4 py-8 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-10'
const STATEMENT =
  'font-sans text-[clamp(1.375rem,2.2vw,1.75rem)] font-semibold leading-[1.2] tracking-[-0.015em] text-foreground text-balance'

export async function CheckItYourselfSection() {
  if ((await publishedTestimonialCount()) >= TESTIMONIALS_THRESHOLD) return null

  return (
    <section
      id="check-it-yourself"
      aria-labelledby="check-it-yourself-heading"
      data-home-section="check-it-yourself"
      className={`${SECTION_Y} ${BAND_MUTED} scroll-mt-24 lg:scroll-mt-28`}
    >
      <div className={`${CONTAINER} grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:gap-20`}>
        <h2 id="check-it-yourself-heading" className={SECTION_TITLE}>
          Check it yourself.
        </h2>

        <ul className="divide-y divide-border">
          <li className={ROW}>
            <p className={STATEMENT}>All 90 lessons are public.</p>
            <TrackedLink
              href="/curriculum"
              event="home_secondary_cta_click"
              args={{ location: 'check_it_yourself', target: 'curriculum' }}
              className={LINK_QUIET}
            >
              <span>Browse the curriculum</span>
              <ArrowRight size={15} aria-hidden="true" className={ARROW_NUDGE} />
            </TrackedLink>
          </li>

          <li className={ROW}>
            <p className={STATEMENT}>See a sample certificate.</p>
            <figure className="w-full max-w-[280px] sm:w-[220px]">
              <Image
                src={SAMPLE_CERTIFICATE_SRC}
                alt={`${SAMPLE_CERTIFICATE_LABEL} issued to ${SAMPLE_LEARNER_NAME}`}
                width={2200}
                height={1400}
                sizes="(min-width: 640px) 220px, 280px"
                className="h-auto w-full rounded-md border border-border bg-surface"
              />
              <figcaption className="mt-2 text-caption text-ink-muted">
                {SAMPLE_CERTIFICATE_LABEL}
              </figcaption>
            </figure>
          </li>

          <li className={ROW}>
            <p className={STATEMENT}>See a real portfolio.</p>
            <TrackedLink
              href={SAMPLE_PORTFOLIO_PATH}
              event="home_secondary_cta_click"
              args={{ location: 'check_it_yourself', target: 'sample_portfolio' }}
              className={LINK_QUIET}
            >
              <span>Open the portfolio</span>
              <ArrowRight size={15} aria-hidden="true" className={ARROW_NUDGE} />
            </TrackedLink>
          </li>
        </ul>
      </div>
    </section>
  )
}
