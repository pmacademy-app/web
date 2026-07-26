'use client'

import { motion } from 'framer-motion'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { AIChatPreview } from '@/components/marketing/product-mockup/ai-chat-preview'
import { AI_MENTOR_CAPABILITIES } from '@/config/content'
import * as LucideIcons from 'lucide-react'
import type { LucideProps } from 'lucide-react'

/**
 * AI Mentor section — Sprint 2 §15 + Sprint 3 AI mentor copy.
 */
export function AIMentorSection() {
  const prefersReducedMotion = useReducedMotion()

  return (
    <section
      id="ai-mentor"
      aria-labelledby="ai-heading"
      className="bg-surface-muted py-20 lg:py-28"
    >
      <div className="max-w-[1120px] mx-auto px-5 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">

          {/* Left: Chat preview */}
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.24, ease: [0, 0, 0.2, 1] }}
          >
            <AIChatPreview />
          </motion.div>

          {/* Right: Content */}
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, x: 16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.24, ease: [0, 0, 0.2, 1] }}
          >
            <h2
              id="ai-heading"
              className="font-display text-h1 font-semibold text-foreground mb-3"
            >
              A mentor that reviews your work. Not just your answers.
            </h2>
            <p className="text-body-lg text-locked leading-relaxed mb-8">
              The AI Mentor is embedded in the curriculum — not bolted on. Ask questions, get PRD feedback, and generate practice prompts without leaving your lesson.
            </p>

            {/* Capabilities */}
            <div className="space-y-4 mb-8">
              {AI_MENTOR_CAPABILITIES.map((cap, index) => {
                const IconComponent = (LucideIcons as any)[cap.icon] as React.ComponentType<any> | undefined
                return (
                  <motion.div
                    key={cap.title}
                    initial={prefersReducedMotion ? false : { opacity: 0, x: 8 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, amount: 0.5 }}
                    transition={{ duration: 0.18, delay: index * 0.06, ease: [0, 0, 0.2, 1] }}
                    className="flex gap-3"
                  >
                    {IconComponent && (
                      <div className="w-8 h-8 rounded-sm bg-ai/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <IconComponent size={16} className="text-ai" aria-hidden="true" />
                      </div>
                    )}
                    <div>
                      <p className="text-body-sm font-semibold text-foreground">{cap.title}</p>
                      <p className="text-body-sm text-locked mt-0.5">{cap.description}</p>
                    </div>
                  </motion.div>
                )
              })}
            </div>

            {/* Trust line — Sprint 3 verbatim */}
            <p className="text-body-sm text-locked border-t border-border pt-4">
              Structured curriculum first. AI support when it helps.
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
