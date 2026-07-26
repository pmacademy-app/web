'use client'

import { useEffect, useRef } from 'react'
import { trackScroll90Percent } from '@/lib/analytics'

/**
 * Fires the GA4 scroll_90_percent event once when the user
 * has scrolled to 90% of the document height.
 *
 * Mount this hook on the marketing page component.
 * The event fires at most once per page load.
 */
export function useScrollDepth(): void {
  const fired = useRef(false)

  useEffect(() => {
    const handleScroll = () => {
      if (fired.current) return

      const scrollY = window.scrollY
      const windowHeight = window.innerHeight
      const docHeight = document.documentElement.scrollHeight

      const scrollPercent = (scrollY + windowHeight) / docHeight

      if (scrollPercent >= 0.9) {
        fired.current = true
        trackScroll90Percent()
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])
}
