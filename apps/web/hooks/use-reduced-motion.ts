'use client'

import { useReducedMotion as useFramerReducedMotion } from 'framer-motion'

/**
 * Returns true if the user has requested reduced motion via their OS settings.
 *
 * When true, all animated components should:
 * - Replace movement variants with opacity-only or instant changes
 * - Disable parallax scrolling
 * - Disable SVG path drawing animations
 * - Skip stagger delays (all children appear simultaneously)
 *
 * Wraps Framer Motion's useReducedMotion for a consistent API.
 */
export function useReducedMotion(): boolean {
  return useFramerReducedMotion() ?? false
}
