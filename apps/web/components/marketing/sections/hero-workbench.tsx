'use client'

/**
 * The hero's auto-cycling product workbench (B12-B).
 *
 * This is the part of the hero that is genuinely interactive: three panels that advance
 * every 3.5 s and pause on hover. It keeps its state and its timer, so it stays a client
 * component — but it is now the *only* client component in the hero's right column, and
 * it no longer imports an animation engine.
 *
 * The panel transition was `AnimatePresence mode="wait"` with a 150 ms fade and 6 px
 * slide. It is now a keyed CSS enter animation: React unmounts the outgoing panel and
 * mounts the incoming one when `activeTab` changes, and `animate-in` replays on the new
 * key. `mode="wait"` sequenced exit-then-enter; at 150 ms the difference is not
 * perceptible, and the crossfade reads the same.
 *
 * `useReducedMotion` still gates the *timer* — CSS cannot stop an interval, and a
 * reduced-motion user should not have content swapped out from under them. The visual
 * transition is gated separately in CSS via `motion-reduce:animate-none`.
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
 */

import { useEffect, useState } from 'react'
import { Sparkles, CheckCircle2, Layers, Award, Zap } from 'lucide-react'

import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { SkillRadar } from '@/components/marketing/product-mockup/skill-radar'

type WorkbenchTab = 'prd' | 'radar' | 'portfolio'

const WORKBENCH_TABS: WorkbenchTab[] = ['prd', 'radar', 'portfolio']

const SAMPLE_SKILL_VALUES = {
  discovery: 84,
  strategy: 78,
  design: 70,
  execution: 92,
  growth: 65,
  leadership: 60,
  technical: 75,
}

/** Shared enter animation for a panel swap. */
const PANEL_ENTER =
  'animate-in fade-in slide-in-from-bottom-1 duration-150 fill-mode-both motion-reduce:animate-none'

