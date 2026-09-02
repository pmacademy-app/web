'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { trackHeroCTAClick } from '@/lib/analytics'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { FADE_UP, STAGGER_CONTAINER } from '@/lib/animation'
import { SkillRadar } from '@/components/marketing/product-mockup/skill-radar'
import {
  ArrowRight,
  Sparkles,
  FileText,
  Target,
  UserCheck,
  CheckCircle2,
  Share2,
  Layers,
  Award,
  Zap,
} from 'lucide-react'

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

export function HeroSection() {
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
    <section
      id="hero"
      aria-labelledby="hero-heading"
      className="relative pt-16 pb-10 lg:pt-24 lg:pb-14 overflow-hidden bg-[#FBFAF6]"
    >
      {/* Precision architectural background grid */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(to_right,#1F6B4E0A_1px,transparent_1px),linear-gradient(to_bottom,#1F6B4E0A_1px,transparent_1px)] bg-[size:3.5rem_3.5rem] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_10%,#000_60%,transparent_100%)] pointer-events-none"
      />

      <div className="relative max-w-[1180px] mx-auto px-5 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">

          {/* ── Left Column: Value Proposition & CTAs ────────────────────────── */}
          <motion.div
            variants={prefersReducedMotion ? undefined : STAGGER_CONTAINER}
            initial={prefersReducedMotion ? false : 'hidden'}
            animate="visible"
            className="lg:col-span-6 flex flex-col gap-6"
          >
            {/* Eyebrow */}
            <motion.div
              variants={prefersReducedMotion ? undefined : FADE_UP}
              className="text-xs font-mono font-semibold uppercase tracking-wider text-[#1F6B4E]"
            >
              FREE, STRUCTURED PM CURRICULUM
            </motion.div>

            {/* Main Headline */}
            <motion.h1
              id="hero-heading"
              variants={prefersReducedMotion ? undefined : FADE_UP}
              className="text-4xl sm:text-5xl lg:text-[3.25rem] font-semibold text-[#171A17] leading-[1.12] tracking-[-0.03em]"
            >
              The structured path from “I want to break into PM” to a{' '}
              <span className="text-[#1F6B4E] underline decoration-[#1F6B4E]/30 decoration-wavy underline-offset-4">
                portfolio that proves you can
              </span>
              .
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              variants={prefersReducedMotion ? undefined : FADE_UP}
              className="text-base sm:text-lg text-[#70685A] leading-relaxed max-w-[540px]"
            >
              Learn product management through 90 structured lessons, applied capstones, and interactive practice — then turn the work you create into a public portfolio you can show. Built for career switchers and anyone building product judgment from scratch.
            </motion.p>

            {/* Action Buttons */}
            <motion.div
              variants={prefersReducedMotion ? undefined : FADE_UP}
              className="flex flex-wrap items-center gap-3.5 pt-1"
            >
              <motion.div
                whileHover={prefersReducedMotion ? undefined : { scale: 1.025 }}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.975 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              >
                <Link
                  href="/signup"
                  onClick={() => trackHeroCTAClick('hero')}
                  className="
                    group relative overflow-hidden inline-flex items-center gap-2.5 px-6 py-3.5
                    bg-[#1F6B4E] text-white font-semibold text-sm rounded-lg
                    shadow-[0_2px_14px_rgba(31,107,78,0.3)]
                    hover:bg-[#18553E] hover:shadow-[0_4px_24px_rgba(31,107,78,0.45)]
                    transition-all duration-200
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F80ED]
                  "
                >
                  {/* Shimmer light sweep on hover */}
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none"
                  />

                  <span className="relative z-10">Start Learning Free</span>
                  <ArrowRight
                    size={16}
                    aria-hidden="true"
                    className="relative z-10 transition-transform duration-200 group-hover:translate-x-1"
                  />
                </Link>
              </motion.div>

              <motion.div
                whileHover={prefersReducedMotion ? undefined : { scale: 1.015 }}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              >
                <Link
                  href="/curriculum"
                  className="
                    group inline-flex items-center gap-2 px-5 py-3.5
                    bg-white text-[#171A17] font-semibold text-sm rounded-lg
                    border border-[#DED8CB] hover:border-[#BDB4A2] hover:bg-[#F2EFE7]
                    transition-all duration-150
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F80ED]
                  "
                >
                  <span>Explore Curriculum</span>
                  <span className="transition-transform duration-200 group-hover:translate-x-1 text-[#70685A] group-hover:text-[#171A17]">
                    →
                  </span>
                </Link>
              </motion.div>
            </motion.div>

            {/* Key Value Anchors */}
            <motion.div
              variants={prefersReducedMotion ? undefined : FADE_UP}
              className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-[#DED8CB]/80"
            >
              <div className="space-y-0.5">
                <div className="text-sm font-bold text-[#171A17] font-mono">90 Lessons</div>
                <div className="text-[11px] text-[#70685A]">9 complete modules</div>
              </div>
              <div className="space-y-0.5">
                <div className="text-sm font-bold text-[#171A17] font-mono">9 Capstones</div>
                <div className="text-[11px] text-[#70685A]">Real PM deliverables</div>
              </div>
              <div className="space-y-0.5">
                <div className="text-sm font-bold text-[#171A17] font-mono">7 Competencies</div>
                <div className="text-[11px] text-[#70685A]">Skill progress tracking</div>
              </div>
              <div className="space-y-0.5">
                <div className="text-sm font-bold text-[#1F6B4E] font-mono">₹0 Tuition</div>
                <div className="text-[11px] text-[#70685A]">Free, permanently</div>
              </div>
            </motion.div>
          </motion.div>

          {/* ── Right Column: Interactive Product Workbench ─────────────────── */}
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15, ease: [0, 0, 0.2, 1] }}
            className="lg:col-span-6 w-full"
          >
            <div
              onMouseEnter={() => setIsPaused(true)}
              onMouseLeave={() => setIsPaused(false)}
              className="relative rounded-2xl border border-[#DED8CB] bg-white shadow-[0_20px_50px_-15px_rgba(23,26,23,0.1)] overflow-hidden"
            >
              {/* Dynamic Tab Body */}
              <div className="p-6 sm:p-7 min-h-[380px] flex flex-col justify-between">
                <AnimatePresence mode="wait">
                  {/* TAB 1: PRD Studio */}
                  {activeTab === 'prd' && (
                    <motion.div
                      key="prd"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono font-semibold uppercase px-2 py-0.5 rounded bg-[#EAF5EF] text-[#1F6B4E]">
                            Capstone 04 · Execution
                          </span>
                          <span className="text-[11px] text-[#70685A] font-mono">PRD-2026-v2.pdf</span>
                        </div>
                        <span className="text-xs font-semibold text-[#15803D] flex items-center gap-1">
                          <CheckCircle2 size={13} /> Ready for Portfolio
                        </span>
                      </div>

                      <div className="border border-[#DED8CB] rounded-xl p-4 bg-[#FBFAF6] space-y-3">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h4 className="text-base font-semibold text-[#171A17]">
                              One-Click Checkout Activation Funnel
                            </h4>
                            <p className="text-xs text-[#70685A] mt-0.5">
                              Authored by PM Fellow · Target: Q3 Growth Sprint
                            </p>
                          </div>
                          <span className="text-[11px] font-mono bg-[#EAF5EF] text-[#1F6B4E] px-2 py-0.5 rounded font-semibold shrink-0">
                            +150 XP
                          </span>
                        </div>

                        <div className="space-y-2 pt-2 border-t border-[#DED8CB]/60 text-xs">
                          <div>
                            <span className="font-semibold text-[#171A17]">1. Problem Statement:</span>
                            <p className="text-[#70685A] mt-0.5">
                              42% of first-time mobile buyers abandon checkout at the address verification step due to redundant field validations.
                            </p>
                          </div>

                          <div>
                            <span className="font-semibold text-[#171A17]">2. Non-Goals (Scope Boundary):</span>
                            <p className="text-[#C2410C] mt-0.5 font-medium">
                              ✗ No third-party BNPL provider integration in Phase 1.
                            </p>
                          </div>

                          <div className="flex items-center gap-2 pt-1 font-mono text-[11px]">
                            <span className="px-2 py-0.5 rounded bg-white border border-[#DED8CB] text-[#171A17]">
                              North Star: +18% Completion
                            </span>
                            <span className="px-2 py-0.5 rounded bg-white border border-[#DED8CB] text-[#1F6B4E]">
                              Latency Target: &lt;1.2s
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-[#70685A] pt-1">
                        <span className="flex items-center gap-1.5">
                          <Sparkles size={13} className="text-[#D98B24]" />
                          Rubric Evaluation: <strong className="text-[#171A17]">Exemplary (96/100)</strong>
                        </span>
                        <span className="font-mono text-[11px] text-[#1F6B4E]">
                          Published to Public Profile
                        </span>
                      </div>
                    </motion.div>
                  )}

                  {/* TAB 2: Skill Radar */}
                  {activeTab === 'radar' && (
                    <motion.div
                      key="radar"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.15 }}
                      className="flex flex-col items-center justify-center space-y-3"
                    >
                      <div className="w-full flex items-center justify-between text-xs">
                        <span className="font-mono font-semibold text-[#1F6B4E] uppercase">
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
                        <div className="p-2 rounded bg-[#FBFAF6] border border-[#DED8CB]">
                          <div className="text-[10px] text-[#70685A] uppercase">Execution</div>
                          <div className="font-bold text-[#1F6B4E]">92%</div>
                        </div>
                        <div className="p-2 rounded bg-[#FBFAF6] border border-[#DED8CB]">
                          <div className="text-[10px] text-[#70685A] uppercase">Discovery</div>
                          <div className="font-bold text-[#0F766E]">84%</div>
                        </div>
                        <div className="p-2 rounded bg-[#FBFAF6] border border-[#DED8CB]">
                          <div className="text-[10px] text-[#70685A] uppercase">Strategy</div>
                          <div className="font-bold text-[#1D4ED8]">78%</div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* TAB 3: Public Portfolio Profile */}
                  {activeTab === 'portfolio' && (
                    <motion.div
                      key="portfolio"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center justify-between border-b border-[#DED8CB] pb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-[#1F6B4E] text-white flex items-center justify-center font-bold text-sm">
                            AG
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold text-sm text-[#171A17]">Aditya Gangwani</h4>
                              <span className="text-[10px] font-semibold bg-[#EAF5EF] text-[#1F6B4E] px-2 py-0.5 rounded-full border border-[#1F6B4E]/20">
                                Fellow
                              </span>
                            </div>
                            <p className="text-xs text-[#70685A]">Aspiring Product Manager · Level 6</p>
                          </div>
                        </div>


                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="p-3 rounded-lg bg-[#FBFAF6] border border-[#DED8CB] space-y-1">
                          <div className="flex items-center gap-1 text-[#70685A]">
                            <Award size={13} className="text-[#D98B24]" />
                            <span>Verified Credentials</span>
                          </div>
                          <div className="font-semibold text-[#171A17]">9 / 9 Capstones Done</div>
                        </div>

                        <div className="p-3 rounded-lg bg-[#FBFAF6] border border-[#DED8CB] space-y-1">
                          <div className="flex items-center gap-1 text-[#70685A]">
                            <Zap size={13} className="text-[#1F6B4E]" />
                            <span>Total Experience</span>
                          </div>
                          <div className="font-semibold text-[#1F6B4E] font-mono">4,850 XP Earned</div>
                        </div>
                      </div>

                      <div className="p-3 rounded-lg border border-[#DED8CB] bg-white text-xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-[#171A17]">Featured Capstone Project</span>
                          <span className="text-[10px] text-[#1F6B4E] font-mono">View Full Doc →</span>
                        </div>
                        <p className="text-[#70685A] text-[11px] leading-relaxed">
                          B2B SaaS Onboarding Teardown & Activation Friction Matrix (Notion vs Linear).
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Footer Strip */}
                <div className="pt-3 border-t border-[#DED8CB] flex items-center justify-between text-[11px] text-[#70685A]">
                  <span className="flex items-center gap-1.5">
                    <Layers size={12} className="text-[#1F6B4E]" />
                    Real-time learner state synchronization
                  </span>
                  <span className="font-mono text-[#1F6B4E] font-medium">
                    No login required to view portfolios
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
