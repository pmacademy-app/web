'use client'

/**
 * Whether the visitor is signed in, for swapping marketing CTAs to "Go to dashboard".
 *
 * The marketing pages are ISR, and the auth cookies are httpOnly, so the server render
 * cannot know. This asks `GET /api/auth/session` once after mount (always 200, see the
 * route) and returns `false` until it answers, so the server HTML and the first client
 * render agree on the signup CTA.
 *
 * Only the boolean is kept. The route also returns the user's email and name, which are
 * dropped here and never stored. Concurrent callers share one in-flight request, so the
 * navbar and hero CTA mounting together cost one fetch.
 */

import { useEffect, useState } from 'react'

let pending: Promise<boolean> | null = null

function fetchAuthenticated(): Promise<boolean> {
  if (!pending) {
    pending = fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: unknown) =>
        Boolean(data && typeof data === 'object' && (data as { authenticated?: unknown }).authenticated === true),
      )
      .catch(() => false)
      .finally(() => {
        // Share only the in-flight request. A later mount (after a client-side
        // navigation, say from login) asks again rather than reusing a stale answer.
        pending = null
      })
  }
  return pending
}

export function useSessionCta(): { authenticated: boolean } {
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    let active = true
    void fetchAuthenticated().then((value) => {
      if (active) setAuthenticated(value)
    })
    return () => {
      active = false
    }
  }, [])

  return { authenticated }
}
