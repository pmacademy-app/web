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
    description: 'YouTube, Reddit, blogs, and scattered frameworks. Lots of information, but no coherent sequence or body of work.',
    variant: 'default' as const,
  },
  {
    icon: 'GraduationCap',
    title: 'Expensive Bootcamps',
    description: 'Structured and guided, but often costly — with the price of a program becoming a barrier to getting started.',
    variant: 'default' as const,
  },
  {
    icon: 'BookOpen',
    title: 'Prodily PM Academy',
    description: 'A structured curriculum with interactive practice, applied capstones, skill tracking, and a portfolio you can keep building.',
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
          <div className="text-xs font-mono font-semibold uppercase tracking-wider text-primary mb-3">
            THE TRADE-OFF YOU SHOULDN&apos;T HAVE TO MAKE
          </div>
          <h2
            id="why-heading"
            className="font-display text-h1 lg:text-display-lg font-semibold text-foreground mb-4"
          >
            Self-study gives you information. Bootcamps give you structure. Prodily gives you a path to practice and proof.
          </h2>
          <p className="text-body-lg text-locked leading-relaxed">
            Product management is easy to study badly. You can collect hundreds of videos, frameworks, and opinions without ever building a coherent mental model or producing work of your own. Paid programs solve some of the structure problem, but they can be expensive. Prodily combines a structured curriculum with applied practice and portfolio output — without putting the core learning path behind a paywall.
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
