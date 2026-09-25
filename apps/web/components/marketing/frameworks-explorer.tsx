'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { ArrowRight } from 'lucide-react'
import type { FrameworkItem } from '@/lib/frameworks'
import { cn } from '@/lib/utils'

interface FrameworksExplorerProps {
  frameworks: FrameworkItem[]
}

const COMPACT_DATA: Record<string, { coreRule: string; whyItMatters: string; schematic: React.ReactNode }> = {
  'accountability-triangle': {
    coreRule: 'Every sound product decision simultaneously satisfies user demand, technical feasibility, and business monetization.',
    whyItMatters: 'Stops teams from shipping engineering marvels that nobody buys.',
    schematic: (
      <div className="grid grid-cols-3 gap-1.5 text-center font-mono text-[11px]">
        <span className="p-1.5 rounded bg-surface border border-border text-primary font-bold">Desirability</span>
        <span className="p-1.5 rounded bg-surface border border-border text-skill-strategy font-bold">Feasibility</span>
        <span className="p-1.5 rounded bg-surface border border-border text-skill-leadership font-bold">Viability</span>
      </div>
    ),
  },
  'decision-chain': {
    coreRule: 'Sequential diagnostic workflow: Problem ➔ User Insight ➔ Tradeoff Choice ➔ Sprint Delivery ➔ Outcome.',
    whyItMatters: 'Evaluates PMs on user behavior change rather than raw output velocity.',
    schematic: (
      <div className="flex items-center justify-between text-center font-mono text-[10px] py-0.5">
        <span className="px-2 py-1 rounded bg-surface border border-border font-semibold">Problem</span>
        <span className="text-ink-muted">→</span>
        <span className="px-2 py-1 rounded bg-surface border border-border font-semibold">Insight</span>
        <span className="text-ink-muted">→</span>
        <span className="px-2 py-1 rounded bg-surface border border-border font-semibold">Tradeoff</span>
        <span className="text-ink-muted">→</span>
        <span className="px-2 py-1 rounded bg-primary-soft border border-primary/30 font-bold text-primary">Outcome</span>
      </div>
    ),
  },
  'user-customer-tension': {
    coreRule: 'Separates the operator using the product from the executive signing the procurement contract.',
    whyItMatters: 'Prevents churn caused by pleasing enterprise buyers while alienating daily users.',
    schematic: (
      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
        <div className="p-2 rounded bg-surface border border-border flex items-center justify-between">
          <span className="font-bold text-primary">User</span>
          <span className="text-[10px] text-ink-muted">Workflow Speed</span>
        </div>
        <div className="p-2 rounded bg-surface border border-border flex items-center justify-between">
          <span className="font-bold text-skill-leadership">Buyer</span>
          <span className="text-[10px] text-ink-muted">ROI &amp; Security</span>
        </div>
      </div>
    ),
  },
  'opportunity-brief': {
    coreRule: '1-page pre-PRD artifact locking user evidence, target persona, success metric, and non-goals.',
    whyItMatters: 'Enforces discovery rigor before committing engineering sprint capacity.',
    schematic: (
      <div className="grid grid-cols-4 gap-1 text-center font-mono text-[10px]">
        <span className="p-1.5 rounded bg-surface border border-border font-semibold text-primary">1. Evidence</span>
        <span className="p-1.5 rounded bg-surface border border-border font-semibold">2. Target Who</span>
        <span className="p-1.5 rounded bg-surface border border-border font-semibold text-skill-strategy">3. Metric</span>
        <span className="p-1.5 rounded bg-danger-bg border border-danger/25 font-bold text-danger">4. Non-Goals</span>
      </div>
    ),
  },
  'problem-statement-matrix': {
    coreRule: '4-part diagnostic matrix specifying exact user persona, friction point, workaround failure, and business cost.',
    whyItMatters: 'Kills premature solution-bias by keeping problems grounded in verified user pain.',
    schematic: (
      <div className="grid grid-cols-4 gap-1 text-center font-mono text-[10px]">
        <span className="p-1.5 rounded bg-surface border border-border font-bold text-primary">Who</span>
        <span className="p-1.5 rounded bg-surface border border-border font-semibold">Friction</span>
        <span className="p-1.5 rounded bg-surface border border-border font-semibold">Workaround</span>
        <span className="p-1.5 rounded bg-surface border border-border font-bold text-skill-strategy">Impact</span>
      </div>
    ),
  },
  'discovery-delivery-handoff': {
    coreRule: 'Continuous research-to-backlog bridge connecting validated user insights directly into sprint objectives.',
    whyItMatters: 'Prevents discovery research from gathering dust in unused slide decks.',
    schematic: (
      <div className="flex items-center justify-between text-center font-mono text-[10px] py-0.5">
        <span className="flex-1 p-1.5 rounded bg-surface border border-border font-bold text-primary">User Research</span>
        <span className="text-ink-muted px-1">⇄</span>
        <span className="flex-1 p-1.5 rounded bg-surface border border-border font-semibold">Backlog Items</span>
        <span className="text-ink-muted px-1">⇄</span>
        <span className="flex-1 p-1.5 rounded bg-surface border border-border font-bold text-skill-strategy">Sprint Goals</span>
      </div>
    ),
  },
  'stakeholder-ledger': {
    coreRule: 'Systematic weighting framework balancing cross-functional inputs against strategic product themes.',
    whyItMatters: 'Stops roadmaps from devolving into reactive compromises for the loudest voices.',
    schematic: (
      <div className="grid grid-cols-4 gap-1 text-center font-mono text-[10px]">
        <span className="p-1.5 rounded bg-surface border border-border">Sales</span>
        <span className="p-1.5 rounded bg-surface border border-border">Support</span>
        <span className="p-1.5 rounded bg-surface border border-border">Legal</span>
        <span className="p-1.5 rounded bg-primary-soft border border-primary/30 font-bold text-primary">PM Weight</span>
      </div>
    ),
  },
  'ownership-zones-model': {
    coreRule: 'Triad decision boundaries: PM owns Problem & Value, Eng owns Architecture, Design owns Interaction.',
    whyItMatters: 'Eliminates micromanagement and territorial friction across the core triad.',
    schematic: (
      <div className="grid grid-cols-3 gap-1.5 text-center font-mono text-[10px]">
        <span className="p-1.5 rounded bg-surface border border-border font-bold text-primary">PM: Value</span>
        <span className="p-1.5 rounded bg-surface border border-border font-bold text-skill-strategy">Eng: Feasibility</span>
        <span className="p-1.5 rounded bg-surface border border-border font-bold text-ai">Design: UX</span>
      </div>
    ),
  },
  'regulatory-surface-map': {
    coreRule: 'Proactive audit mapping privacy (GDPR), accessibility (WCAG), and security constraints before build.',
    whyItMatters: 'Prevents costly late-stage launch blockers and compliance liabilities.',
    schematic: (
      <div className="grid grid-cols-3 gap-1.5 text-center font-mono text-[10px]">
        <span className="p-1.5 rounded bg-surface border border-border">Privacy (GDPR)</span>
        <span className="p-1.5 rounded bg-surface border border-border">WCAG 2.1 AA</span>
        <span className="p-1.5 rounded bg-surface border border-border">Auth / Security</span>
      </div>
    ),
  },
  'escalation-staircase': {
    coreRule: '4-level alignment protocol: Data Alignment ➔ Tradeoff Framing ➔ Context Request ➔ Exec Decision.',
    whyItMatters: 'Provides a non-defensive protocol to resolve cross-functional deadlocks fast.',
    schematic: (
      <div className="flex items-center justify-between text-center font-mono text-[10px] py-0.5">
        <span className="px-1.5 py-1 rounded bg-surface border border-border">1. Data</span>
        <span className="text-ink-muted">→</span>
        <span className="px-1.5 py-1 rounded bg-surface border border-border">2. Tradeoff</span>
        <span className="text-ink-muted">→</span>
        <span className="px-1.5 py-1 rounded bg-surface border border-border">3. Context</span>
        <span className="text-ink-muted">→</span>
        <span className="px-1.5 py-1 rounded bg-primary-soft border border-primary/30 font-bold text-primary">4. Exec</span>
      </div>
    ),
  },
  'strategic-judgment-radar': {
    coreRule: '6-axis craft competency benchmark evaluating real product capability across all key PM domains.',
    whyItMatters: 'Replaces subjective performance reviews with measurable craft progression.',
    schematic: (
      <div className="grid grid-cols-6 gap-1 text-center font-mono text-[9px]">
        {['Strategy', 'Discovery', 'Execution', 'Lead', 'Design', 'Tech'].map((d) => (
          <span key={d} className="p-1 rounded bg-surface border border-border font-semibold text-primary">
            {d}
          </span>
        ))}
      </div>
    ),
  },
  'integrated-practice-wheel': {
    coreRule: 'Synthesis of all 90 lessons into instinctual, real-world product judgment.',
    whyItMatters: 'Knowing exactly which diagnostic framework to trigger in ambiguous scenarios.',
    schematic: (
      <div className="p-1.5 rounded bg-surface border border-border text-center font-mono text-[10px] font-bold text-primary">
        90 Lessons Unified ➔ Instinctual PM Craft
      </div>
    ),
  },
}

