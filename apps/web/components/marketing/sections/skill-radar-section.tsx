'use client'

import { useRef, useEffect } from 'react'
import { motion, useInView } from 'framer-motion'
import { SkillRadar } from '@/components/marketing/product-mockup/skill-radar'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { SKILL_RADAR_DEMO } from '@/config/content'
import { SKILL_COLORS, SKILL_LABELS } from '@/lib/design/tokens'
import { SKILL_CLUSTER_IDS } from '@/lib/skillRadar'
import { trackPortfolioView } from '@/lib/analytics'

/**
 * Skill Radar section — Sprint 2 §13 + Sprint 3 skill radar copy.
 */
export function SkillRadarSection() {
  const prefersReducedMotion = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.2 })

  // Analytics — portfolio section is the next adjacent scroll area
  useEffect(() => {
    if (inView) trackPortfolioView()
  }, [inView])

  return (
    <section
      id="skill-radar"
      aria-labelledby="radar-heading"
      className="bg-surface-muted py-20 lg:py-28 scroll-mt-24 lg:scroll-mt-28"
    >
      <div className="max-w-[1120px] mx-auto px-5 lg:px-8" ref={ref}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">

          {/* Left: Radar */}
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, x: -16 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.3, ease: [0, 0, 0.2, 1] }}
            className="flex flex-col items-center justify-center"
          >
            <div className="mb-3 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[11px] font-bold uppercase tracking-wider">
              Sample Competency Profile
            </div>
            <SkillRadar
              values={SKILL_RADAR_DEMO.after}
              previousValues={SKILL_RADAR_DEMO.before}
              size={340}
              showLegend={false}
            />
          </motion.div>

          {/* Right: Content */}
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, x: 16 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.3, delay: 0.1, ease: [0, 0, 0.2, 1] }}
          >
            <h2
              id="radar-heading"
              className="font-display text-h1 lg:text-display-lg font-semibold text-foreground mb-4"
            >
              Know what kind of PM you&apos;re becoming.
            </h2>
            <p className="text-body-lg text-locked leading-relaxed mb-8">
              Your progress is tracked across seven real competencies — discovery, strategy, execution, design, growth, leadership, and technical fluency — based on what you&apos;ve actually completed, not what you say you know.
            </p>

            {/* Competency legend */}
            <div className="space-y-3 mb-8">
              {SKILL_CLUSTER_IDS.map((cluster, index) => (
                <motion.div
                  key={cluster}
                  initial={prefersReducedMotion ? false : { opacity: 0, x: 8 }}
                  animate={inView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.18, delay: 0.2 + index * 0.05, ease: [0, 0, 0.2, 1] }}
                  className="flex items-center gap-3"
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: SKILL_COLORS[cluster] }}
                  />
                  <span className="text-body-sm text-foreground flex-1">{SKILL_LABELS[cluster]}</span>
                  <div className="flex items-center gap-1">
                    <div className="h-1.5 w-24 bg-border rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: SKILL_COLORS[cluster] }}
                        initial={{ width: 0 }}
                        animate={inView ? { width: `${SKILL_RADAR_DEMO.after[cluster]}%` } : { width: 0 }}
                        transition={{ duration: prefersReducedMotion ? 0 : 0.6, delay: 0.3 + index * 0.05 }}
                      />
                    </div>
                    <span className="text-caption text-locked w-8 text-right">
                      {SKILL_RADAR_DEMO.after[cluster]}%
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Trust line */}
            <p className="text-body-sm text-locked border-t border-border pt-4">
              Skill tracking is based on completed lessons, quiz scores, and assignment submissions — not self-reporting.
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
