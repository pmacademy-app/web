import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { ModuleCard } from '@/components/marketing/module-card'
import { MODULES } from '@/config/content'
import { Reveal } from '@/components/marketing/motion/reveal'
import {
  ARROW_NUDGE,
  BUTTON_PRIMARY,
  CONTAINER,
  EYEBROW,
  EYEBROW_RULE,
  SECTION_LEAD,
  SECTION_TITLE,
  SECTION_Y,
} from '@/components/marketing/styles'
import { CurriculumViewTracker } from '@/components/marketing/sections/curriculum-view-tracker'

/**
 * Curriculum section — Sprint 2 §11 + Sprint 3 curriculum copy.
 * 3×3 ModuleCard grid with stats bar.
 *
 * ## B12-B — server component
 *
 * Three `motion.div` wrappers plus a `useInView` that was doing double duty: driving the
 * grid's stagger and firing the GA4 curriculum-view event. Those are now separate
 * concerns — `<Reveal>` for the animation, `<CurriculumViewTracker>` for the event — so
 * the nine `ModuleCard`s and all the copy render on the server. The stagger keeps its
 * original row/column shape: 100 ms per row, 50 ms per column.
 */
export function CurriculumSection() {
  return (
    <section
      id="curriculum"
      aria-labelledby="curriculum-heading"
      className={`bg-surface-muted ${SECTION_Y} border-t border-border/80 scroll-mt-24 lg:scroll-mt-28`}
    >
      <div className={CONTAINER}>
        {/* Header */}
        <Reveal amount={0.3} className="text-center mb-12 flex flex-col items-center">
          <div className={`${EYEBROW} mb-4`}>
            <span aria-hidden="true" className={EYEBROW_RULE} />
            COMPLETE LEARNING PATH
          </div>
          <h2
            id="curriculum-heading"
            className={`${SECTION_TITLE} mb-4 max-w-[760px]`}
          >
            Nine modules. Ninety lessons. One coherent path.
          </h2>
          <p className={`${SECTION_LEAD} max-w-[600px]`}>
            Start with product thinking fundamentals and build toward discovery, execution, strategy, leadership, and technical fluency. Each module builds on the last and ends with applied work.
          </p>
        </Reveal>

        <CurriculumViewTracker />

        {/* Module grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-10 items-stretch">
          {MODULES.map((module, index) => (
            <Reveal
              key={module.number}
              amount={0.15}
              delay={Math.floor(index / 3) * 100 + (index % 3) * 50}
              className="h-full"
            >
              <ModuleCard module={module} className="h-full" />
            </Reveal>
          ))}
        </div>

        {/* CTAs */}
        <Reveal
          amount={0.5}
          delay={100}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 text-center"
        >
          <Link href="/curriculum" className={BUTTON_PRIMARY}>
            Explore Full Curriculum
            <ArrowRight size={16} aria-hidden="true" className={ARROW_NUDGE} />
          </Link>
          <Link
            href="/lessons/lesson-001"
            className="
              text-body-sm font-medium text-ink-muted hover:text-foreground
              underline-offset-4 hover:underline
              transition-colors duration-200
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-xs
              px-2 py-1
            "
          >
            or preview a free lesson →
          </Link>
        </Reveal>
      </div>
    </section>
  )
}
