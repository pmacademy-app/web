import { ArrowRight } from 'lucide-react'

import { ModuleLedgerRow } from '@/components/marketing/module-card'
import { Reveal } from '@/components/marketing/motion/reveal'
import { TrackedLink } from '@/components/marketing/tracked-link'
import { CurriculumViewTracker } from '@/components/marketing/sections/curriculum-view-tracker'
import {
  ARROW_NUDGE,
  BAND_MUTED,
  CONTAINER,
  EYEBROW,
  EYEBROW_RULE,
  LINK_QUIET,
  SECTION_LEAD,
  SECTION_TITLE,
  SECTION_Y,
} from '@/components/marketing/styles'
import { padIndex } from '@/config/marketing'
import { MODULE_META_LIST, formatModuleHours } from '@/lib/curriculum/module-meta'

/**
 * Curriculum section: a numbered ledger, 01 to 09 (homepage redesign, UI-6).
 *
 * Server component. Each row is a module with its lesson count and estimated time,
 * so the section says one thing: the path is sequenced. Capstone titles are not
 * repeated here; the proof section's wall already lists them. The old card grid and
 * its coloured skill pills are gone.
 *
 * The heading avoids restating the 90 lesson / 9 module counts, which the hero sub
 * already carries. `CurriculumViewTracker` keeps the curriculum-view
 * event firing once on entry; `<Reveal>` animates the header and the ledger as two
 * blocks rather than staggering nine rows.
 */
export function CurriculumSection() {
  const rows = MODULE_META_LIST.map((module) => ({
    number: module.number,
    title: module.title,
    lessonCount: module.lessonCount,
    estimatedTime: formatModuleHours(module.estimatedMinutes),
  }))

  return (
    <section
      id="curriculum"
      aria-labelledby="curriculum-heading"
      data-home-section="curriculum"
      className={`${BAND_MUTED} ${SECTION_Y} scroll-mt-24 lg:scroll-mt-28`}
    >
      <div className={CONTAINER}>
        {/* Header split like the proof section: heading left, the capstone line and the
            full-curriculum link right, so the right half of the row is not empty. Below
            `lg` the right column stacks under the heading behind a hairline. */}
        <div className="mb-10 grid grid-cols-1 gap-8 lg:mb-12 lg:grid-cols-12 lg:items-end lg:gap-12">
          <Reveal amount={0.3} className="min-w-0 lg:col-span-7">
            <p className={`${EYEBROW} mb-5`}>
              <span aria-hidden="true" className={EYEBROW_RULE} />
              CURRICULUM
            </p>
            <h2 id="curriculum-heading" className={SECTION_TITLE}>
              From first principles to a full case study.
            </h2>
          </Reveal>

          <Reveal
            amount={0.3}
            delay={80}
            className="min-w-0 border-t border-border pt-6 lg:col-span-5 lg:border-t-0 lg:border-l lg:pl-10 lg:pt-0"
          >
            <p className={SECTION_LEAD}>Each module ends in a capstone.</p>
            <TrackedLink
              href="/curriculum"
              event="home_secondary_cta_click"
              args={{ location: 'curriculum', target: 'curriculum' }}
              className={`${LINK_QUIET} mt-2`}
            >
              See every lesson in the curriculum
              <ArrowRight size={16} aria-hidden="true" className={ARROW_NUDGE} />
            </TrackedLink>
          </Reveal>
        </div>

        <CurriculumViewTracker />

        <Reveal amount={0.1}>
          <ol className="divide-y divide-border border-y border-border">
            {rows.map((row) => (
              <ModuleLedgerRow key={row.number} index={padIndex(row.number)} {...row} />
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  )
}
