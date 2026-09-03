'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { JOURNEY_STAGES } from '@/config/content'
import { SKILL_COLORS } from '@/lib/design/tokens'
import { TOKENS } from '@/theme/tokens'
import { cn } from '@/lib/utils'

/**
 * Learning Journey roadmap — dynamic auto-stepping timeline.
 * Desktop: horizontal animated progression track.
 * Tablet: 2×3 grid. Mobile: vertical timeline.
 */
export function JourneySection() {
  const prefersReducedMotion = useReducedMotion()
  const [activeStage, setActiveStage] = useState<number>(0)
  const [isHovered, setIsHovered] = useState(false)
  const ref = useRef<HTMLOListElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.2 })

  // Auto-advance step progression every 2.8 seconds
  useEffect(() => {
    if (isHovered || prefersReducedMotion) return

    const timer = setInterval(() => {
      setActiveStage((prev) => (prev + 1) % JOURNEY_STAGES.length)
    }, 2800)

    return () => clearInterval(timer)
  }, [isHovered, prefersReducedMotion])

  const activeColor =
    JOURNEY_STAGES[activeStage]?.cluster
      ? SKILL_COLORS[JOURNEY_STAGES[activeStage].cluster]
      : TOKENS.colors.primary

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
          className="text-center mb-14"
        >
          <h2
            id="journey-heading"
            className="font-display text-h1 lg:text-display-lg font-semibold text-foreground mb-4"
          >
            Six stages. Each one builds on the last.
          </h2>
          <p className="text-body-lg text-locked max-w-[540px] mx-auto leading-relaxed">
            Move from first principles to increasingly complex product decisions — building the judgment, work, and portfolio evidence that accumulate throughout the journey.
          </p>
        </motion.div>

        {/* Journey interactive container */}
        <div
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className="relative"
        >
          {/* Journey stages list */}
          <ol
            ref={ref}
            className="
              grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6
              gap-6 lg:gap-0
              relative
            "
            aria-label="Learning journey stages"
          >
            {/* Desktop Background track */}
            <div
              aria-hidden="true"
              className="hidden lg:block absolute top-8 left-[8.33%] right-[8.33%] h-0.5 bg-[#E5E0D4] z-0 rounded-full"
            />

            {/* Desktop Dynamic Animated Progress Beam */}
            {!prefersReducedMotion && (
              <>
                <motion.div
                  aria-hidden="true"
                  className="hidden lg:block absolute top-8 left-[8.33%] h-0.5 z-0 rounded-full origin-left"
                  animate={{
                    width: `${(activeStage / (JOURNEY_STAGES.length - 1)) * 83.33}%`,
                    backgroundColor: activeColor,
                  }}
                  transition={{ type: 'spring', stiffness: 120, damping: 22 }}
                />

                {/* Traveling Energy Pulse Beacon */}
                <motion.div
                  aria-hidden="true"
                  className="hidden lg:block absolute top-[30px] -ml-1 w-2.5 h-2.5 rounded-full z-0 shadow-sm"
                  animate={{
                    left: `${8.33 + (activeStage / (JOURNEY_STAGES.length - 1)) * 83.33}%`,
                    backgroundColor: activeColor,
                    boxShadow: `0 0 12px 2px ${activeColor}`,
                  }}
                  transition={{ type: 'spring', stiffness: 120, damping: 22 }}
                />
              </>
            )}

            {JOURNEY_STAGES.map((stage, index) => {
              const cluster = stage.cluster
              const color = cluster ? SKILL_COLORS[cluster] : TOKENS.colors.primary
              const isActive = activeStage === index
              const isPassed = activeStage > index

              return (
                <motion.li
                  key={stage.label}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
                  animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
                  transition={{
                    duration: prefersReducedMotion ? 0 : 0.24,
                    delay: prefersReducedMotion ? 0 : index * 0.06,
                    ease: [0, 0, 0.2, 1],
                  }}
                  className="relative flex flex-col items-center text-center z-10 px-2"
                >
                  {/* Node Button */}
                  <button
                    type="button"
                    onClick={() => setActiveStage(index)}
                    onMouseEnter={() => setActiveStage(index)}
                    aria-label={`Stage ${index + 1}: ${stage.label}`}
                    aria-current={isActive ? 'step' : undefined}
                    className={cn(
                      'relative w-16 h-16 rounded-full border-2 flex items-center justify-center',
                      'text-body-sm font-bold transition-all duration-300',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                      isActive
                        ? 'bg-white scale-110 shadow-lg'
                        : isPassed
                          ? 'bg-background hover:scale-105 shadow-2xs'
                          : 'bg-surface hover:scale-105',
                    )}
                    style={{
                      borderColor: color,
                      boxShadow: isActive
                        ? `0 0 0 4px ${color}20, 0 10px 25px -5px ${color}35`
                        : undefined,
                    }}
                  >
                    {/* Animated Pulsing Ring on Active Node */}
                    {isActive && !prefersReducedMotion && (
                      <motion.span
                        aria-hidden="true"
                        initial={{ scale: 0.9, opacity: 0.8 }}
                        animate={{ scale: 1.35, opacity: 0 }}
                        transition={{
                          duration: 1.6,
                          repeat: Infinity,
                          ease: 'easeOut',
                        }}
                        className="absolute inset-0 rounded-full border-2 pointer-events-none"
                        style={{ borderColor: color }}
                      />
                    )}

                    <span
                      className={cn(
                        'transition-all duration-200',
                        isActive ? 'scale-110 font-extrabold' : 'font-bold',
                      )}
                      style={{ color }}
                    >
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  </button>

                  {/* Stage Label */}
                  <p
                    className={cn(
                      'mt-3.5 text-body-sm font-semibold transition-colors duration-200',
                      isActive ? 'text-foreground' : 'text-foreground/90',
                    )}
                  >
                    {stage.label}
                  </p>

                  {/* Stage Description */}
                  <p
                    className={cn(
                      'mt-1 text-caption leading-relaxed max-w-[130px] transition-colors duration-200',
                      isActive ? 'text-foreground font-medium' : 'text-locked',
                    )}
                  >
                    {stage.description}
                  </p>

                  {/* Milestone Bullet Pills for Active Stage */}
                  <div className="min-h-[70px] w-full pt-2">
                    <AnimatePresence mode="wait">
                      {isActive && (
                        <motion.ul
                          initial={{ opacity: 0, y: 4, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -4, scale: 0.96 }}
                          transition={{ duration: 0.18, ease: 'easeOut' }}
                          className="flex flex-col gap-1 text-left px-1.5 py-2 bg-white/90 border border-[#DED8CB]/70 rounded-lg shadow-2xs mt-1"
                        >
                          {stage.milestones.map((m) => (
                            <li key={m} className="flex items-center gap-1.5 text-[11px] text-[#70685A]">
                              <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: color }}
                              />
                              <span className="truncate">{m}</span>
                            </li>
                          ))}
                        </motion.ul>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.li>
              )
            })}
          </ol>
        </div>
      </div>
    </section>
  )
}
