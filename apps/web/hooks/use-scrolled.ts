'use client'

import { useState, useEffect } from 'react'

/**
 * Returns true when the page has been scrolled past the given threshold.
 * Used by Navbar to switch between transparent and filled states.
 *
 * @param threshold - Scroll distance in pixels (default: 16)
 */
export function useScrolled(threshold = 16): boolean {
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > threshold)
    }

    // Check immediately on mount
    handleScroll()

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [threshold])

  return isScrolled
}
