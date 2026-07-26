/**
 * Framer Motion animation variant constants.
 * Centralised here so every component uses identical timing.
 * Import from here — never define one-off variants in components.
 */

import type { Variants, Transition } from 'framer-motion'
import { DURATION, EASING } from '@/lib/design/tokens'

// ─── Transition presets ───────────────────────────────────────────────────────

export const TRANSITION_FAST: Transition = {
  duration: DURATION.FAST,
  ease: EASING.OUT,
}

export const TRANSITION_STANDARD: Transition = {
  duration: DURATION.STANDARD,
  ease: EASING.OUT,
}

export const TRANSITION_COMPLEX: Transition = {
  duration: DURATION.COMPLEX,
  ease: EASING.OUT,
}

export const TRANSITION_SPRING: Transition = {
  type: 'spring',
  stiffness: 120,
  damping: 20,
}

// ─── Stagger containers ───────────────────────────────────────────────────────

export const STAGGER_CONTAINER: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0,
    },
  },
}

export const STAGGER_FAST_CONTAINER: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.05,
    },
  },
}

// ─── Element variants ─────────────────────────────────────────────────────────

/** Fade up — primary entry animation for text and cards. */
export const FADE_UP: Variants = {
  hidden:  { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: TRANSITION_STANDARD },
}

/** Fade in — for overlays, backgrounds, and non-moving elements. */
export const FADE_IN: Variants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: TRANSITION_STANDARD },
}

/** Slide up — larger panels and mockup clusters. */
export const SLIDE_UP: Variants = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: TRANSITION_COMPLEX },
}

/** Card hover lift — used on interactive cards. */
export const CARD_HOVER = {
  rest:  { y: 0, transition: TRANSITION_STANDARD },
  hover: { y: -2, transition: TRANSITION_STANDARD },
}

/** Chat bubble sequential appear. */
export const BUBBLE_APPEAR: Variants = {
  hidden:  { opacity: 0, y: 8, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: TRANSITION_STANDARD },
}

/**
 * Reduced motion variants — replace all movement with opacity-only.
 * Pass these when useReducedMotion() returns true.
 */
export const REDUCED_FADE_UP: Variants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.01 } },
}

export const REDUCED_STAGGER: Variants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0 } },
}
