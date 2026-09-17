'use client'

/**
 * The portfolio section's sliding artifact showcase (B12-B).
 *
 * The carousel is genuinely interactive — previous/next controls, a 4 s auto-advance,
 * hover-to-pause — so it stays a client component. What it no longer needs is
 * framer-motion: `AnimatePresence` with directional `slideVariants` was doing a 320 ms
 * slide-and-fade, which is `animate-in slide-in-from-{left,right}` keyed on the active
 * artifact. React remounts on key change and the CSS animation replays, so direction is
 * carried by which class is applied rather than by a `custom` prop threaded through
 * variant functions.
 *
 * The auto-advance still consults `useReducedMotion`, because a timer that swaps content
 * is a motion decision CSS cannot make. The transition itself is gated in CSS.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, CheckCircle2, ArrowRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { ARTIFACTS } from '@/components/marketing/sections/portfolio-artifacts'

/**
 * The floating carousel arrows. A raw HTML button here would trip the B11-C lint rule —
 * and should, since this file is new. The shared primitive carries the focus ring and
 * disabled semantics; the positioning and hover-reveal stay local.
 */
const ARROW_BASE = `
  absolute top-1/2 -translate-y-1/2 z-20
  w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white/95 border-[#DED8CB]
  shadow-[0_4px_16px_rgba(23,26,23,0.1)] text-foreground
  opacity-0 group-hover:opacity-100 transition-all duration-200
  hover:scale-110 active:scale-95 hover:bg-white
  motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100
  focus-visible:opacity-100
`

export function PortfolioShowcase() {
  const prefersReducedMotion = useReducedMotion()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [direction, setDirection] = useState<'left' | 'right'>('left')
  const [isPaused, setIsPaused] = useState(false)

  const activeArtifact = ARTIFACTS[currentIndex]

  const goToNext = useCallback(() => {
    setDirection('left')
    setCurrentIndex((prev) => (prev + 1) % ARTIFACTS.length)
  }, [])

  const goToPrev = useCallback(() => {
    setDirection('right')
    setCurrentIndex((prev) => (prev - 1 + ARTIFACTS.length) % ARTIFACTS.length)
  }, [])

  // Auto slide every 4 seconds when not hovered
  useEffect(() => {
    if (isPaused || prefersReducedMotion) return
    const timer = setInterval(goToNext, 4000)
    return () => clearInterval(timer)
  }, [isPaused, prefersReducedMotion, goToNext])

  const slideEnter =
    direction === 'left'
      ? 'animate-in fade-in slide-in-from-right-8'
      : 'animate-in fade-in slide-in-from-left-8'

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="group relative rounded-2xl border border-[#DED8CB] bg-background p-7 sm:p-9 lg:p-10 shadow-xs overflow-hidden"
    >
      {/* PPT-Style Floating Left Arrow (Appears on Hover) */}
      <Button
        type="button"
        variant="outline"
        onClick={goToPrev}
        aria-label="Previous slide"
        className={`${ARROW_BASE} left-3.5`}
      >
        <ChevronLeft size={20} />
      </Button>

      {/* PPT-Style Floating Right Arrow (Appears on Hover) */}
      <Button
        type="button"
        variant="outline"
        onClick={goToNext}
        aria-label="Next slide"
        className={`${ARROW_BASE} right-3.5`}
      >
        <ChevronRight size={20} />
      </Button>

      {/* Left Sliding Content Body */}
      <div className="min-h-[290px] px-2 sm:px-4">
        <div
          key={activeArtifact.id}
          className={`${slideEnter} duration-300 fill-mode-both ease-out motion-reduce:animate-none grid grid-cols-1 lg:grid-cols-12 gap-8 items-start`}
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

              <h3 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight">
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
                  <div key={bullet} className="flex items-center gap-2.5 text-xs text-foreground">
                    <div className="w-4 h-4 rounded-full bg-[#EAF5EF] text-primary flex items-center justify-center shrink-0">
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
                <span className="font-semibold text-foreground">Live Public Document Excerpt</span>
                <span className="text-[11px] bg-[#EAF5EF] px-2 py-0.5 rounded text-primary font-semibold">
                  Public URL
                </span>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-bold text-foreground">
                  {activeArtifact.previewSnippet.heading}
                </div>
                <p className="text-xs text-[#70685A] leading-relaxed bg-background p-3.5 rounded-lg border border-[#DED8CB]/80 font-mono">
                  &ldquo;{activeArtifact.previewSnippet.body}&rdquo;
                </p>
              </div>

              <div className="pt-2 text-[11px] text-[#70685A] flex items-center justify-between border-t border-[#DED8CB]/60 font-mono">
                <span>{activeArtifact.previewSnippet.meta}</span>
                <span className="text-primary font-semibold">100% Original Craft</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Bottom Share Note */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-5 mt-6 border-t border-[#DED8CB]/60 text-xs text-[#70685A]">
        <span>Public portfolio links can be viewed without a login.</span>

        <Link
          href="/signup"
          className="text-xs font-semibold text-primary hover:text-[#18553E] inline-flex items-center gap-1 shrink-0"
        >
          <span>See a Sample Portfolio</span>
          <ArrowRight size={13} />
        </Link>
      </div>
    </div>
  )
}
