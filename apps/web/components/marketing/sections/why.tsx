'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { FeatureCard } from '@/components/marketing/feature-card'
import { BRAND } from '@/lib/brand'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { STAGGER_CONTAINER } from '@/lib/animation'

const COMPARISON_CARDS = [
  {
    icon: 'Shuffle',
    title: 'Fragmented Self-Study',
    description: 'Stitching YouTube, Reddit, and blog posts together. No structure, no feedback, no path.',
    variant: 'default' as const,
  },
  {
    icon: 'GraduationCap',
    title: 'Expensive Bootcamps',
    description: 'Thousands of dollars for cohort-based courses. Good content, high cost, often inaccessible.',
    variant: 'default' as const,
  },
  {
    icon: 'BookOpen',
    title: BRAND.product,
    description: 'Structured curriculum, skill analytics, interactive quizzes, and portfolio artifacts. Completely free.',
    variant: 'comparison-highlighted' as const,
  },
]

/**
 * Why PM Academy section — Sprint 2 §9 + Sprint 3 why copy.
 */
export function WhySection() {
  const prefersReducedMotion = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.2 })

  return (
    <section
      id="why"
      aria-labelledby="why-heading"
      className="bg-surface-muted py-20 lg:py-28 scroll-mt-24 lg:scroll-mt-28"
    >
      <div className="max-w-[1120px] mx-auto px-5 lg:px-8">
        {/* Header */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.18, ease: [0, 0, 0.2, 1] }}
          className="max-w-[680px] mx-auto text-center mb-14"
        >
          <h2
            id="why-heading"
            className="font-display text-h1 lg:text-display-lg font-semibold text-foreground mb-4"
          >
            PM education is broken.
          </h2>
          <p className="text-body-lg text-locked leading-relaxed">
            Most people learn product management by stitching together blog posts, outdated courses, and advice from people who learned the same way. PM Academy is built differently: a structured, sequenced curriculum that takes you from first principles to portfolio-ready.
          </p>
        </motion.div>

        {/* Comparison cards */}
        <motion.div
          ref={ref}
          variants={prefersReducedMotion ? undefined : STAGGER_CONTAINER}
          initial={prefersReducedMotion ? false : 'hidden'}
          animate={inView ? 'visible' : 'hidden'}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          {COMPARISON_CARDS.map((card) => (
            <FeatureCard
              key={card.title}
              icon={card.icon}
              title={card.title}
              description={card.description}
              variant={card.variant}
            />
          ))}
        </motion.div>

        {/* Narrative paragraph */}
        <motion.p
          initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.18, ease: [0, 0, 0.2, 1], delay: 0.2 }}
          className="mt-12 text-body-lg text-locked text-center max-w-[640px] mx-auto leading-relaxed"
        >
          The goal is product judgment — the ability to make good decisions about what to build, why to build it, and how to know if it worked. That takes a real curriculum, not a curated link list.
        </motion.p>
      </div>
    </section>
  )
}
