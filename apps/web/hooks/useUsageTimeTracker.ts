'use client'

import { useEffect, useRef } from 'react'

export interface UseUsageTimeTrackerOptions {
  onPromptTriggered?: (key: string) => void
}

/**
 * Authoritative client hook for tracking active learner dwell time and feedback prompt eligibility.
 *
 * Behavior:
 * 1. Checks prompt eligibility on mount via GET /api/feedback/eligibility.
 * 2. Every 30 seconds of active tab engagement (!document.hidden), syncs accumulated dwell seconds
 *    to the database via POST /api/feedback/eligibility.
 * 3. Triggers the milestone prompt callback (e.g. 'usage_1hr') when server indicates milestone eligibility.
 * 4. Safely cleans up timers and handles network errors without crashing.
 */
export function useUsageTimeTracker(
  optionsOrCallback?: UseUsageTimeTrackerOptions | ((promptKey: string) => void)
): void {
  const accumulatedSecondsRef = useRef<number>(0)
  const isMountedRef = useRef<boolean>(true)

  const handlePrompt = (promptKey: string) => {
    if (!isMountedRef.current) return
    if (typeof optionsOrCallback === 'function') {
      optionsOrCallback(promptKey)
    } else if (optionsOrCallback?.onPromptTriggered) {
      optionsOrCallback.onPromptTriggered(promptKey)
    }
  }

  useEffect(() => {
    isMountedRef.current = true
    let intervalId: NodeJS.Timeout | null = null

    // Check prompt eligibility from server
    const checkEligibility = async () => {
      try {
        const res = await fetch('/api/feedback/eligibility')
        if (!res.ok) return
        const data = await res.json()
        if (
          isMountedRef.current &&
          data.success &&
          Array.isArray(data.eligiblePrompts) &&
          data.eligiblePrompts.length > 0
        ) {
          handlePrompt(data.eligiblePrompts[0])
        }
      } catch {
        // Non-fatal network error handling
      }
    }

    void checkEligibility()

    // Sync accumulated active seconds every 30 seconds when tab is visible
    intervalId = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) {
        return // Pause accumulation when inactive/hidden
      }

      accumulatedSecondsRef.current += 30

      if (accumulatedSecondsRef.current >= 30) {
        const secToSync = Math.min(accumulatedSecondsRef.current, 300)
        accumulatedSecondsRef.current = 0

        void fetch('/api/feedback/eligibility', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ incrementSeconds: secToSync }),
        })
          .then(async (res) => {
            if (res.ok && isMountedRef.current) {
              void checkEligibility()
            }
          })
          .catch(() => {
            // Non-fatal sync error handling
          })
      }
    }, 30000)

    return () => {
      isMountedRef.current = false
      if (intervalId) clearInterval(intervalId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
