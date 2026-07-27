'use client'

import { motion } from 'framer-motion'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { COMMUNITY_FEATURES } from '@/config/content'
import * as LucideIcons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * Community section — Sprint 2 §16 + Sprint 3 community copy.
 */
export function CommunitySection() {
  const prefersReducedMotion = useReducedMotion()

  return (
    <section
      id="community"
      aria-labelledby="community-heading"
      className="py-20 lg:py-28 bg-surface"
    >
      <div className="max-w-[1120px] mx-auto px-5 lg:px-8">
        {/* Header */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.18, ease: [0, 0, 0.2, 1] }}
          className="text-center mb-16"
        >
          <h2
            id="community-heading"
            className="font-display text-h1 lg:text-display-lg font-semibold text-foreground mb-4"
          >
            Built for consistency.
          </h2>
          <p className="text-body-lg text-locked max-w-[560px] mx-auto leading-relaxed">
            Learn alongside others who are building product judgment. Cohort-based leaderboards, structured discussion, and peer feedback.
          </p>
        </motion.div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {COMMUNITY_FEATURES.map((feature, index) => {
            const IconComponent = (LucideIcons as unknown as Record<string, LucideIcon | undefined>)[feature.icon]
            return (
              <motion.div
                key={feature.title}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.24, delay: index * 0.08, ease: [0, 0, 0.2, 1] }}
                className="flex flex-col p-6 bg-surface-muted border border-border rounded-lg"
              >
                {IconComponent && (
                  <div className="w-10 h-10 rounded-sm bg-primary/10 flex items-center justify-center flex-shrink-0 mb-4">
                    <IconComponent size={20} className="text-primary" aria-hidden="true" />
                  </div>
                )}
                <h3 className="text-h4 font-semibold text-foreground mb-2">{feature.title}</h3>
                <p className="text-body-sm text-locked leading-relaxed">{feature.description}</p>
              </motion.div>
            )
          })}
        </div>

        {/* Honest Framing Note */}
        <motion.p
          initial={prefersReducedMotion ? false : { opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.18, delay: 0.2 }}
          className="text-center text-body-sm text-locked mt-12"
        >
          Leaderboards are opt-in, cohort-based, and focused on consistency. Community features will open gradually.
        </motion.p>
      </div>
    </section>
  )
}
