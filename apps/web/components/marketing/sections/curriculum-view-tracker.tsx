'use client'

/**
 * Fires the GA4 curriculum-view event once, on viewport entry (B12-B).
 *
 * `CurriculumSection` used `useInView` from framer-motion for this, which meant an
 * analytics side effect was one of the reasons an animation engine was on the landing
 * page's critical path. The observer is four lines; the engine was 171.7 KB gzipped.
 *
 * Behaviour is deliberately identical: same event, fired once, on entry. B12-B excludes
 * analytics changes, so this moves where the observation happens and nothing else. It
 * renders nothing and marks the grid position with a zero-height sentinel, so it cannot
 * affect layout — CLS was measured at 0 in B12-A and must stay there.
 */

import { useEffect, useRef } from 'react'

import { trackCurriculumView } from '@/lib/analytics'

export function CurriculumViewTracker() {
  const ref = useRef<HTMLSpanElement>(null)
  const fired = useRef(false)

  useEffect(() => {
    const node = ref.current
    if (!node || fired.current) return

    // Without an observer the event simply does not fire, which is the correct failure
    // mode for analytics: under-count rather than fabricate a view that never happened.
    if (typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !fired.current) {
            fired.current = true
            trackCurriculumView()
            observer.disconnect()
          }
        }
      },
      { threshold: 0.15 }
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return <span ref={ref} aria-hidden="true" className="block h-0 w-0" />
}
