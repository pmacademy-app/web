import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { ModuleCard } from '@/components/marketing/module-card'
import { MODULES } from '@/config/content'
import { Reveal } from '@/components/marketing/motion/reveal'
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
      className="bg-surface-muted py-20 lg:py-28 scroll-mt-24 lg:scroll-mt-28"
    >
      <div className="max-w-[1120px] mx-auto px-5 lg:px-8">
        {/* Header */}
        <Reveal amount={0.3} className="text-center mb-10">
          <div className="text-xs font-mono font-semibold uppercase tracking-wider text-primary mb-3">
            COMPLETE LEARNING PATH
          </div>
          <h2
            id="curriculum-heading"
            className="font-display text-h1 lg:text-display-lg font-semibold text-foreground mb-4"
          >
            Nine modules. Ninety lessons. One coherent path.
          </h2>
          <p className="text-body-lg text-locked max-w-[560px] mx-auto leading-relaxed">
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
          <Link
            href="/curriculum"
            className="
              inline-flex items-center gap-2 px-6 py-3
              bg-primary text-white hover:text-white
              text-body-sm font-semibold rounded-sm
              shadow-xs hover:shadow-sm
              hover:opacity-90 active:scale-[0.98]
              transition-all duration-[120ms]
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:text-white
            "
          >
            Explore Full Curriculum <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link
            href="/lessons/lesson-001"
            className="
              text-body-sm font-medium text-locked hover:text-foreground
              transition-colors duration-[120ms]
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
