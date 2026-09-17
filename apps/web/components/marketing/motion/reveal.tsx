'use client'

/**
 * Scroll reveal wrapper (B12-B).
 *
 * ## Why this exists
 *
 * B12-A measured the landing page shipping 529.1 KB of gzipped JavaScript against a
 * 345 KB baseline every other route shares. 171.7 KB of that 184 KB excess was a
 * single chunk carrying the framer-motion runtime, and the entire reason it was on
 * the critical path was decorative entry animation: `motion.div` with `FADE_UP`,
 * `STAGGER_CONTAINER` and `useInView`, repeated across seven sections.
 *
 * Every one of those wrappers did the same two things — fade in and slide up when
 * the element enters the viewport, once. That is an IntersectionObserver and a CSS
 * transition. It does not need an animation engine, and paying 683 KB of parse and
 * execute for it on a 4× throttled phone cost 1,100 ms of blocking time.
 *
 * ## The RSC property this depends on
 *
 * This component is a client component, but `children` is passed *from a server
 * component*. React renders those children on the server and hands this wrapper the
 * already-rendered element tree — so wrapping a section body in `<Reveal>` does not
 * pull the body into the client bundle. That is what lets the section bodies stay
 * server components while keeping the animation.
 *
 * ## Reduced motion
 *
 * Handled in CSS rather than JavaScript. `motion-reduce:` disables the transition and
 * pins the element to its final state, so a reduced-motion user sees content appear
 * with no movement and no transition — and gets there without this component needing
 * to read a media query or re-render.
 *
 * ## Why it does not hide content above the fold
 *
 * An element at `opacity: 0` is not eligible to be the Largest Contentful Paint. Using
 * this wrapper on hero copy would move LCP to whenever the observer fires, which is
 * the opposite of the point. Above-the-fold entry animation is pure CSS on mount
 * (`animate-in` from tw-animate-css) with no JavaScript gate at all; this wrapper is
 * for below-the-fold sections only.
 */

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface RevealProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Stagger offset in milliseconds. Mirrors the old `staggerChildren: 0.08`. */
  delay?: number
  /** Fraction of the element that must be visible before it reveals. */
  amount?: number
  children: React.ReactNode
}

export function Reveal({
  delay = 0,
  amount = 0.15,
  className,
  children,
  style,
  ...props
}: RevealProps) {
  const [revealed, setRevealed] = React.useState(false)

  // A ref callback rather than an effect. The observer is set up the moment the node is
  // attached and torn down via the cleanup React 19 accepts from a ref callback, which
  // keeps the subscription tied to the node's lifetime rather than to a render pass —
  // and means the no-observer fallback below is not a synchronous setState inside an
  // effect body, which cascades renders.
  const attach = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return

      // No observer (jsdom, a very old browser): show the content rather than leaving
      // it permanently transparent. Failing open is the only acceptable default for
      // something whose whole job is to reveal copy.
      if (typeof IntersectionObserver === 'undefined') {
        setRevealed(true)
        return
      }

      // `isIntersecting` is true on the first callback for anything already in view —
      // a short page, a deep link, a restored scroll position — so this covers both
      // "scrolled to" and "already there" without a separate measurement.
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              setRevealed(true)
              observer.disconnect()
            }
          }
        },
        { threshold: amount, rootMargin: '0px 0px -5% 0px' }
      )

      observer.observe(node)
      return () => observer.disconnect()
    },
    [amount]
  )

  return (
    <div
      ref={attach}
      data-slot="reveal"
      data-revealed={revealed ? 'true' : 'false'}
      style={{ transitionDelay: delay ? `${delay}ms` : undefined, ...style }}
      className={cn(
        'transition-[opacity,transform] duration-500 ease-out will-change-[opacity,transform]',
        revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3',
        'motion-reduce:transition-none motion-reduce:translate-y-0',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
