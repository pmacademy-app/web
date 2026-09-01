'use client'

import { useRef, useEffect } from 'react'
import Link from 'next/link'
import { motion, useInView } from 'framer-motion'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { ModuleCard } from '@/components/marketing/module-card'
import { MODULES } from '@/config/content'
import { trackCurriculumView } from '@/lib/analytics'
import { ArrowRight } from 'lucide-react'

/**
 * Curriculum section — Sprint 2 §11 + Sprint 3 curriculum copy.
 * 3×3 ModuleCard grid with stats bar.
 */
export function CurriculumSection() {
  const prefersReducedMotion = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.15 })

  // GA4 event — fires once on viewport entry
  useEffect(() => {
    if (inView) trackCurriculumView()
  }, [inView])

  return (
    <section
      id="curriculum"
      aria-labelledby="curriculum-heading"
      className="bg-surface-muted py-20 lg:py-28 scroll-mt-24 lg:scroll-mt-28"
    >
      <div className="max-w-[1120px] mx-auto px-5 lg:px-8">
        {/* Header */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.18, ease: [0, 0, 0.2, 1] }}
          className="text-center mb-10"
        >
          <h2
            id="curriculum-heading"
            className="font-display text-h1 lg:text-display-lg font-semibold text-foreground mb-4"
          >
            Nine modules. Ninety lessons. One coherent path.
          </h2>
          <p className="text-body-lg text-locked max-w-[560px] mx-auto leading-relaxed">
            From product thinking fundamentals to advanced strategic judgment, each module builds on the last and ends with a real deliverable, not a quiz score.
          </p>
        </motion.div>

        {/* Module grid */}
        <div ref={ref} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-10 items-stretch">
          {MODULES.map((module, index) => (
            <motion.div
              key={module.number}
              className="h-full"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
              animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
              transition={{
                duration: prefersReducedMotion ? 0 : 0.24,
                delay: prefersReducedMotion ? 0 : Math.floor(index / 3) * 0.1 + (index % 3) * 0.05,
                ease: [0, 0, 0.2, 1],
              }}
            >
              <ModuleCard module={module} className="h-full" />
            </motion.div>
          ))}
        </div>

        {/* CTAs */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.18, delay: 0.1 }}
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
        </motion.div>
      </div>
    </section>
  )
}