export function FrameworksExplorer({ frameworks }: FrameworksExplorerProps) {
  const prefersReducedMotion = useReducedMotion()

  return (
    <div className="relative max-w-5xl mx-auto py-8">
      
      {/* ── Uniform Continuous Center Spine ─────────────────────────────── */}
      <div
        aria-hidden="true"
        className="
          absolute top-4 bottom-4
          left-5 md:left-1/2 -translate-x-1/2
          w-0.5 bg-gradient-to-b from-primary/80 via-border to-primary/80
          pointer-events-none z-0
        "
      />

      {/* ── Chronological Framework Timeline Stream ─────────────────────── */}
      <div className="space-y-10 sm:space-y-12 relative z-10">
        {frameworks.map((fw, index) => {
          const isRight = index % 2 === 0
          const lessonTag = `L${String(fw.lessonNumber).padStart(2, '0')}`
          const details = COMPACT_DATA[fw.slug] || {
            coreRule: fw.definition,
            whyItMatters: fw.keyTakeaway,
            schematic: null,
          }

          return (
            <motion.div
              key={fw.slug}
              id={fw.slug}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="relative flex items-center w-full"
            >
              
              {/* Central Milestone Node Pin (Centered directly on the vertical line) */}
              <div
                className={cn(
                  'absolute z-20 flex items-center justify-center transition-transform duration-200',
                  'left-5 -translate-x-1/2 top-6', // Mobile
                  'md:left-1/2 md:-translate-x-1/2 md:top-1/2 md:-translate-y-1/2', // Desktop
                  'w-9 h-9 rounded-full bg-surface border-2 border-primary shadow-xs ring-4 ring-primary/10',
                )}
              >
                <span className="text-[10px] font-mono font-bold text-primary">
                  {lessonTag}
                </span>
              </div>

              {/* Card Container (Cleanly offset from center spine - zero overlap) */}
              <div
                className={cn(
                  'w-full pl-12 md:pl-0',
                  isRight
                    ? 'md:w-[calc(50%-2rem)] md:ml-auto'
                    : 'md:w-[calc(50%-2rem)] md:mr-auto',
                )}
              >
                <article className="
                  group bg-surface border border-border rounded-xl p-4 sm:p-5 shadow-xs
                  hover:border-primary/50 hover:shadow-[0_8px_24px_-6px_rgba(23,26,23,0.06)] hover:-translate-y-0.5
                  transition-all duration-150 space-y-3 relative
                ">
                  
                  {/* Horizontal Connector Arm to Node on Desktop */}
                  <div
                    aria-hidden="true"
                    className={cn(
                      'hidden md:block absolute top-1/2 -translate-y-1/2 w-8 h-px bg-border',
                      isRight ? '-left-8' : '-right-8',
                    )}
                  />

                  {/* Header Row */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded bg-surface-muted text-foreground">
                      M0{fw.moduleNumber} · {fw.moduleTitle.split('&')[0].trim()}
                    </span>
                    <span className="text-[10px] font-mono font-semibold text-primary bg-primary-soft px-1.5 py-0.5 rounded">
                      Lesson {fw.lessonNumber}
                    </span>
                  </div>

                  {/* Title & Core Rule */}
                  <div className="space-y-1">
                    <h2 className="text-base sm:text-lg font-semibold text-foreground tracking-tight leading-snug">
                      <dfn className="not-italic">{fw.name}</dfn>
                    </h2>
                    <p className="text-xs text-ink-muted leading-relaxed">
                      {details.coreRule}
                    </p>
                  </div>

                  {/* Visual Diagnostic Schematic */}
                  <div className="p-2.5 bg-background border border-border/80 rounded-lg">
                    {details.schematic}
                  </div>

                  {/* Why It Matters Callout */}
                  <div className="p-2 rounded-lg bg-primary-soft/60 border border-primary/20 text-xs">
                    <span className="font-semibold text-primary">Why it matters: </span>
                    <span className="text-foreground">{details.whyItMatters}</span>
                  </div>

                  {/* Bottom Action Link */}
                  <div className="pt-1 flex items-center justify-end">
                    <Link
                      href={`/lessons/${fw.lessonSlug}`}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:text-primary-hover transition-colors"
                    >
                      <span>Open Lesson Guide</span>
                      <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                    </Link>
                  </div>

                </article>
              </div>

            </motion.div>
          )
        })}
      </div>

    </div>
  )
}
