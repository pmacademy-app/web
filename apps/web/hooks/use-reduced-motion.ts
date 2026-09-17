'use client'

import { useSyncExternalStore } from 'react'

/**
 * Returns true if the user has requested reduced motion via their OS settings.
 *
 * When true, all animated components should:
 * - Replace movement variants with opacity-only or instant changes
 * - Disable parallax scrolling
 * - Disable SVG path drawing animations
 * - Skip stagger delays (all children appear simultaneously)
 *
 * ## Why this no longer wraps framer-motion (B12-B)
 *
 * This hook used to delegate to framer-motion's `useReducedMotion`. That made a
 * one-line media query the reason seven marketing sections imported an animation
 * engine: B12-A measured 171.7 KB gzipped of framer-motion on the landing page's
 * critical path, and this import was part of what held it there.
 *
 * `matchMedia` answers the same question. `useSyncExternalStore` is used rather than
 * `useState` + `useEffect` so the value is correct on the first client render instead
 * of flashing the animated branch for one frame, and so the server snapshot is
 * explicit: during SSR there is no media query to read, and `false` (animate) matches
 * what framer-motion returned server-side, keeping behaviour identical.
 *
 * Prefer expressing reduced motion in CSS with `motion-reduce:` where the decision is
 * purely visual. This hook is for the cases CSS cannot reach — suppressing a timer,
 * skipping an auto-advancing carousel — where the component must actually branch.
 */

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {}
  }
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia(QUERY).matches
}

/** No media query exists on the server; `false` preserves the previous behaviour. */
function getServerSnapshot(): boolean {
  return false
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
