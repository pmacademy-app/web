'use client'

import { useEffect } from 'react'
import { apiPost } from '@/lib/api/client'

/**
 * Saves the browser's timezone on the learner's profile when it differs from the
 * stored one.
 *
 * Signup records a timezone on the server, where `Intl` reports the server's zone
 * (UTC on Vercel), and nothing ever corrected it. Streak days and reminder hours are
 * computed in that stored zone, so a learner in India had their day roll over at
 * 05:30 and got reminders by the UTC clock. This posts once per change, renders
 * nothing, and fails silently: a missed sync only keeps the previous behaviour.
 */
export default function TimezoneSync({ storedTimezone }: { storedTimezone: string | null | undefined }) {
  useEffect(() => {
    let browserTimezone: string | undefined
    try {
      browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch {
      return
    }
    if (!browserTimezone || browserTimezone === storedTimezone) return

    // One attempt per tab session per zone, so a failing endpoint is not hit on every page.
    const flag = `prodily_tz_sync:${browserTimezone}`
    try {
      if (sessionStorage.getItem(flag)) return
      sessionStorage.setItem(flag, '1')
    } catch {
      // Storage blocked: still try once for this mount.
    }

    void apiPost('/api/streaks/timezone', { timezone: browserTimezone }).catch(() => undefined)
  }, [storedTimezone])

  return null
}
