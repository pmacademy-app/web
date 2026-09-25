'use client'

/**
 * The learning-journey timeline (B12-B).
 *
 * This one is genuinely interactive end to end: six nodes that respond to hover and
 * click, a 2.8 s auto-advance, a progress beam that tracks the active stage, and a
 * milestone list that swaps in and out. It stays a client component — but it no longer
 * needs framer-motion for any of it.
 *
 * What each animation became:
 *
 * - The progress beam and its travelling beacon were `motion.div` with a spring on
 *   `width` / `left` / `backgroundColor`. They are now CSS transitions on the same
 *   properties, with the values driven by inline style. A spring overshoots slightly and
 *   an ease-out does not; over a 500 ms move between six fixed stops, that is not a
 *   difference anyone sees.
 * - The pulsing ring on the active node was `repeat: Infinity` on scale and opacity.
 *   That is exactly Tailwind's `animate-ping`.
 * - The milestone list was `AnimatePresence mode="wait"`. It is now a keyed CSS enter
 *   animation; React remounts it when the active stage changes.
 *
 * `useReducedMotion` still gates the auto-advance timer and the decorative beam, since
 * neither is something CSS can decide. The node buttons use the shared Button primitive
 * rather than raw elements, because this file is new and B11-C's rule applies to it.
 */

import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { JOURNEY_STAGES } from '@/config/content'
import { SKILL_COLORS } from '@/lib/design/tokens'
import { TOKENS } from '@/theme/tokens'
import { cn } from '@/lib/utils'

const BEAM_TRANSITION =
  'transition-[width,left,background-color,box-shadow] duration-500 ease-out motion-reduce:transition-none'

export function JourneyTimeline() {
  const prefersReducedMotion = useReducedMotion()
  const [activeStage, setActiveStage] = useState<number>(0)
  const [isHovered, setIsHovered] = useState(false)

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

  const progress = (activeStage / (JOURNEY_STAGES.length - 1)) * 83.33

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative"
    >
      {/* Journey stages list */}
      <ol
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
            <div
              aria-hidden="true"
              className={cn(
                'hidden lg:block absolute top-8 left-[8.33%] h-0.5 z-0 rounded-full origin-left',
                BEAM_TRANSITION
              )}
              style={{ width: `${progress}%`, backgroundColor: activeColor }}
            />

            {/* Traveling Energy Pulse Beacon */}
            <div
              aria-hidden="true"
              className={cn(
                'hidden lg:block absolute top-[30px] -ml-1 w-2.5 h-2.5 rounded-full z-0 shadow-sm',
                BEAM_TRANSITION
              )}
              style={{
                left: `${8.33 + progress}%`,
                backgroundColor: activeColor,
                boxShadow: `0 0 12px 2px ${activeColor}`,
              }}
            />
          </>
        )}

        {JOURNEY_STAGES.map((stage, index) => {
          const cluster = stage.cluster
          const color = cluster ? SKILL_COLORS[cluster] : TOKENS.colors.primary
          const isActive = activeStage === index
          const isPassed = activeStage > index

          return (
            <li
              key={stage.label}
              className="relative flex flex-col items-center text-center z-10 px-2"
            >
              {/* Node Button */}
              <Button
                type="button"
                variant="ghost"
                onClick={() => setActiveStage(index)}
                onMouseEnter={() => setActiveStage(index)}
                aria-label={`Stage ${index + 1}: ${stage.label}`}
                aria-current={isActive ? 'step' : undefined}
                className={cn(
                  'relative w-16 h-16 p-0 rounded-full border-2 flex items-center justify-center',
                  'text-body-sm font-bold transition-all duration-300 motion-reduce:transition-none',
                  isActive
                    ? 'bg-white scale-110 shadow-lg hover:bg-white'
                    : isPassed
                      ? 'bg-background hover:scale-105 shadow-2xs'
                      : 'bg-surface hover:scale-105',
                  'motion-reduce:scale-100 motion-reduce:hover:scale-100'
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
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full border-2 pointer-events-none animate-ping motion-reduce:animate-none"
                    style={{ borderColor: color }}
                  />
                )}

                <span
                  className={cn(
                    'transition-all duration-200 motion-reduce:transition-none',
                    isActive ? 'scale-110 font-extrabold' : 'font-bold'
                  )}
                  style={{ color }}
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
              </Button>

              {/* Stage Label */}
              <p
                className={cn(
                  'mt-3.5 text-body-sm font-semibold transition-colors duration-200',
                  isActive ? 'text-foreground' : 'text-foreground/90'
                )}
              >
                {stage.label}
              </p>

              {/* Stage Description */}
              <p
                className={cn(
                  'mt-1 text-caption leading-relaxed max-w-[130px] transition-colors duration-200',
                  isActive ? 'text-foreground font-medium' : 'text-ink-muted'
                )}
              >
                {stage.description}
              </p>

              {/* Milestone Bullet Pills for Active Stage */}
              <div className="min-h-[70px] w-full pt-2">
                {isActive && (
                  <ul
                    key={stage.label}
                    className="animate-in fade-in zoom-in-95 slide-in-from-bottom-1 duration-200 fill-mode-both motion-reduce:animate-none flex flex-col gap-1 text-left px-1.5 py-2 bg-white/90 border border-[#DED8CB]/70 rounded-lg shadow-2xs mt-1"
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
                  </ul>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
