'use client'

import { useEffect, useRef } from 'react'

export interface UseUsageTimeTrackerOptions {
  onPromptTriggered?: (key: string) => void
}

/**
 * Authoritative client hook for tracking active learner dwell time and feedback prompt eligibility.
 *
 * Optimizations (Phase 2):
 * 1. Checks prompt eligibility once on mount via GET /api/feedback/eligibility.
 * 2. If 1-hour milestone is already completed/dismissed, halts polling immediately.
 * 3. Every 60 seconds of active tab engagement (!document.hidden), syncs accumulated dwell seconds
 *    via POST /api/feedback/eligibility.
 * 4. POST directly returns eligibility state, completely eliminating redundant secondary GET requests.
 * 5. In-flight guard prevents concurrent identical requests.
 * 6. Safely cleans up timers on unmount.
 */
export function useUsageTimeTracker(
  optionsOrCallback?: UseUsageTimeTrackerOptions | ((promptKey: string) => void)
): void {
  const accumulatedSecondsRef = useRef<number>(0)
  const isMountedRef = useRef<boolean>(true)
  const isSyncingRef = useRef<boolean>(false)
  const isUsage1hrDoneRef = useRef<boolean>(false)

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

    // Check prompt eligibility from server on initial mount
    const checkEligibilityOnMount = async () => {
      if (isUsage1hrDoneRef.current) return
      try {
        const res = await fetch('/api/feedback/eligibility')
        if (!res.ok) return
        const data = await res.json()
        if (!isMountedRef.current || !data.success) return

        if (Array.isArray(data.completedPrompts) && data.completedPrompts.includes('usage_1hr')) {
          isUsage1hrDoneRef.current = true
          if (intervalId) clearInterval(intervalId)
          return
        }

        if (Array.isArray(data.eligiblePrompts) && data.eligiblePrompts.length > 0) {
          handlePrompt(data.eligiblePrompts[0])
          isUsage1hrDoneRef.current = true
          if (intervalId) clearInterval(intervalId)
        }
      } catch {
        // Non-fatal network error handling
      }
    }

    void checkEligibilityOnMount()

    // Sync accumulated active seconds every 60 seconds when tab is visible
    intervalId = setInterval(() => {
      if (isUsage1hrDoneRef.current) {
        if (intervalId) clearInterval(intervalId)
        return
      }

      if (typeof document !== 'undefined' && document.hidden) {
        return // Pause accumulation when inactive/hidden
      }

      accumulatedSecondsRef.current += 60

      if (accumulatedSecondsRef.current >= 60 && !isSyncingRef.current) {
        const secToSync = Math.min(accumulatedSecondsRef.current, 300)
        accumulatedSecondsRef.current = 0
        isSyncingRef.current = true

        void fetch('/api/feedback/eligibility', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ incrementSeconds: secToSync }),
        })
          .then(async (res) => {
            if (!isMountedRef.current || !res.ok) return
            const data = await res.json()
            if (!data.success) return

            if (Array.isArray(data.completedPrompts) && data.completedPrompts.includes('usage_1hr')) {
              isUsage1hrDoneRef.current = true
              if (intervalId) clearInterval(intervalId)
              return
            }

            // Directly inspect returned eligibility without secondary GET request
            if (Array.isArray(data.eligiblePrompts) && data.eligiblePrompts.length > 0) {
              handlePrompt(data.eligiblePrompts[0])
              isUsage1hrDoneRef.current = true
              if (intervalId) clearInterval(intervalId)
            }
          })
          .catch(() => {
            // Non-fatal sync error handling
          })
          .finally(() => {
            isSyncingRef.current = false
          })
      }
    }, 60000)

    return () => {
      isMountedRef.current = false
      if (intervalId) clearInterval(intervalId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
