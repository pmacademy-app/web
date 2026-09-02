'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  ArrowRight,
  UserCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ArtifactCard {
  id: string
  title: string
  type: string
  module: string
  badge: string
  color: string
  summary: string
  deliverableBullets: string[]
  previewSnippet: {
    heading: string
    body: string
    meta: string
  }
}

const ARTIFACTS: ArtifactCard[] = [
  {
    id: 'prd',
    title: 'One-Click Checkout Activation Funnel PRD',
    type: 'PRD Spec',
    module: 'Module 03 · Execution',
    badge: 'Capstone 01',
    color: '#1F6B4E',
    summary: 'A structured PRD covering the solution-free problem statement, non-goals, user stories, acceptance criteria, and success metrics.',
    deliverableBullets: [
      'Solution-free problem statement',
      'Explicit non-goals & scope bounds',
      'Given/When/Then acceptance criteria',
      'Measurable conversion metrics',
    ],
    previewSnippet: {
      heading: 'Problem Statement & Non-Goals',
      body: '42% of mobile shoppers drop off during address entry due to redundant validation loops. Non-goal: No third-party BNPL integration in Phase 1.',
      meta: 'Module 3 · Lesson 22 (Product Requirements Document)',
    },
  },
  {
    id: 'roadmap',
    title: 'Outcome-Based Product Roadmap & RICE Model',
    type: 'Strategic Roadmap',
    module: 'Module 04 · Execution',
    badge: 'Capstone 02',
    color: '#D97706',
    summary: 'A prioritization and sequencing exercise applying the RICE framework and Now/Next/Later horizons to sequence engineering capacity.',
    deliverableBullets: [
      'RICE quantitative scoring',
      'Now / Next / Later horizons',
      'Explicit strategic trade-offs',
      'Confidence-weighted estimates',
    ],
    previewSnippet: {
      heading: 'RICE Score & Horizon Allocation',
      body: 'Score = (Reach 12k × Impact 3 × Confidence 80%) / Effort 2 sprints = 14.4. Allocated to "Now" horizon for Q3 activation.',
      meta: 'Module 4 · Lesson 35 (Roadmapping & Release Planning)',
    },
  },
  {
    id: 'casestudy',
    title: 'Mobile Shopper Discovery & Journey Synthesis',
    type: 'Discovery Case Study',
    module: 'Module 02 · Discovery',
    badge: 'Capstone 03',
    color: '#0284C7',
    summary: 'A research-led discovery teardown synthesizing customer interviews, journey mapping, and assumption testing into a delivery-ready opportunity.',
    deliverableBullets: [
      'Interview evidence synthesis',
      'User journey drop-off mapping',
      'Opportunity Solution Tree',
      'Validated problem framing',
    ],
    previewSnippet: {
      heading: 'Research Synthesis & Opportunity Framing',
      body: 'Qualitative synthesis across N=32 customer interviews revealed friction was caused by postal code pre-validation rather than payment security concerns.',
      meta: 'Module 2 · Lesson 20 (Product Discovery Process)',
    },
  },
  {
    id: 'strategy',
    title: 'Marketplace Platform Strategy & Moat Analysis',
    type: 'Executive Strategy Memo',
    module: 'Module 08 · Leadership',
    badge: 'Capstone 04',
    color: '#7C3AED',
    summary: 'An executive decision memo using Rumelt’s Strategy Kernel and the Leverage Stack to evaluate two-sided marketplace defensibility and pricing.',
    deliverableBullets: [
      'Strategy Kernel (Diagnosis & Policy)',
      'Two-sided liquidity analysis',
      'Moat durability assessment',
      'Enterprise concession matrix',
    ],
    previewSnippet: {
      heading: 'Diagnosis & Guiding Policy',
      body: 'Diagnosis: Multi-homing suppliers erode take-rates. Guiding Policy: Lock in supplier workflows with proprietary tooling before opening the buyer marketplace.',
      meta: 'Module 8 · Lesson 75 (Competitive Strategy and Moats)',
    },
  },
]

