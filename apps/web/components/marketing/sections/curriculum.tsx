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
import { HOME_CAPSTONES, padIndex } from '@/config/marketing'
import { MODULES } from '@/config/content'

/**
 * Curriculum section: a numbered ledger, 01 to 09 (homepage redesign, UI-6).
 *
 * Server component. Each row pairs a module with the capstone it ends in, so the
 * section says one thing: the path is sequenced and every step produces work. The
 * old card grid and its coloured skill pills are gone; a single skill-coloured dot
 * per capstone is the only colour.
 *
 * This section and the hero are the only places on the homepage that state the
 * 90 lesson / 9 module counts. `CurriculumViewTracker` keeps the curriculum-view
 * event firing once on entry; `<Reveal>` animates the header and the ledger as two
 * blocks rather than staggering nine rows.
 */
export function CurriculumSection() {
  const rows = MODULES.map((module) => {
    const capstone = HOME_CAPSTONES.find((c) => c.number === module.number)
    return {
      number: module.number,
      title: module.title,
      lessonCount: module.lessonCount,
      capstoneTitle: capstone?.title ?? '',
      skill: capstone?.skill ?? 'strategy',
    }
  })

  return (
    <section
      id="curriculum"
      aria-labelledby="curriculum-heading"
      data-home-section="curriculum"
      className={`${BAND_MUTED} ${SECTION_Y} scroll-mt-24 lg:scroll-mt-28`}
    >
      <div className={CONTAINER}>
        <Reveal amount={0.3} className="mb-12 max-w-[46rem] lg:mb-16">
          <p className={`${EYEBROW} mb-5`}>
            <span aria-hidden="true" className={EYEBROW_RULE} />
            CURRICULUM
          </p>
          <h2 id="curriculum-heading" className={`${SECTION_TITLE} mb-5`}>
            90 lessons across 9 modules, in order.
          </h2>
          <p className={SECTION_LEAD}>Each module ends in a capstone.</p>
        </Reveal>

        <CurriculumViewTracker />

        <Reveal amount={0.1}>
          <ol className="divide-y divide-border border-y border-border">
            {rows.map((row) => (
              <ModuleLedgerRow key={row.number} index={padIndex(row.number)} {...row} />
            ))}
          </ol>
        </Reveal>

        <div className="mt-10">
          <TrackedLink
            href="/curriculum"
            event="home_secondary_cta_click"
            args={{ location: 'curriculum', target: 'curriculum' }}
            className={LINK_QUIET}
          >
            See every lesson in the curriculum
            <ArrowRight size={16} aria-hidden="true" className={ARROW_NUDGE} />
          </TrackedLink>
        </div>
      </div>
    </section>
  )
}
