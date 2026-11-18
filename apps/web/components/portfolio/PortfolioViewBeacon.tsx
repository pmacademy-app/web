'use client'

import { useEffect } from 'react'

/**
 * Counts one view of a public portfolio from the browser.
 *
 * The portfolio page is cached (ISR), so it cannot count views while rendering: a cached
 * render runs once per regeneration, not once per visit, and a write during render would
 * make the page dynamic again. This fires one POST after mount instead. Fire and forget:
 * the route answers 204 whatever happens, and a failure here never affects the page.
 */
export function PortfolioViewBeacon({ username }: { username: string }) {
  useEffect(() => {
    const url = `/api/portfolio/${encodeURIComponent(username)}/view`
    try {
      void fetch(url, { method: 'POST', keepalive: true, credentials: 'omit' }).catch(() => {})
    } catch {
      // A missing fetch (very old browser) only costs the count.
    }
  }, [username])

  return null
}
