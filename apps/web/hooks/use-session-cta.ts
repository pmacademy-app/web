'use client'

/**
 * Whether the visitor is signed in, for swapping marketing CTAs to "Go to dashboard".
 *
 * The marketing pages are ISR, and the auth cookies are httpOnly, so the server render
 * cannot know. Every place that writes the session cookies also writes a readable
 * `prodily_signed_in=1` hint (`lib/auth/session-cookies.ts`), and clearing the session
 * clears it. With no hint the visitor is signed out and nothing is fetched, which is the
 * common case on marketing pages (perf plan item 7).
 *
 * With the hint, this confirms with `GET /api/auth/session` once after mount (always 200,
 * see the route), because the hint can outlive a session that ended elsewhere (an expired
 * refresh token, a deleted account). A "not signed in" answer clears the stale hint so the
 * next view makes no call. Returns `false` until it knows, so the server HTML and the first
 * client render agree on the signup CTA.
 *
 * Only the boolean is kept. The route also returns the user's email and name, which are
 * dropped here and never stored. Concurrent callers share one in-flight request, so the
 * navbar and hero CTA mounting together cost one fetch.
 */

import { useEffect, useState } from 'react'
import { apiGet } from '@/lib/api/client'

/** Mirrors `SIGNED_IN_HINT_COOKIE` in `lib/auth/session-cookies.ts` (a server-only module). */
export const SIGNED_IN_HINT_COOKIE = 'prodily_signed_in'

export function hasSignedInHint(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie
    .split(';')
    .some((part) => part.trim() === `${SIGNED_IN_HINT_COOKIE}=1`)
}

function clearSignedInHint(): void {
  if (typeof document === 'undefined') return
  document.cookie = `${SIGNED_IN_HINT_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`
}

let pending: Promise<boolean> | null = null

function fetchAuthenticated(): Promise<boolean> {
  if (!pending) {
    pending = apiGet<{ authenticated?: boolean }>('/api/auth/session', { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) return false
        const authenticated = res.data?.authenticated === true
        if (!authenticated) clearSignedInHint()
        return authenticated
      })
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
    if (!hasSignedInHint()) return
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
