'use client'

import { useState, useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { JOURNEY_STAGES } from '@/config/content'
import { SKILL_COLORS } from '@/lib/design/tokens'
import { cn } from '@/lib/utils'

/**
 * Learning Journey roadmap — Sprint 2 §10 + Sprint 3 journey copy.
 * Desktop: horizontal stages. Tablet: 2×3 grid. Mobile: vertical timeline.
 */
export function JourneySection() {
  const prefersReducedMotion = useReducedMotion()
  const [activeStage, setActiveStage] = useState<number | null>(null)
  const ref = useRef<HTMLOListElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.2 })

  return (
    <section
      id="journey"
      aria-labelledby="journey-heading"
      className="py-20 lg:py-28"
    >
      <div className="max-w-[1120px] mx-auto px-5 lg:px-8">
        {/* Header */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.18, ease: [0, 0, 0.2, 1] }}
          className="text-center mb-12"
        >
          <h2
            id="journey-heading"
            className="font-display text-h1 lg:text-display-lg font-semibold text-foreground mb-4"
          >
            A path that builds on itself.
          </h2>
          <p className="text-body-lg text-locked max-w-[540px] mx-auto leading-relaxed">
            Six stages from first principles to career-ready. Each stage unlocks the next.
          </p>
        </motion.div>

        {/* Journey stages */}
        <ol
          ref={ref}
          className="
            grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6
            gap-4 lg:gap-0
            relative
          "
          aria-label="Learning journey stages"
        >
          {/* Desktop connector line */}
          <div
            aria-hidden="true"
            className="hidden lg:block absolute top-8 left-[8.33%] right-[8.33%] h-px bg-border z-0"
          />

          {JOURNEY_STAGES.map((stage, index) => {
            const cluster = stage.cluster
            const color = cluster ? SKILL_COLORS[cluster] : '#1F6B4E'
            const isActive = activeStage === index

            return (
              <motion.li
                key={stage.label}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
                animate={
                  inView
                    ? { opacity: 1, y: 0 }
                    : { opacity: 0, y: 16 }
                }
                transition={{
                  duration: prefersReducedMotion ? 0 : 0.24,
                  delay: prefersReducedMotion ? 0 : index * 0.08,
                  ease: [0, 0, 0.2, 1],
                }}
                className="relative flex flex-col items-center lg:items-center text-center z-10"
              >
                {/* Node */}
                <button
                  type="button"
                  onClick={() => setActiveStage(isActive ? null : index)}
                  aria-expanded={isActive}
                  className={cn(
                    'w-16 h-16 rounded-full border-2 flex items-center justify-center',
                    'text-body-sm font-bold transition-all duration-[180ms]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                    'hover:scale-105',
                    isActive
                      ? 'bg-foreground border-transparent text-background shadow-md'
                      : 'bg-surface border-border hover:border-border-strong',
                  )}
                  style={{ borderColor: isActive ? 'transparent' : color }}
                >
                  <span style={{ color: isActive ? 'white' : color }}>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                </button>

                {/* Stage label */}
                <p className="mt-3 text-body-sm font-semibold text-foreground">
                  {stage.label}
                </p>
                <p className="mt-1 text-caption text-locked leading-relaxed max-w-[120px]">
                  {stage.description}
                </p>

                {/* Expanded milestones */}
                <motion.div
                  initial={false}
                  animate={
                    isActive
                      ? { height: 'auto', opacity: 1 }
                      : { height: 0, opacity: 0 }
                  }
                  transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: [0, 0, 0.2, 1] }}
                  className="overflow-hidden w-full"
                >
                  <ul className="mt-3 flex flex-col gap-1 text-left px-2">
                    {stage.milestones.map((m) => (
                      <li key={m} className="flex items-center gap-1.5">
                        <div
                          className="w-1 h-1 rounded-full flex-shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-caption text-locked">{m}</span>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              </motion.li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
