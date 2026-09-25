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
 * The auto-advance still consults `useReducedMotion`, because advancing content is a
 * motion decision CSS cannot make. The transition itself is gated in CSS.
 *
 * ## UI polish pass
 *
 * - The previous/next arrows were `opacity-0` until hover, which meant touch users never
 *   saw them, and on a phone they sat on top of the slide text. The controls now live in
 *   the card's footer bar, always visible, with one indicator per artifact.
 * - The active indicator fills over the slide's duration and its `animationend` is what
 *   advances the slide (the same pattern as the hero workbench), so hover or keyboard
 *   focus pauses the timer and the indicator together.
 * - Announcements are `polite` only while the carousel is paused, following the APG
 *   carousel pattern: a screen reader is not interrupted every four seconds, but a user
 *   stepping through it manually hears each slide.
 * - Colours come from tokens, so the card follows the theme.
 */

import { useCallback, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, CheckCircle2, ArrowRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { ARTIFACTS } from '@/components/marketing/sections/portfolio-artifacts'

/** How long each artifact stays up before advancing. */
const SLIDE_MS = 4000

/** The shared primitive carries the focus ring and button semantics (B11-C). */
const ARROW = `
  w-9 h-9 rounded-full border border-border bg-surface text-foreground shadow-xs
  hover:bg-surface-muted hover:border-border-strong
  active:scale-95 transition-[background-color,border-color,transform] duration-200
  motion-reduce:transition-colors motion-reduce:active:scale-100
  focus-visible:ring-2 focus-visible:ring-focus
`

export function PortfolioShowcase() {
  const prefersReducedMotion = useReducedMotion()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [direction, setDirection] = useState<'left' | 'right'>('left')
  const [isPaused, setIsPaused] = useState(false)

  const activeArtifact = ARTIFACTS[currentIndex]

  const goTo = useCallback((index: number, dir: 'left' | 'right') => {
    setDirection(dir)
    setCurrentIndex((index + ARTIFACTS.length) % ARTIFACTS.length)
  }, [])

  const goToNext = () => goTo(currentIndex + 1, 'left')
  const goToPrev = () => goTo(currentIndex - 1, 'right')

  const slideEnter =
    direction === 'left'
      ? 'animate-in fade-in slide-in-from-right-6'
      : 'animate-in fade-in slide-in-from-left-6'

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Example capstone artifacts"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsPaused(false)
      }}
      className="relative rounded-2xl border border-border bg-background p-6 sm:p-9 lg:p-10 shadow-xs overflow-hidden"
    >
      {/* Sliding Content Body */}
      <div
        className="min-h-[290px]"
        aria-live={isPaused || prefersReducedMotion ? 'polite' : 'off'}
        aria-atomic="true"
      >
        <div
          key={activeArtifact.id}
          role="group"
          aria-roledescription="slide"
          aria-label={`${currentIndex + 1} of ${ARTIFACTS.length}: ${activeArtifact.title}`}
          className={`${slideEnter} duration-500 ease-out-quint fill-mode-both motion-reduce:animate-none grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start`}
        >
          {/* Left Side: Deliverable Title & Verified Criteria */}
          <div className="lg:col-span-6 space-y-5">
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="text-[11px] font-mono font-semibold uppercase px-2.5 py-0.5 rounded-md"
                  style={{
                    backgroundColor: `${activeArtifact.color}15`,
                    color: activeArtifact.color,
                  }}
                >
                  {activeArtifact.type}
                </span>
                <span className="text-xs text-ink-muted font-mono">
                  {activeArtifact.module}
                </span>
              </div>

              <h3 className="font-display text-2xl sm:text-3xl font-semibold text-foreground tracking-[-0.02em] text-balance">
                {activeArtifact.title}
              </h3>

              <p className="text-sm text-ink-muted leading-relaxed">
                {activeArtifact.summary}
              </p>
            </div>

            {/* Rubric Criteria Checklist */}
            <div className="space-y-2.5 pt-4 border-t border-border/70">
              <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-ink-muted">
                Verified Capstone Criteria
              </div>
              <ul className="space-y-2">
                {activeArtifact.deliverableBullets.map((bullet) => (
                  <li key={bullet} className="flex items-center gap-2.5 text-xs text-foreground">
                    <span className="w-4 h-4 rounded-full bg-primary-soft text-primary flex items-center justify-center shrink-0">
                      <CheckCircle2 size={12} aria-hidden="true" />
                    </span>
                    <span className="font-medium">{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Right Side: Artifact Excerpt Simulator */}
          <div className="lg:col-span-6">
            <div className="bg-surface border border-border rounded-xl p-5 sm:p-6 space-y-3.5 shadow-[0_16px_40px_-20px_rgba(23,26,23,0.18)]">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-border/70 text-xs font-mono text-ink-muted">
                <span className="font-semibold text-foreground">Live Public Document Excerpt</span>
                <span className="text-[11px] bg-primary-soft px-2 py-0.5 rounded text-primary font-semibold shrink-0">
                  Public URL
                </span>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-bold text-foreground">
                  {activeArtifact.previewSnippet.heading}
                </div>
                <p className="text-xs text-ink-muted leading-relaxed bg-background p-3.5 rounded-lg border border-border/80 font-mono">
                  &ldquo;{activeArtifact.previewSnippet.body}&rdquo;
                </p>
              </div>

              <div className="pt-2 text-[11px] text-ink-muted flex items-center justify-between gap-2 border-t border-border/60 font-mono">
                <span>{activeArtifact.previewSnippet.meta}</span>
                <span className="text-primary font-semibold shrink-0">100% Original Craft</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer: share note on one side, carousel controls on the other */}
      <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-4 pt-5 mt-7 border-t border-border/70">
        <div className="flex flex-col sm:flex-row sm:items-center gap-x-4 gap-y-1.5 text-xs text-ink-muted">
          <span>Public portfolio links can be viewed without a login.</span>
          <Link
            href="/signup"
            className="group text-xs font-semibold text-primary hover:text-primary-hover inline-flex items-center gap-1 shrink-0 rounded-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <span>See a Sample Portfolio</span>
            <ArrowRight
              size={13}
              aria-hidden="true"
              className="transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
            />
          </Link>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          {/* One indicator per artifact. The hit area is 24px for touch; the visual is
              the small bar inside it. */}
          <div className="flex items-center" role="group" aria-label="Choose artifact">
            {ARTIFACTS.map((artifact, index) => {
              const active = index === currentIndex
              return (
                <Button
                  key={artifact.id}
                  type="button"
                  variant="ghost"
                  aria-label={`Show ${artifact.title}`}
                  aria-pressed={active}
                  onClick={() => goTo(index, index < currentIndex ? 'right' : 'left')}
                  className="h-6 min-w-6 px-1 rounded-full hover:bg-transparent focus-visible:ring-2 focus-visible:ring-focus"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'relative block h-1.5 rounded-full overflow-hidden transition-[width,background-color] duration-300 ease-out-quint motion-reduce:transition-none',
                      active ? 'w-6 bg-primary/20' : 'w-1.5 bg-border-strong hover:bg-ink-muted'
                    )}
                  >
                    {active &&
                      (prefersReducedMotion ? (
                        <span className="absolute inset-0 bg-primary" />
                      ) : (
                        <span
                          key={artifact.id}
                          onAnimationEnd={goToNext}
                          style={{ '--progress-duration': `${SLIDE_MS}ms` } as CSSProperties}
                          className={cn(
                            'absolute inset-0 bg-primary animate-progress-fill',
                            isPaused && '[animation-play-state:paused]'
                          )}
                        />
                      ))}
                  </span>
                </Button>
              )
            })}
          </div>

          <div className="flex items-center gap-1.5">
            <Button type="button" variant="outline" size="icon" onClick={goToPrev} aria-label="Previous artifact" className={ARROW}>
              <ChevronLeft size={16} aria-hidden="true" />
            </Button>
            <Button type="button" variant="outline" size="icon" onClick={goToNext} aria-label="Next artifact" className={ARROW}>
              <ChevronRight size={16} aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