export function HeroWorkbench() {
  const prefersReducedMotion = useReducedMotion()
  const [activeTab, setActiveTab] = useState<WorkbenchTab>('prd')
  const [isPaused, setIsPaused] = useState(false)

  // Automatically cycle across all 3 workbench sections every 3.5 seconds
  useEffect(() => {
    if (isPaused || prefersReducedMotion) return

    const timer = setInterval(() => {
      setActiveTab((current) => {
        const nextIdx = (WORKBENCH_TABS.indexOf(current) + 1) % WORKBENCH_TABS.length
        return WORKBENCH_TABS[nextIdx]
      })
    }, 3500)

    return () => clearInterval(timer)
  }, [isPaused, prefersReducedMotion])

  return (
    <div className="lg:col-span-6 w-full animate-in fade-in slide-in-from-bottom-3 duration-[400ms] delay-150 fill-mode-both motion-reduce:animate-none">
      <div
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        className="relative rounded-2xl border border-[#DED8CB] bg-white shadow-[0_20px_50px_-15px_rgba(23,26,23,0.1)] overflow-hidden"
      >
        {/* Dynamic Tab Body */}
        <div className="p-6 sm:p-7 min-h-[380px] flex flex-col justify-between">
          {/* TAB 1: PRD Studio */}
          {activeTab === 'prd' && (
            <div key="prd" className={`space-y-4 ${PANEL_ENTER}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono font-semibold uppercase px-2 py-0.5 rounded bg-[#EAF5EF] text-primary">
                    Capstone 01 · Lesson 22
                  </span>
                  <span className="text-[11px] text-[#70685A] font-mono">PRD-2026-v2.pdf</span>
                </div>
                <span className="text-xs font-semibold text-[#15803D] flex items-center gap-1">
                  <CheckCircle2 size={13} /> Ready for Portfolio
                </span>
              </div>

              <div className="border border-[#DED8CB] rounded-xl p-4 bg-background space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-base font-semibold text-foreground">
                      One-Click Checkout Activation Funnel
                    </div>
                    <p className="text-xs text-[#70685A] mt-0.5">
                      Authored by PM Fellow · Target: Q3 Growth Sprint
                    </p>
                  </div>
                  <span className="text-[11px] font-mono bg-[#EAF5EF] text-primary px-2 py-0.5 rounded font-semibold shrink-0">
                    +150 XP
                  </span>
                </div>

                <div className="space-y-2 pt-2 border-t border-[#DED8CB]/60 text-xs">
                  <div>
                    <span className="font-semibold text-foreground">1. Problem Statement:</span>
                    <p className="text-[#70685A] mt-0.5">
                      42% of first-time mobile buyers abandon checkout at the address verification step due to redundant field validations.
                    </p>
                  </div>

                  <div>
                    <span className="font-semibold text-foreground">2. Non-Goals (Scope Boundary):</span>
                    <p className="text-[#C2410C] mt-0.5 font-medium">
                      ✗ No third-party BNPL provider integration in Phase 1.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-1 font-mono text-[11px]">
                    <span className="px-2 py-0.5 rounded bg-white border border-[#DED8CB] text-foreground">
                      North Star: +18% Completion
                    </span>
                    <span className="px-2 py-0.5 rounded bg-white border border-[#DED8CB] text-primary">
                      Latency Target: &lt;1.2s
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-[#70685A] pt-1">
                <span className="flex items-center gap-1.5">
                  <Sparkles size={13} className="text-accent" />
                  Rubric Evaluation: <strong className="text-foreground">Exemplary (96/100)</strong>
                </span>
                <span className="font-mono text-[11px] text-primary">
                  Published to Public Profile
                </span>
              </div>
            </div>
          )}

          {/* TAB 2: Skill Radar */}
          {activeTab === 'radar' && (
            <div
              key="radar"
              className={`flex flex-col items-center justify-center space-y-3 ${PANEL_ENTER}`}
            >
              <div className="w-full flex items-center justify-between text-xs">
                <span className="font-mono font-semibold text-primary uppercase">
                  7-Axis Competency Assessment
                </span>
                <span className="text-[#70685A]">Overall Level 5 · Fellow</span>
              </div>

              <div className="py-1">
                <SkillRadar
                  values={SAMPLE_SKILL_VALUES}
                  size={240}
                  showLegend={false}
                />
              </div>

              <div className="w-full grid grid-cols-3 gap-2 pt-1 text-center font-mono text-xs">
                <div className="p-2 rounded bg-background border border-[#DED8CB]">
                  <div className="text-[10px] text-[#70685A] uppercase">Execution</div>
                  <div className="font-bold text-primary">92%</div>
                </div>
                <div className="p-2 rounded bg-background border border-[#DED8CB]">
                  <div className="text-[10px] text-[#70685A] uppercase">Discovery</div>
                  <div className="font-bold text-[#0F766E]">84%</div>
                </div>
                <div className="p-2 rounded bg-background border border-[#DED8CB]">
                  <div className="text-[10px] text-[#70685A] uppercase">Strategy</div>
                  <div className="font-bold text-[#1D4ED8]">78%</div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Public Portfolio Profile */}
          {activeTab === 'portfolio' && (
            <div key="portfolio" className={`space-y-4 ${PANEL_ENTER}`}>
              <div className="flex items-center justify-between border-b border-[#DED8CB] pb-3">
                <div className="flex items-center gap-3">
                  <div className="relative w-10 h-10 rounded-full border border-border overflow-hidden flex items-center justify-center shrink-0">
                    <img
                      src="/avatars/aditya.png"
                      alt="Aditya Gangwani"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="font-semibold text-sm text-foreground">Aditya Gangwani</div>
                      <span className="text-[10px] font-semibold bg-[#EAF5EF] text-primary px-2 py-0.5 rounded-md border border-primary/20">
                        Fellow
                      </span>
                    </div>
                    <p className="text-xs text-[#70685A]">Aspiring Product Manager · Level 6</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-background border border-[#DED8CB] space-y-1">
                  <div className="flex items-center gap-1 text-[#70685A]">
                    <Award size={13} className="text-accent" />
                    <span>Verified Credentials</span>
                  </div>
                  <div className="font-semibold text-foreground">9 / 9 Capstones Done</div>
                </div>

                <div className="p-3 rounded-lg bg-background border border-[#DED8CB] space-y-1">
                  <div className="flex items-center gap-1 text-[#70685A]">
                    <Zap size={13} className="text-primary" />
                    <span>Total Experience</span>
                  </div>
                  <div className="font-semibold text-primary font-mono">4,850 XP Earned</div>
                </div>
              </div>

              <div className="p-3 rounded-lg border border-[#DED8CB] bg-white text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">Featured Capstone Project</span>
                  <span className="text-[10px] text-primary font-mono">View Full Doc →</span>
                </div>
                <p className="text-[#70685A] text-[11px] leading-relaxed">
                  B2B SaaS Onboarding Journey Map &amp; Friction Ledger (Lesson 15 &amp; Lesson 69).
                </p>
              </div>
            </div>
          )}

          {/* Footer Strip */}
          <div className="pt-3 border-t border-[#DED8CB] flex items-center justify-between text-[11px] text-[#70685A]">
            <span className="flex items-center gap-1.5">
              <Layers size={12} className="text-primary" />
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
