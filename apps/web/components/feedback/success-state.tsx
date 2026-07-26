'use client'

import { motion } from 'framer-motion'
import { CheckCircle } from 'lucide-react'
import Link from 'next/link'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

/**
 * Inline success state for the waitlist form.
 * Sprint 3 §9 success copy verbatim.
 */
export function SuccessState() {
  const prefersReducedMotion = useReducedMotion()

  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0, 0, 0.2, 1] }}
      className="flex flex-col items-center text-center gap-4 py-8"
    >
      <div className="w-12 h-12 rounded-full bg-success-bg flex items-center justify-center">
        <CheckCircle size={24} className="text-success" aria-hidden="true" />
      </div>

      <div>
        <h3 className="text-h4 font-semibold text-foreground mb-2">
          You are on the waitlist.
        </h3>
        <p className="text-body-sm text-locked max-w-[400px]">
          We will send preview lessons, beta updates, and launch access when PM Academy opens.
        </p>
      </div>

      <Link
        href="/#curriculum"
        className="
          text-body-sm font-medium text-primary
          hover:underline underline-offset-2
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-xs
          transition-colors duration-[120ms]
        "
      >
        Explore the curriculum
      </Link>
    </motion.div>
  )
}
