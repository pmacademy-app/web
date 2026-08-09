'use client'

import { useEffect, useRef } from 'react'

export function useUsageTimeTracker(onEligiblePrompt?: (promptKey: string) => void) {
  const accumulatedSecondsRef = useRef<number>(0)

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null

    // Check prompt eligibility periodically
    const checkEligibility = async () => {
      try {
        const res = await fetch('/api/feedback/eligibility')
        const data = await res.json()
        if (data.success && Array.isArray(data.eligiblePrompts) && data.eligiblePrompts.length > 0) {
          onEligiblePrompt?.(data.eligiblePrompts[0])
        }
      } catch {
        // Ignored
      }
    }

    void checkEligibility()

    // Sync accumulated seconds every 30 seconds if tab is active
    intervalId = setInterval(() => {
      if (document.hidden) return // Pause when inactive/hidden

      accumulatedSecondsRef.current += 30

      if (accumulatedSecondsRef.current >= 30) {
        const secToSync = accumulatedSecondsRef.current
        accumulatedSecondsRef.current = 0

        void fetch('/api/feedback/eligibility', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ incrementSeconds: secToSync }),
        }).then(async (res) => {
          if (res.ok) {
            void checkEligibility()
          }
        })
      }
    }, 30000)

    return () => {
      if (intervalId) clearInterval(intervalId)
    }
  }, [onEligiblePrompt])
}
