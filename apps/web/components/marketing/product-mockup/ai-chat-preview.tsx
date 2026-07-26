'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { WandSparkles } from 'lucide-react'
import { BUBBLE_APPEAR, STAGGER_FAST_CONTAINER } from '@/lib/animation'

/**
 * Two-bubble AI chat surface for the AI Mentor section.
 * Sprint 2 §15 example exchange — verbatim.
 * aria-hidden — section content provides context.
 */
export function AIChatPreview() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.3 })
  const prefersReducedMotion = useReducedMotion()

  const shouldAnimate = inView && !prefersReducedMotion

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="
        bg-surface border border-border rounded-lg p-4
        shadow-sm w-full space-y-3
      "
    >
      {/* Session header */}
      <div className="flex items-center gap-2 pb-3 border-b border-border">
        <div className="w-6 h-6 rounded-full bg-ai/15 flex items-center justify-center">
          <WandSparkles size={12} className="text-ai" />
        </div>
        <span className="text-body-sm font-medium text-foreground">AI Mentor</span>
        <div className="ml-auto flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          <span className="text-caption text-locked">Active</span>
        </div>
      </div>

      <motion.div
        variants={prefersReducedMotion ? undefined : STAGGER_FAST_CONTAINER}
        initial={prefersReducedMotion ? false : 'hidden'}
        animate={shouldAnimate ? 'visible' : prefersReducedMotion ? 'visible' : 'hidden'}
        className="space-y-3"
      >
        {/* Learner message */}
        <motion.div
          variants={prefersReducedMotion ? undefined : BUBBLE_APPEAR}
          className="flex justify-end"
        >
          <div className="
            max-w-[80%] bg-primary/10 border border-primary/20 rounded-lg rounded-br-xs
            px-3 py-2
          ">
            <p className="text-body-sm text-foreground">
              Can you review my PRD problem statement?
            </p>
          </div>
        </motion.div>

        {/* AI response */}
        <motion.div
          variants={prefersReducedMotion ? undefined : BUBBLE_APPEAR}
          className="flex gap-2"
        >
          <div className="w-6 h-6 rounded-full bg-ai/15 flex items-center justify-center flex-shrink-0 mt-0.5">
            <WandSparkles size={11} className="text-ai" />
          </div>
          <div className="
            max-w-[85%] bg-surface-muted border border-border rounded-lg rounded-bl-xs
            px-3 py-2
          ">
            <p className="text-body-sm text-foreground leading-relaxed">
              Your target user is clear. The pain point needs sharper evidence. Try adding one
              behavioural signal — something users actually do or avoid.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}
