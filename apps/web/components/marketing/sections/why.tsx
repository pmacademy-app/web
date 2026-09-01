'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { FeatureCard } from '@/components/marketing/feature-card'
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
    description: '$200–$2,000 for cohort-based courses. Good content, high cost, often inaccessible.',
    variant: 'default' as const,
  },
  {
    icon: 'BookOpen',
    title: 'Prodily PM Academy',
    description: 'Structured curriculum, skill analytics, interactive practice, and portfolio artifacts. Free, permanently.',
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
          className="max-w-[760px] mx-auto text-center mb-14"
        >
          <h2
            id="why-heading"
            className="font-display text-h1 lg:text-display-lg font-semibold text-foreground mb-4"
          >
            Self-study is free but aimless. Bootcamps are structured but expensive. Prodily is neither trade-off.
          </h2>
          <p className="text-body-lg text-locked leading-relaxed">
            Most people learn product management by stitching together YouTube videos, Reddit threads, and outdated blog posts with no sequence, no feedback, and no proof of what they&apos;ve actually learned. Bootcamps fix the structure problem but cost $200 to $2,000 and often teach the same surface-level frameworks. Prodily gives you the structure of a paid program with the applied output to prove it for the cost of nothing.
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
      </div>
    </section>
  )
}