export function PortfolioSection() {
  const prefersReducedMotion = useReducedMotion()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [direction, setDirection] = useState<'left' | 'right'>('left')
  const [isPaused, setIsPaused] = useState(false)

  const activeArtifact = ARTIFACTS[currentIndex]

  const goToNext = () => {
    setDirection('left')
    setCurrentIndex((prev) => (prev + 1) % ARTIFACTS.length)
  }

  const goToPrev = () => {
    setDirection('right')
    setCurrentIndex((prev) => (prev - 1 + ARTIFACTS.length) % ARTIFACTS.length)
  }

  // Auto slide every 4 seconds when not hovered
  useEffect(() => {
    if (isPaused || prefersReducedMotion) return
    const timer = setInterval(() => {
      goToNext()
    }, 4000)
    return () => clearInterval(timer)
  }, [isPaused, prefersReducedMotion])

  const slideVariants = {
    enter: (dir: 'left' | 'right') => ({
      x: dir === 'left' ? 45 : -45,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: 'left' | 'right') => ({
      x: dir === 'left' ? -45 : 45,
      opacity: 0,
    }),
  }

  return (
    <section
      id="portfolio"
      aria-labelledby="portfolio-heading"
      className="py-20 lg:py-28 bg-white border-t border-[#DED8CB]/80 scroll-mt-24 lg:scroll-mt-28"
    >
      <div className="max-w-[1120px] mx-auto px-5 lg:px-8 space-y-10">

        {/* ── Section Header ────────────────────────────────────────────── */}
        <div className="max-w-3xl space-y-3">
          <div className="text-xs font-mono font-semibold uppercase tracking-wider text-[#1F6B4E]">
            PROOF OF WORK
          </div>
          <h2
            id="portfolio-heading"
            className="text-3xl sm:text-4xl lg:text-[2.75rem] font-semibold text-[#171A17] tracking-[-0.03em] leading-tight"
          >
            Finish with work you can show, not just a course you completed.
          </h2>
          <p className="text-base sm:text-lg text-[#70685A] leading-relaxed">
            Every applied capstone becomes a tangible product artifact — from PRDs and opportunity briefs to roadmaps, metrics work, and strategy case studies. Publish your strongest work to a public portfolio and give people something concrete to see.
          </p>
        </div>

        {/* ── Single Sliding PPT-Style Showcase Card ────────────────────── */}
        <div
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
          className="group relative rounded-2xl border border-[#DED8CB] bg-[#FBFAF6] p-7 sm:p-9 lg:p-10 shadow-xs overflow-hidden"
        >

          {/* PPT-Style Floating Left Arrow (Appears on Hover) */}
          <button
            type="button"
            onClick={goToPrev}
            aria-label="Previous slide"
            className="
              absolute left-3.5 top-1/2 -translate-y-1/2 z-20
              w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white/95 border border-[#DED8CB]
              shadow-[0_4px_16px_rgba(23,26,23,0.1)] flex items-center justify-center text-[#171A17]
              opacity-0 group-hover:opacity-100 transition-all duration-200
              hover:scale-110 active:scale-95 hover:bg-white
              focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus
            "
          >
            <ChevronLeft size={20} />
          </button>

          {/* PPT-Style Floating Right Arrow (Appears on Hover) */}
          <button
            type="button"
            onClick={goToNext}
            aria-label="Next slide"
            className="
              absolute right-3.5 top-1/2 -translate-y-1/2 z-20
              w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white/95 border border-[#DED8CB]
              shadow-[0_4px_16px_rgba(23,26,23,0.1)] flex items-center justify-center text-[#171A17]
              opacity-0 group-hover:opacity-100 transition-all duration-200
              hover:scale-110 active:scale-95 hover:bg-white
              focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus
            "
          >
            <ChevronRight size={20} />
          </button>

          {/* Left Sliding Content Body */}
          <div className="min-h-[290px] px-2 sm:px-4">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={activeArtifact.id}
                custom={direction}
                variants={prefersReducedMotion ? undefined : slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{
                  duration: prefersReducedMotion ? 0 : 0.32,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
              >

                {/* Left Side: Deliverable Title & Verified Criteria */}
                <div className="lg:col-span-6 space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[11px] font-mono font-semibold uppercase px-2.5 py-0.5 rounded"
                        style={{
                          backgroundColor: `${activeArtifact.color}15`,
                          color: activeArtifact.color,
                        }}
                      >
                        {activeArtifact.type}
                      </span>
                      <span className="text-xs text-[#70685A] font-mono">
                        {activeArtifact.module}
                      </span>
                    </div>

                    <h3 className="text-2xl sm:text-3xl font-semibold text-[#171A17] tracking-tight">
                      {activeArtifact.title}
                    </h3>

                    <p className="text-xs sm:text-sm text-[#70685A] leading-relaxed pt-0.5">
                      {activeArtifact.summary}
                    </p>
                  </div>

                  {/* Rubric Criteria Checklist */}
                  <div className="space-y-2.5 pt-3 border-t border-[#DED8CB]/70">
                    <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[#70685A]">
                      Verified Capstone Criteria
                    </div>
                    <div className="space-y-2">
                      {activeArtifact.deliverableBullets.map((bullet) => (
                        <div key={bullet} className="flex items-center gap-2.5 text-xs text-[#171A17]">
                          <div className="w-4 h-4 rounded-full bg-[#EAF5EF] text-[#1F6B4E] flex items-center justify-center shrink-0">
                            <CheckCircle2 size={12} />
                          </div>
                          <span className="font-medium">{bullet}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Side: Artifact Excerpt Simulator */}
                <div className="lg:col-span-6">
                  <div className="bg-white border border-[#DED8CB] rounded-xl p-5 sm:p-6 space-y-3.5 shadow-2xs">
                    <div className="flex items-center justify-between pb-3 border-b border-[#DED8CB]/70 text-xs font-mono text-[#70685A]">
                      <span className="font-semibold text-[#171A17]">Live Public Document Excerpt</span>
                      <span className="text-[11px] bg-[#EAF5EF] px-2 py-0.5 rounded text-[#1F6B4E] font-semibold">
                        Public URL
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-bold text-[#171A17]">
                        {activeArtifact.previewSnippet.heading}
                      </div>
                      <p className="text-xs text-[#70685A] leading-relaxed bg-[#FBFAF6] p-3.5 rounded-lg border border-[#DED8CB]/80 font-mono">
                        &ldquo;{activeArtifact.previewSnippet.body}&rdquo;
                      </p>
                    </div>

                    <div className="pt-2 text-[11px] text-[#70685A] flex items-center justify-between border-t border-[#DED8CB]/60 font-mono">
                      <span>{activeArtifact.previewSnippet.meta}</span>
                      <span className="text-[#1F6B4E] font-semibold">100% Original Craft</span>
                    </div>
                  </div>
                </div>

              </motion.div>
            </AnimatePresence>
          </div>

          {/* Bottom Share Note */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-5 mt-6 border-t border-[#DED8CB]/60 text-xs text-[#70685A]">
            <span>Public portfolio links can be viewed without a login.</span>

            <Link
              href="/signup"
              className="text-xs font-semibold text-[#1F6B4E] hover:text-[#18553E] inline-flex items-center gap-1 shrink-0"
            >
              <span>See a Sample Portfolio</span>
              <ArrowRight size={13} />
            </Link>
          </div>

        </div>

      </div>
    </section>
  )
}
