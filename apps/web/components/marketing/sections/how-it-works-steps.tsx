'use client'

/**
 * Learning loop steps with one sticky visual panel (homepage round 2).
 *
 * ## What it does
 *
 * Desktop (lg and up): the numbered steps sit in the left column and one sticky panel
 * on the right shows the visual for the step currently crossing the middle of the
 * viewport. All four visuals are rendered in the panel, stacked in one grid cell, and
 * the inactive ones fade out (opacity plus a small lift, 500ms, ease-out-quint).
 * Phones and tablets: the panel is not shown; each step renders its own visual
 * underneath it, in order, so nothing depends on scroll position.
 *
 * ## Why one IntersectionObserver
 *
 * The observer watches the step `<li>`s with a root margin that collapses the viewport
 * to a thin line just above the middle. Whichever step crosses that line becomes active.
 * No scroll listener, no layout reads, one state update per step change.
 *
 * ## Without JavaScript or motion
 *
 * - No scripting (`@media (scripting: none)`): the panel un-stacks and shows all four
 *   visuals in order, and every step reads as active. The server markup is the
 *   enhanced layout, so hydrating causes no layout shift for everyone else.
 * - Reduced motion: the panel still follows the active step, but swaps instantly
 *   (`motion-reduce:transition-none`). Nothing moves; the content is the same.
 *
 * The visuals are server-rendered and arrive here as props, so they add no client code.
 * They are decorative (`aria-hidden` inside); each step carries its own screen-reader
 * description, and inactive panel visuals are `visibility: hidden`, so assistive
 * technology meets the illustration text once, through the description.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface LoopStepCopy {
  verb: string
  line: string
  /** Screen-reader description of the step's illustration. */
  description: string
}

interface HowItWorksStepsProps {
  steps: LoopStepCopy[]
  /** One visual per step, same order. Rendered on the server. */
  visuals: ReactNode[]
  /** Section heading block, rendered at the top of the steps column. */
  intro?: ReactNode
}

export function HowItWorksSteps({ steps, visuals, intro }: HowItWorksStepsProps) {
  const [active, setActive] = useState(0)
  // Until the observer runs, every step reads as active (also the no-JS state).
  const [enhanced, setEnhanced] = useState(false)
  const listRef = useRef<HTMLOListElement>(null)

  useEffect(() => {
    const list = listRef.current
    if (!list || typeof IntersectionObserver === 'undefined') return

    const items = Array.from(list.querySelectorAll<HTMLElement>('[data-step]'))
    const observer = new IntersectionObserver(
      (entries) => {
        // The first callback fires for every step on observe, so this marks the island live.
        setEnhanced(true)
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const index = Number((entry.target as HTMLElement).dataset.step)
          if (Number.isFinite(index)) setActive(index)
        }
      },
      // A one-line band at 45% of the viewport height.
      { rootMargin: '-45% 0px -55% 0px', threshold: 0 },
    )
    items.forEach((item) => observer.observe(item))
    return () => observer.disconnect()
  }, [])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 lg:gap-12">
      <div className="min-w-0 lg:col-span-5">
        {intro}
        <ol ref={listRef}>
          {steps.map((step, index) => {
            const isActive = !enhanced || index === active
            return (
              <li
                key={step.verb}
                data-step={index}
                className={`relative py-6 transition-colors duration-300 ease-out-quint motion-reduce:transition-none lg:border-l-2 lg:py-7 lg:pl-8 ${
                  isActive ? 'border-primary' : 'border-border'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`block font-display text-sm font-semibold tabular-nums tracking-[0.02em] text-primary transition-colors duration-300 motion-reduce:transition-none ${
                    isActive ? '' : 'lg:text-ink-muted'
                  }`}
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3
                  className={`mt-2 font-sans text-[clamp(1.5rem,2.4vw,1.875rem)] font-semibold leading-tight tracking-[-0.02em] transition-colors duration-300 motion-reduce:transition-none ${
                    isActive ? 'text-foreground' : 'text-foreground lg:text-ink-muted'
                  }`}
                >
                  {step.verb}.
                </h3>
                <p className="mt-2 max-w-[38ch] text-body leading-relaxed text-ink-muted text-pretty">
                  {step.line}
                </p>
                <p className="sr-only">{step.description}</p>

                {/* Phones and tablets: the visual sits under its own step. */}
                <div className="mt-6 lg:hidden">{visuals[index]}</div>
              </li>
            )
          })}
        </ol>
      </div>

      {/* Desktop: one sticky panel that follows the active step. */}
      <div className="hidden lg:col-span-7 lg:block lg:self-start lg:sticky lg:top-28">
        <div className="grid [@media(scripting:none)]:gap-8">
          {visuals.map((visual, index) => {
            const isActive = index === active
            return (
              <div
                key={index}
                className={`[grid-area:1/1] [@media(scripting:none)]:[grid-area:auto] transition-[opacity,translate,visibility] duration-500 ease-out-quint motion-reduce:transition-none ${
                  isActive
                    ? 'visible translate-y-0 opacity-100'
                    : `invisible translate-y-2 opacity-0 [@media(scripting:none)]:visible [@media(scripting:none)]:translate-y-0 [@media(scripting:none)]:opacity-100`
                }`}
              >
                {visual}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
