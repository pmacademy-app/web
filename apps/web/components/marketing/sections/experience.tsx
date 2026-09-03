'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import {
  BookOpen,
  CheckCircle2,
  Layers,
  PenTool,
  FileText,
  RotateCw,
  Clock,
  Award,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface FormatItem {
  id: string
  title: string
  subtitle: string
  description: string
  badge: string
  icon: typeof BookOpen
}

const FORMATS: FormatItem[] = [
  {
    id: 'lesson',
    title: 'Structured Lessons',
    subtitle: 'Concept Introduction',
    description: 'First-principles explanations, decision diagrams, and guided reflection that build a strong product foundation.',
    badge: '90 Lessons',
    icon: BookOpen,
  },
  {
    id: 'quiz',
    title: 'Active Recall Quizzes',
    subtitle: 'Instant Validation',
    description: 'Scenario-based questions that test whether you can apply a product concept, not just recognize its definition.',
    badge: 'Instant Feedback',
    icon: CheckCircle2,
  },
  {
    id: 'flashcard',
    title: 'Spaced Repetition',
    subtitle: 'Long-Term Retention',
    description: 'Concept reviews return at planned intervals so important product mental models stay fresh over time.',
    badge: 'Retention',
    icon: Layers,
  },
  {
    id: 'assignment',
    title: 'Applied Artifacts',
    subtitle: 'Hands-on Deliverables',
    description: 'Create PRDs, opportunity briefs, metrics trees, roadmaps, and other product work you can keep and showcase.',
    badge: 'Portfolio Ready',
    icon: PenTool,
  },
  {
    id: 'casestudy',
    title: 'Real-World Case Studies',
    subtitle: 'Industry Trade-offs',
    description: 'Study real product decisions and use PM mental models to understand the reasoning, trade-offs, and outcomes.',
    badge: 'Product Teardowns',
    icon: FileText,
  },
]

