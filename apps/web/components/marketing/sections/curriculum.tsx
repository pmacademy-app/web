'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { ModuleCard } from '@/components/marketing/module-card'
import { MODULES } from '@/config/content'
import { trackCurriculumView } from '@/lib/analytics'
import { useEffect } from 'react'

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
            Everything you need. Nothing you don&apos;t.
          </h2>
          <p className="text-body-lg text-locked max-w-[560px] mx-auto leading-relaxed">
            Nine modules, ninety lessons, one coherent path from product thinking to portfolio-ready work.
          </p>
        </motion.div>

        {/* Stats bar */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.18, delay: 0.05, ease: [0, 0, 0.2, 1] }}
          className="
            flex flex-wrap items-center justify-center gap-6 lg:gap-10
            mb-12 py-5 px-6
            bg-surface border border-border rounded-lg
          "
          aria-label="Curriculum statistics"
        >
          {[
            { value: '90', label: 'Lessons' },
            { value: '9', label: 'Modules' },
            { value: '7', label: 'Competencies' },
            { value: '1', label: 'Portfolio' },
          ].map(({ value, label }) => (
            <div key={label} className="text-center">
              <p className="text-h2 font-display font-semibold text-foreground">{value}</p>
              <p className="text-body-sm text-locked">{label}</p>
            </div>
          ))}
        </motion.div>

        {/* Module grid */}
        <div ref={ref} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {MODULES.map((module, index) => (
            <motion.div
              key={module.number}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
              animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
              transition={{
                duration: prefersReducedMotion ? 0 : 0.24,
                delay: prefersReducedMotion ? 0 : Math.floor(index / 3) * 0.1 + (index % 3) * 0.05,
                ease: [0, 0, 0.2, 1],
              }}
            >
              <ModuleCard module={module} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
