'use client'

/**
 * The hero's auto-cycling product workbench (B12-B).
 *
 * This is the part of the hero that is genuinely interactive: three panels that advance
 * every 3.5 s and pause on hover. It keeps its state and its timer, so it stays a client
 * component — but it is now the *only* client component in the hero's right column, and
 * it no longer imports an animation engine.
 *
 * `useReducedMotion` still gates the *timer* — CSS cannot stop an interval, and a
 * reduced-motion user should not have content swapped out from under them. The visual
 * transition is gated separately in CSS via `motion-reduce:`.
 *
 * ## The panel titles are not headings
 *
 * They were `<h4>` in the original hero, sitting directly under the page `<h1>` with no
 * `<h2>` or `<h3>` between them — an axe `heading-order` violation that never surfaced
 * because this panel was not in the server-rendered HTML for the audit to see. Making
 * the section a server component exposed it.
 *
 * The fix is semantic rather than cosmetic: this panel is a *picture of a product*, and
 * the text inside it is simulated UI chrome, not an outline of the page. Screen-reader
 * users should not find "One-Click Checkout Activation Funnel" in the heading list of a
 * marketing page. They are now plain elements with identical styling.
 *
 * ## UI polish pass: visible, controllable cycling
 *
 * The panels used to change every 3.5 s with nothing on screen saying so, and no way to
 * go back to one. There is now a small segmented control with a progress bar under the
 * active segment. The bar is a CSS animation, and its `animationend` is what advances
 * the panel, so the visual and the logic cannot disagree: hovering or focusing the card
 * sets `animation-play-state: paused`, which pauses both at once.
 *
 * When `prefersReducedMotion` is true the bar renders static, `advance` is a no-op, and
 * nothing auto-advances. The segments remain as plain buttons.
 *
 * All three panels now share one grid cell and crossfade. The card takes the height of
 * the tallest panel, so the page below no longer jumps when a shorter panel is shown,
 * which on a phone used to shift the whole viewport every few seconds.
 */

import { useState, type CSSProperties } from 'react'
import { Sparkles, CheckCircle2, Layers, Award, Zap } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { SkillRadar } from '@/components/marketing/product-mockup/skill-radar'

type WorkbenchTab = 'prd' | 'radar' | 'portfolio'

const WORKBENCH_TABS: { id: WorkbenchTab; label: string }[] = [
  { id: 'prd', label: 'Capstone PRD' },
  { id: 'radar', label: 'Skill radar' },
  { id: 'portfolio', label: 'Portfolio' },
]

/** How long each panel stays up before advancing. */
const CYCLE_MS = 3500

const SAMPLE_SKILL_VALUES = {
  discovery: 84,
  strategy: 78,
  design: 70,
  execution: 92,
  growth: 65,
  leadership: 60,
  technical: 75,
}

/** Panels stack in one grid cell; only the active one is visible and reachable. */
function panelClass(active: boolean) {
  return cn(
    '[grid-area:1/1] transition-[opacity,transform,visibility] duration-500 ease-out-quint',
    'motion-reduce:transition-none',
    active
      ? 'opacity-100 translate-y-0 visible'
      : 'opacity-0 translate-y-1.5 invisible pointer-events-none'
  )
}

