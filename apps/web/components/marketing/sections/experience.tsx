'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { EXPERIENCE_FEATURES } from '@/config/content'
import { ModuleCardPreview } from '@/components/marketing/product-mockup/module-card-preview'
import * as LucideIcons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'lesson',     label: 'Lesson',     mockup: 'module' },
  { id: 'quiz',       label: 'Quiz',       mockup: 'quiz' },
  { id: 'flashcard',  label: 'Flashcard',  mockup: 'flashcard' },
  { id: 'assignment', label: 'Assignment', mockup: 'assignment' },
  { id: 'casestudy',  label: 'Case Study', mockup: 'casestudy' },
]

function MockupPanel({ type }: { type: string }) {
  const content: Record<string, React.ReactNode> = {
    module: <ModuleCardPreview />,
    quiz: (
      <div className="bg-surface border border-border rounded-lg p-5 space-y-4 w-full max-w-[320px]">
        <p className="text-body-sm font-semibold text-foreground">Which framework best helps prioritise features when user needs conflict with business goals?</p>
        <div className="space-y-2">
          {['RICE', 'ICE', 'MoSCoW', 'Kano Model'].map((opt) => (
            <div key={opt} className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-sm border text-body-sm cursor-pointer',
              opt === 'MoSCoW'
                ? 'border-primary bg-primary/5 text-primary font-medium'
                : 'border-border text-foreground hover:border-border-strong'
            )}>
              <div className={cn('w-3.5 h-3.5 rounded-full border-2 flex-shrink-0',
                opt === 'MoSCoW' ? 'border-primary bg-primary' : 'border-border'
              )} />
              {opt}
            </div>
          ))}
        </div>
      </div>
    ),
    flashcard: (
      <div className="bg-surface border border-border rounded-lg p-5 w-full max-w-[320px] text-center space-y-3">
        <span className="text-caption text-locked font-medium uppercase tracking-wide">Flashcard · Strategy</span>
        <h4 className="text-h4 font-semibold text-foreground">What is a North Star Metric?</h4>
        <div className="pt-3 border-t border-border">
          <p className="text-body-sm text-locked">The single metric that best captures the core value your product delivers to customers.</p>
        </div>
      </div>
    ),
    assignment: (
      <div className="bg-surface border border-border rounded-lg p-5 w-full max-w-[320px] space-y-3">
        <span className="text-caption text-locked font-medium uppercase tracking-wide">Assignment · Module 03</span>
        <h4 className="text-h4 font-semibold text-foreground">Write a problem statement for your chosen product.</h4>
        <p className="text-body-sm text-locked">Use the Jobs-to-be-Done format. Include target user, context, and pain point with one behavioural signal.</p>
        <div className="h-20 bg-surface-muted rounded-sm border border-dashed border-border flex items-center justify-center">
          <span className="text-caption text-locked">Your response here</span>
        </div>
      </div>
    ),
    casestudy: (
      <div className="bg-surface border border-border rounded-lg p-5 w-full max-w-[320px] space-y-3">
        <span className="text-caption text-locked font-medium uppercase tracking-wide">Case Study · Module 02</span>
        <h4 className="text-h4 font-semibold text-foreground">Netflix: The Qwikster Split</h4>
        <p className="text-body-sm text-locked">How Reed Hastings navigated splitting DVD-by-mail and streaming, and what it teaches about product positioning.</p>
        <div className="pt-2 border-t border-border flex items-center justify-between text-xs text-primary font-semibold">
          <span>Read analysis →</span>
          <span className="text-locked font-normal">8 min read</span>
        </div>
      </div>
    ),
  }

  return (
    <div className="flex items-center justify-center p-4 min-h-[220px]">
      {content[type] ?? content.module}
    </div>
  )
}

/**
 * Learning Experience section — Sprint 2 §12 + Sprint 3 experience copy.
 */
export function ExperienceSection() {
  const [activeTab, setActiveTab] = useState('lesson')
  const prefersReducedMotion = useReducedMotion()

  return (
    <section
      id="experience"
      aria-labelledby="experience-heading"
      className="py-20 lg:py-28 scroll-mt-24 lg:scroll-mt-28"
    >
      <div className="max-w-[1120px] mx-auto px-5 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-[5fr_7fr] gap-12 lg:gap-16 items-start">

          {/* Left: Feature list */}
          <div>
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.18, ease: [0, 0, 0.2, 1] }}
            >
              <h2
                id="experience-heading"
                className="font-display text-h1 lg:text-h1 font-semibold text-foreground mb-3"
              >
                Every format has a job.
              </h2>
              <p className="text-body-lg text-locked leading-relaxed mb-8">
                Lessons introduce a concept. Quizzes test it immediately. Flashcards bring it back with spaced repetition so it sticks. Assignments make you apply it. Case studies show how it plays out in the real world.
              </p>
            </motion.div>

            <div className="space-y-4">
              {EXPERIENCE_FEATURES.map((feature, index) => {
                const IconComponent = (LucideIcons as unknown as Record<string, LucideIcon | undefined>)[feature.icon]
                return (
                  <motion.div
                    key={feature.title}
                    initial={prefersReducedMotion ? false : { opacity: 0, x: -8 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, amount: 0.5 }}
                    transition={{ duration: 0.18, delay: index * 0.05, ease: [0, 0, 0.2, 1] }}
                    className="flex gap-3"
                  >
                    {IconComponent && (
                      <div className="w-8 h-8 rounded-sm bg-surface-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                        <IconComponent size={16} className="text-foreground" aria-hidden="true" />
                      </div>
                    )}
                    <div>
                      <p className="text-body-sm font-semibold text-foreground">{feature.title}</p>
                      <p className="text-body-sm text-locked mt-0.5">{feature.description}</p>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>

          {/* Right: Tabbed mockup panel */}
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.24, ease: [0, 0, 0.2, 1] }}
            className="bg-surface border border-border rounded-lg overflow-hidden shadow-sm"
          >
            {/* Tab bar */}
            <div className="flex border-b border-border overflow-x-auto" role="tablist" aria-label="Learning mode preview">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  role="tab"
                  id={`tab-${tab.id}`}
                  aria-selected={activeTab === tab.id}
                  aria-controls={`panel-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'px-4 py-3 text-body-sm font-medium flex-shrink-0',
                    'border-b-2 transition-all duration-[120ms]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus',
                    activeTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-locked hover:text-foreground hover:border-border',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Panel */}
            <div role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={prefersReducedMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
                >
                  <MockupPanel type={TABS.find(t => t.id === activeTab)?.mockup ?? 'module'} />
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