export function ExperienceSection() {
  const prefersReducedMotion = useReducedMotion()
  const [activeFormat, setActiveFormat] = useState<string>('lesson')
  const [isPaused, setIsPaused] = useState(false)
  const [selectedQuizOption, setSelectedQuizOption] = useState<string | null>('MoSCoW')
  const [flashcardFlipped, setFlashcardFlipped] = useState(false)

  // Auto-cycle through formats every 3.8s when not hovered
  useEffect(() => {
    if (isPaused || prefersReducedMotion) return
    const timer = setInterval(() => {
      setActiveFormat((prev) => {
        const currentIndex = FORMATS.findIndex((f) => f.id === prev)
        const nextIndex = (currentIndex + 1) % FORMATS.length
        return FORMATS[nextIndex].id
      })
      // Reset flashcard state on transition
      setFlashcardFlipped(false)
    }, 3800)
    return () => clearInterval(timer)
  }, [isPaused, prefersReducedMotion])

  const activeIndex = FORMATS.findIndex((f) => f.id === activeFormat)

  return (
    <section
      id="experience"
      aria-labelledby="experience-heading"
      className="py-20 lg:py-28 bg-background border-t border-[#DED8CB]/80 scroll-mt-24 lg:scroll-mt-28"
    >
      <div className="max-w-[1120px] mx-auto px-5 lg:px-8">
        
        {/* ── Section Header ────────────────────────────────────────────── */}
        <div className="max-w-3xl mb-12 space-y-3">
          <div className="text-xs font-mono font-semibold uppercase tracking-wider text-primary">
            Learning Architecture
          </div>
          <h2
            id="experience-heading"
            className="text-3xl sm:text-4xl lg:text-[2.75rem] font-semibold text-foreground tracking-[-0.03em] leading-tight"
          >
            Every format has a job.
          </h2>
          <p className="text-base sm:text-lg text-[#70685A] leading-relaxed">
            Learn the concept, test your judgment, reinforce what you learned, apply it to a product problem, and study how the thinking plays out in practice. Each format supports a different part of learning product management.
          </p>
        </div>

        {/* ── Interactive Format Grid & Live Workbench Simulator ────────── */}
        <div
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
          className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch"
        >
          
          {/* Left Column: 5 Interactive Format Cards */}
          <div className="lg:col-span-5 flex flex-col gap-2.5">
            {FORMATS.map((format) => {
              const Icon = format.icon
              const isActive = activeFormat === format.id

              return (
                <button
                  key={format.id}
                  type="button"
                  onClick={() => {
                    setActiveFormat(format.id)
                    setFlashcardFlipped(false)
                  }}
                  onMouseEnter={() => {
                    setActiveFormat(format.id)
                    setFlashcardFlipped(false)
                  }}
                  className={cn(
                    'group w-full text-left p-4 rounded-xl border transition-all duration-200 flex items-start gap-3.5 relative overflow-hidden',
                    isActive
                      ? 'bg-white border-primary shadow-sm'
                      : 'bg-background border-[#DED8CB]/80 hover:bg-white hover:border-[#BDB4A2]',
                  )}
                >
                  {/* Left Active Indicator Bar */}
                  {isActive && (
                    <motion.span
                      layoutId="activeFormatIndicator"
                      className="absolute left-0 top-0 bottom-0 w-1 bg-primary"
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    />
                  )}

                  {/* Icon Box */}
                  <div
                    className={cn(
                      'w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors mt-0.5',
                      isActive
                        ? 'bg-[#EAF5EF] text-primary'
                        : 'bg-white text-[#70685A] border border-[#DED8CB] group-hover:text-foreground',
                    )}
                  >
                    <Icon size={18} />
                  </div>

                  {/* Text Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-foreground">
                        {format.title}
                      </h3>
                      <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-[#F2EFE7] text-[#70685A]">
                        {format.badge}
                      </span>
                    </div>
                    <p className="text-xs text-[#70685A] mt-1 leading-relaxed">
                      {format.description}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Right Column: High-Fidelity Interactive Preview Panel */}
          <div className="lg:col-span-7 flex flex-col">
            <div className="h-full bg-white border border-[#DED8CB] rounded-2xl p-6 sm:p-7 shadow-xs flex flex-col justify-between relative overflow-hidden">
              
              {/* Simulator Header */}
              <div className="flex items-center justify-between pb-4 border-b border-[#DED8CB]/70 mb-5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-xs font-mono font-semibold uppercase tracking-wider text-primary">
                    Interactive Sandbox · {FORMATS[activeIndex].subtitle}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-[#70685A] font-mono">
                  <span>Stage {activeIndex + 1}/5</span>
                </div>
              </div>

              {/* Dynamic Simulated Preview Body */}
              <div className="flex-1 flex flex-col justify-center">
                <AnimatePresence mode="wait">
                  
                  {/* PREVIEW 1: LESSON */}
                  {activeFormat === 'lesson' && (
                    <motion.div
                      key="lesson-preview"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.18 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center justify-between text-xs text-[#70685A]">
                        <span className="font-mono bg-[#F2EFE7] text-foreground px-2.5 py-0.5 rounded font-semibold">
                          Module 03 · Lesson 29
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock size={13} /> 6 min read
                        </span>
                      </div>

                      <div className="space-y-2">
                        <h4 className="text-lg font-semibold text-foreground">
                          Prioritizing with the RICE Framework
                        </h4>
                        <p className="text-xs text-[#70685A] leading-relaxed">
                          Reach, Impact, Confidence, and Effort combine into a single formula to score roadmapping trade-offs objectively.
                        </p>
                      </div>

                      <div className="p-4 rounded-xl bg-background border border-[#DED8CB] space-y-2 text-xs">
                        <div className="font-mono font-bold text-primary text-[11px] uppercase">
                          Formula Breakdown
                        </div>
                        <div className="font-mono text-foreground bg-white p-2.5 rounded-lg border border-[#DED8CB]/70 font-semibold text-center">
                          Score = (Reach × Impact × Confidence) / Effort
                        </div>
                        <p className="text-[11px] text-[#70685A] mt-1">
                          Forces teams to explicitly quantify confidence before over-investing engineering time (Lesson 29).
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {/* PREVIEW 2: QUIZ */}
                  {activeFormat === 'quiz' && (
                    <motion.div
                      key="quiz-preview"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.18 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono text-primary bg-[#EAF5EF] px-2 py-0.5 rounded font-semibold">
                          Scenario Assessment · Lesson 29
                        </span>
                        <span className="text-xs font-mono text-[#70685A]">+25 XP</span>
                      </div>

                      <h4 className="text-sm sm:text-base font-semibold text-foreground">
                        Which prioritization framework best isolates hard non-negotiable scope constraints from negotiable trade-offs?
                      </h4>

                      <div className="space-y-2">
                        {[
                          { id: 'MoSCoW', label: 'MoSCoW Method (Must, Should, Could, Won\'t)', correct: true },
                          { id: 'RICE', label: 'RICE Scoring Model', correct: false },
                          { id: 'Kano', label: 'Kano Delight Matrix', correct: false },
                        ].map((option) => {
                          const isSelected = selectedQuizOption === option.id
                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => setSelectedQuizOption(option.id)}
                              className={cn(
                                'w-full text-left px-3.5 py-2.5 rounded-xl border text-xs font-medium transition-all flex items-center justify-between',
                                isSelected
                                  ? 'bg-[#EAF5EF] border-primary text-primary font-semibold'
                                  : 'bg-background border-[#DED8CB] text-foreground hover:bg-white',
                              )}
                            >
                              <span>{option.label}</span>
                              {isSelected && <span className="text-xs font-bold text-primary">✓ Selected</span>}
                            </button>
                          )
                        })}
                      </div>

                      {selectedQuizOption === 'MoSCoW' && (
                        <div className="p-3 bg-[#EAF5EF]/80 border border-primary/30 rounded-lg text-xs text-primary leading-relaxed">
                          <strong>Correct:</strong> MoSCoW makes strategic exclusion an explicit, visible category (&ldquo;Won&apos;t Have&rdquo;), directly enforcing Lesson 10&apos;s discipline that a real strategy must say no.
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* PREVIEW 3: FLASHCARD */}
                  {activeFormat === 'flashcard' && (
                    <motion.div
                      key="flashcard-preview"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.18 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center justify-between text-xs text-[#70685A]">
                        <span className="font-mono bg-[#F2EFE7] px-2 py-0.5 rounded font-semibold text-foreground">
                          Card 18 of 24 · Module 05 (Lesson 42)
                        </span>
                        <span className="text-[11px] text-[#70685A]">Next review: 3 days</span>
                      </div>

                      {/* Interactive Flip Card */}
                      <button
                        type="button"
                        onClick={() => setFlashcardFlipped(!flashcardFlipped)}
                        className="w-full text-left p-5 rounded-xl border border-[#DED8CB] bg-background hover:bg-white transition-all duration-200 shadow-2xs space-y-3 cursor-pointer group"
                      >
                        <div className="flex items-center justify-between text-xs font-mono text-[#70685A]">
                          <span className="text-primary font-semibold">
                            {flashcardFlipped ? 'ANSWER (FLIPPED)' : 'PROMPT'}
                          </span>
                          <span className="flex items-center gap-1 group-hover:text-foreground">
                            <RotateCw size={12} className="group-hover:rotate-180 transition-transform duration-300" />
                            Click to {flashcardFlipped ? 'hide' : 'reveal'}
                          </span>
                        </div>

                        <div className="min-h-[70px] flex items-center">
                          {flashcardFlipped ? (
                            <p className="text-sm font-medium text-foreground leading-relaxed">
                              The single metric that best captures the core value your product delivers to customers, serving as the top-level anchor for the product&apos;s metric tree (Lesson 42).
                            </p>
                          ) : (
                            <h4 className="text-base font-semibold text-foreground">
                              What is the core purpose of a North Star Metric?
                            </h4>
                          )}
                        </div>
                      </button>

                      {/* Interval Rating Buttons */}
                      <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                        <span className="p-2 rounded-lg bg-[#F2EFE7] text-[11px] font-mono text-[#70685A]">
                          Again · 10m
                        </span>
                        <span className="p-2 rounded-lg bg-[#EAF5EF] text-[11px] font-mono text-primary font-semibold">
                          Good · 3d
                        </span>
                        <span className="p-2 rounded-lg bg-[#F2EFE7] text-[11px] font-mono text-[#70685A]">
                          Easy · 7d
                        </span>
                      </div>
                    </motion.div>
                  )}

                  {/* PREVIEW 4: ASSIGNMENT */}
                  {activeFormat === 'assignment' && (
                    <motion.div
                      key="assignment-preview"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.18 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center justify-between text-xs text-[#70685A]">
                        <span className="font-mono bg-[#EAF5EF] text-primary px-2 py-0.5 rounded font-semibold">
                          Capstone Deliverable · Module 03 (Lesson 22)
                        </span>
                        <span className="font-mono font-semibold text-foreground">+150 XP</span>
                      </div>

                      <div>
                        <h4 className="text-base font-semibold text-foreground">
                          Product Requirements Document (PRD) Specification
                        </h4>
                        <p className="text-xs text-[#70685A] mt-0.5">
                          Solution-free problem statement, non-goals, user stories, and acceptance criteria.
                        </p>
                      </div>

                      <div className="p-4 rounded-xl bg-background border border-[#DED8CB] space-y-2 text-xs">
                        <div className="flex items-center justify-between font-mono text-[11px] text-[#70685A]">
                          <span>Portfolio Rubric Checklist</span>
                          <span className="text-primary font-semibold">3/3 Complete</span>
                        </div>
                        <div className="space-y-1.5 pt-1">
                          <div className="flex items-center gap-2 text-foreground">
                            <CheckCircle2 size={13} className="text-primary" />
                            <span>Solution-free Problem Statement (Lesson 17 template)</span>
                          </div>
                          <div className="flex items-center gap-2 text-foreground">
                            <CheckCircle2 size={13} className="text-primary" />
                            <span>Explicit Non-Goals defined to prevent scope creep (Lesson 22)</span>
                          </div>
                          <div className="flex items-center gap-2 text-foreground">
                            <CheckCircle2 size={13} className="text-primary" />
                            <span>Testable Acceptance Criteria with Gherkin syntax (Lesson 24)</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* PREVIEW 5: CASE STUDY */}
                  {activeFormat === 'casestudy' && (
                    <motion.div
                      key="casestudy-preview"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.18 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center justify-between text-xs text-[#70685A]">
                        <span className="font-mono bg-[#F2EFE7] text-foreground px-2 py-0.5 rounded font-semibold">
                          Product Teardown · Module 07 (Lesson 61)
                        </span>
                        <span className="flex items-center gap-1 font-mono">
                          <Award size={13} className="text-primary" /> Diagnostic Study
                        </span>
                      </div>

                      <div>
                        <h4 className="text-base font-semibold text-foreground">
                          The Premature Marketplace: Platform Sequencing Failure
                        </h4>
                        <p className="text-xs text-[#70685A] mt-0.5">
                          How a B2B SaaS company invested in a public developer marketplace while its underlying APIs were still unversioned and unstable.
                        </p>
                      </div>

                      <div className="p-4 rounded-xl bg-background border border-[#DED8CB] space-y-2 text-xs">
                        <div className="font-mono text-[11px] font-bold text-primary uppercase">
                          Key Decision Takeaway
                        </div>
                        <p className="text-foreground leading-relaxed">
                          Investing in an open developer marketplace before establishing reliable, versioned developer surfaces breaks cross-side trust and stalls ecosystem growth (Lesson 61).
                        </p>
                      </div>
                    </motion.div>
                  )}

                </AnimatePresence>
              </div>

              {/* Sandbox Footer Action */}
              <div className="pt-4 mt-5 border-t border-[#DED8CB]/70 flex items-center justify-between text-xs">
                <span className="text-[#70685A]">
                  Auto-advances through all 5 formats
                </span>
                <span className="font-semibold text-primary flex items-center gap-1">
                  <span>Hover to pause</span>
                </span>
              </div>
            </div>
          </div>

        </div>

      </div>
    </section>
  )
}