export function HeroWorkbench() {
  const prefersReducedMotion = useReducedMotion()
  const [activeTab, setActiveTab] = useState<WorkbenchTab>('prd')
  const [isPaused, setIsPaused] = useState(false)

  const advance = () => {
    if (prefersReducedMotion) return
    setActiveTab((current) => {
      const nextIdx = (WORKBENCH_TABS.findIndex((t) => t.id === current) + 1) % WORKBENCH_TABS.length
      return WORKBENCH_TABS[nextIdx].id
    })
  }

  const panelProps = (id: WorkbenchTab) => ({
    'aria-hidden': activeTab !== id,
    inert: activeTab !== id,
  })

  return (
    <div className="lg:col-span-6 w-full animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out-quint delay-200 fill-mode-both motion-reduce:animate-none">
      <div
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocus={() => setIsPaused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsPaused(false)
        }}
        className="relative rounded-2xl border border-border bg-surface shadow-[0_1px_2px_rgba(23,26,23,0.04),0_24px_60px_-20px_rgba(23,26,23,0.18)] overflow-hidden"
      >
        {/* Segmented control. Shows which view is up and how long until the next. */}
        <div
          role="group"
          aria-label="Product preview"
          className="flex items-stretch gap-1 border-b border-border bg-surface-muted/60 p-1.5"
        >
          {WORKBENCH_TABS.map((tab) => {
            const active = tab.id === activeTab
            return (
              <Button
                key={tab.id}
                type="button"
                variant="ghost"
                aria-pressed={active}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'relative flex-1 h-8 overflow-hidden rounded-md px-2 text-xs font-medium',
                  'transition-[background-color,color,box-shadow] duration-200',
                  'focus-visible:ring-2 focus-visible:ring-focus',
                  active
                    ? 'bg-surface text-foreground shadow-xs hover:bg-surface'
                    : 'text-ink-muted hover:text-foreground hover:bg-surface/60'
                )}
              >
                {tab.label}
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-2 bottom-0.5 h-0.5 rounded-full bg-primary/15 overflow-hidden"
                  >
                    {prefersReducedMotion ? (
                      <span className="block h-full w-full bg-primary/70" />
                    ) : (
                      <span
                        key={tab.id}
                        onAnimationEnd={advance}
                        style={{ '--progress-duration': `${CYCLE_MS}ms` } as CSSProperties}
                        className={cn(
                          'block h-full w-full bg-primary/70 animate-progress-fill',
                          isPaused && '[animation-play-state:paused]'
                        )}
                      />
                    )}
                  </span>
                )}
              </Button>
            )
          })}
        </div>

        {/* Panel stack */}
        <div className="p-6 sm:p-7 flex flex-col gap-5">
          <div className="grid">
            {/* TAB 1: PRD Studio */}
            <div className={cn('space-y-4', panelClass(activeTab === 'prd'))} {...panelProps('prd')}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono font-semibold uppercase px-2 py-0.5 rounded bg-primary-soft text-primary">
                    Capstone 01 · Lesson 22
                  </span>
                  <span className="hidden sm:inline text-[11px] text-ink-muted font-mono">PRD-2026-v2.pdf</span>
                </div>
                <span className="text-xs font-semibold text-success flex items-center gap-1">
                  <CheckCircle2 size={13} aria-hidden="true" /> Ready for Portfolio
                </span>
              </div>

              <div className="border border-border rounded-xl p-4 bg-background space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-base font-semibold text-foreground">
                      One-Click Checkout Activation Funnel
                    </div>
                    <p className="text-xs text-ink-muted mt-0.5">
                      Authored by PM Fellow · Target: Q3 Growth Sprint
                    </p>
                  </div>
                  <span className="text-[11px] font-mono bg-primary-soft text-primary px-2 py-0.5 rounded font-semibold shrink-0">
                    +150 XP
                  </span>
                </div>

                <div className="space-y-2 pt-2 border-t border-border/60 text-xs">
                  <div>
                    <span className="font-semibold text-foreground">1. Problem Statement:</span>
                    <p className="text-ink-muted mt-0.5">
                      42% of first-time mobile buyers abandon checkout at the address verification step due to redundant field validations.
                    </p>
                  </div>

                  <div>
                    <span className="font-semibold text-foreground">2. Non-Goals (Scope Boundary):</span>
                    <p className="text-danger mt-0.5 font-medium">
                      ✗ No third-party BNPL provider integration in Phase 1.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1 font-mono text-[11px]">
                    <span className="px-2 py-0.5 rounded bg-surface border border-border text-foreground">
                      North Star: +18% Completion
                    </span>
                    <span className="px-2 py-0.5 rounded bg-surface border border-border text-primary">
                      Latency Target: &lt;1.2s
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted pt-1">
                <span className="flex items-center gap-1.5">
                  <Sparkles size={13} className="text-accent" aria-hidden="true" />
                  Rubric Evaluation: <strong className="text-foreground">Exemplary (96/100)</strong>
                </span>
                <span className="font-mono text-[11px] text-primary">
                  Published to Public Profile
                </span>
              </div>
            </div>

            {/* TAB 2: Skill Radar */}
            <div
              className={cn('flex flex-col items-center justify-center space-y-3', panelClass(activeTab === 'radar'))}
              {...panelProps('radar')}
            >
              <div className="w-full flex items-center justify-between gap-2 text-xs">
                <span className="font-mono font-semibold text-primary uppercase">
                  7-Axis Competency Assessment
                </span>
                <span className="text-ink-muted">Overall Level 5 · Fellow</span>
              </div>

              <div className="py-1">
                <SkillRadar values={SAMPLE_SKILL_VALUES} size={220} showLegend={false} />
              </div>

              <div className="w-full grid grid-cols-3 gap-2 pt-1 text-center font-mono text-xs">
                <div className="p-2 rounded-lg bg-background border border-border">
                  <div className="text-[10px] text-ink-muted uppercase">Execution</div>
                  <div className="font-bold text-primary">92%</div>
                </div>
                <div className="p-2 rounded-lg bg-background border border-border">
                  <div className="text-[10px] text-ink-muted uppercase">Discovery</div>
                  <div className="font-bold text-skill-discovery">84%</div>
                </div>
                <div className="p-2 rounded-lg bg-background border border-border">
                  <div className="text-[10px] text-ink-muted uppercase">Strategy</div>
                  <div className="font-bold text-skill-strategy">78%</div>
                </div>
              </div>
            </div>

            {/* TAB 3: Public Portfolio Profile */}
            <div className={cn('space-y-4', panelClass(activeTab === 'portfolio'))} {...panelProps('portfolio')}>
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-3">
                  <div className="relative w-10 h-10 rounded-full border border-border overflow-hidden flex items-center justify-center shrink-0">
                    <img
                      src="/avatars/aditya.png"
                      alt="Aditya Gangwani"
                      width={40}
                      height={40}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <div className="font-semibold text-sm text-foreground">Aditya Gangwani</div>
                      <div className="group relative inline-flex items-center">
                        <span
                          tabIndex={0}
                          role="img"
                          aria-label="PM Fellow"
                          className="inline-flex items-center justify-center transition-transform duration-200 ease-out-quint group-hover:scale-110 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded-full cursor-pointer"
                        >
                          <img
                            src="/icon-512.png"
                            alt="PM Fellow verified badge"
                            width={16}
                            height={16}
                            className="w-4 h-4 object-contain shrink-0 drop-shadow-xs"
                          />
                        </span>

                        {/* Hover Tooltip */}
                        <span
                          role="tooltip"
                          className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-0.5 rounded bg-foreground text-background text-[11px] font-medium shadow-md whitespace-nowrap z-30 opacity-0 -translate-y-1 transition-all duration-200 ease-out-quint group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0"
                        >
                          PM Fellow
                          <span
                            className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-foreground"
                            aria-hidden="true"
                          />
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-ink-muted">Aspiring Product Manager · Level 6</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-background border border-border space-y-1">
                  <div className="flex items-center gap-1 text-ink-muted">
                    <Award size={13} className="text-accent" aria-hidden="true" />
                    <span>Verified Credentials</span>
                  </div>
                  <div className="font-semibold text-foreground">9 / 9 Capstones Done</div>
                </div>

                <div className="p-3 rounded-lg bg-background border border-border space-y-1">
                  <div className="flex items-center gap-1 text-ink-muted">
                    <Zap size={13} className="text-primary" aria-hidden="true" />
                    <span>Total Experience</span>
                  </div>
                  <div className="font-semibold text-primary font-mono">4,850 XP Earned</div>
                </div>
              </div>

              <div className="p-3 rounded-lg border border-border bg-surface text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">Featured Capstone Project</span>
                  <span className="text-[10px] text-primary font-mono">View Full Doc →</span>
                </div>
                <p className="text-ink-muted text-[11px] leading-relaxed">
                  B2B SaaS Onboarding Journey Map &amp; Friction Ledger (Lesson 15 &amp; Lesson 69).
                </p>
              </div>
            </div>
          </div>

          {/* Footer Strip */}
          <div className="pt-3 border-t border-border flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-muted">
            <span className="flex items-center gap-1.5">
              <Layers size={12} className="text-primary" aria-hidden="true" />
              Real-time learner state synchronization
            </span>
            <span className="font-mono text-primary font-medium">
              No login required to view portfolios
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
