'use client'

import { useEffect, useRef } from 'react'

export interface UseUsageTimeTrackerOptions {
  onPromptTriggered?: (key: string) => void
}

const SYNC_THRESHOLD_SECONDS = 300 // 5 minutes batch sync
const VISIBILITY_FLUSH_THRESHOLD_SECONDS = 30 // Flush on tab hide if at least 30s accumulated

// Session-level in-flight deduplication promise
let globalInitialCheckPromise: Promise<{ success?: boolean; completedPrompts?: string[]; eligiblePrompts?: string[] } | null> | null = null

/**
 * Resets any in-memory active-time tracker cache (useful on logout / session switch).
 */
export function resetUsageTimeTrackerState(): void {
  globalInitialCheckPromise = null
}

/**
 * Authoritative client hook for tracking active learner dwell time and feedback prompt eligibility.
 *
 * P0 Compute Optimization & Cross-User Isolation:
 * 1. Accumulates active dwell seconds locally in memory every 1s when document is visible (!document.hidden).
 * 2. Eliminates the legacy 60-second POST polling loop.
 * 3. Batches sync to POST /api/feedback/eligibility every 300 seconds (5 minutes) of active engagement.
 * 4. Flushes pending dwell seconds on tab visibility change (to hidden) or page unload using keepalive/sendBeacon.
 * 5. Uses the server's /api/feedback/eligibility response as the sole authority for feedback eligibility,
 *    preventing cross-user state contamination on shared browsers.
 * 6. Discards computer sleep / tab freeze gaps (> 5s deltas).
 * 7. Safely cleans up all intervals, timers, and listeners on unmount.
 */
export function useUsageTimeTracker(
  optionsOrCallback?: UseUsageTimeTrackerOptions | ((promptKey: string) => void)
): void {
  const isMountedRef = useRef<boolean>(true)
  const isSyncingRef = useRef<boolean>(false)
  const isUsage1hrDoneRef = useRef<boolean>(false)
  const pendingActiveSecondsRef = useRef<number>(0)

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
    isUsage1hrDoneRef.current = false
    pendingActiveSecondsRef.current = 0

    /**
     * Synchronizes accumulated active seconds with the backend.
     * Bounded to maximum 300 seconds per sync call.
     */
    const syncActiveTime = async (secondsToSync: number, isUnload = false) => {
      if (secondsToSync <= 0 || isSyncingRef.current) return
      isSyncingRef.current = true

      const boundedSeconds = Math.min(secondsToSync, 300)
      pendingActiveSecondsRef.current = Math.max(0, pendingActiveSecondsRef.current - boundedSeconds)

      const payload = JSON.stringify({ incrementSeconds: boundedSeconds })

      // On page unload / hide, prefer keepalive fetch or sendBeacon
      if (isUnload && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        try {
          const blob = new Blob([payload], { type: 'application/json' })
          const sent = navigator.sendBeacon('/api/feedback/eligibility', blob)
          if (sent) {
            isSyncingRef.current = false
            return
          }
        } catch {
          // Fallback to keepalive fetch
        }
      }

      try {
        const res = await fetch('/api/feedback/eligibility', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: isUnload,
        })

        if (!res.ok) {
          // Re-queue unsynced seconds on non-fatal network error (bounded)
          pendingActiveSecondsRef.current = Math.min(300, pendingActiveSecondsRef.current + boundedSeconds)
          return
        }

        const data = await res.json()
        if (!data.success) return

        if (Array.isArray(data.completedPrompts) && data.completedPrompts.includes('usage_1hr')) {
          isUsage1hrDoneRef.current = true
        }

        if (Array.isArray(data.eligiblePrompts) && data.eligiblePrompts.length > 0) {
          handlePrompt(data.eligiblePrompts[0])
          isUsage1hrDoneRef.current = true
        }
      } catch {
        // Re-queue unsynced seconds on network failure
        pendingActiveSecondsRef.current = Math.min(300, pendingActiveSecondsRef.current + boundedSeconds)
      } finally {
        isSyncingRef.current = false
      }
    }

    // Check prompt eligibility on initial mount for current authenticated user
    const checkEligibilityOnMount = async () => {
      if (isUsage1hrDoneRef.current) return

      try {
        if (!globalInitialCheckPromise) {
          globalInitialCheckPromise = fetch('/api/feedback/eligibility')
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
            .finally(() => {
              // Clear promise after resolution so subsequent sessions fetch fresh
              setTimeout(() => {
                globalInitialCheckPromise = null
              }, 10000)
            })
        }

        const data = await globalInitialCheckPromise
        if (!isMountedRef.current || !data || !data.success) return

        if (Array.isArray(data.completedPrompts) && data.completedPrompts.includes('usage_1hr')) {
          isUsage1hrDoneRef.current = true
          return
        }

        if (Array.isArray(data.eligiblePrompts) && data.eligiblePrompts.length > 0) {
          handlePrompt(data.eligiblePrompts[0])
          isUsage1hrDoneRef.current = true
        }
      } catch {
        // Non-fatal mount check error
      }
    }

    void checkEligibilityOnMount()

    // Active local clock ticking every 1 second without firing network requests
    let lastTickTime = Date.now()
    const intervalId = setInterval(() => {
      const now = Date.now()
      const deltaSec = Math.round((now - lastTickTime) / 1000)
      lastTickTime = now

      // Accumulate only when document is visible and delta is sane (1-5s), discarding sleep/freeze gaps
      if (typeof document !== 'undefined' && !document.hidden && deltaSec > 0 && deltaSec <= 5) {
        pendingActiveSecondsRef.current += deltaSec

        // Periodic batch sync at 300s (5-minute) threshold
        if (pendingActiveSecondsRef.current >= SYNC_THRESHOLD_SECONDS && !isSyncingRef.current) {
          void syncActiveTime(pendingActiveSecondsRef.current)
        }
      }
    }, 1000)

    // Visibility change handler: flush pending active time when tab is hidden
    const handleVisibilityChange = () => {
      if (typeof document === 'undefined') return

      if (document.hidden) {
        if (pendingActiveSecondsRef.current >= VISIBILITY_FLUSH_THRESHOLD_SECONDS && !isSyncingRef.current) {
          void syncActiveTime(pendingActiveSecondsRef.current)
        }
      } else {
        lastTickTime = Date.now()
      }
    }

    // Page unload handler: flush remaining unsaved time
    const handlePageHide = () => {
      if (pendingActiveSecondsRef.current >= 10 && !isSyncingRef.current) {
        void syncActiveTime(pendingActiveSecondsRef.current, true)
      }
    }

    // Custom event listener: lesson/capstone completion flushes pending active time
    const handleCustomSync = () => {
      if (pendingActiveSecondsRef.current > 0 && !isSyncingRef.current) {
        void syncActiveTime(pendingActiveSecondsRef.current)
      }
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', handlePageHide)
      window.addEventListener('beforeunload', handlePageHide)
      window.addEventListener('learner:feedback:sync', handleCustomSync)
    }

    return () => {
      isMountedRef.current = false
      clearInterval(intervalId)
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('pagehide', handlePageHide)
        window.removeEventListener('beforeunload', handlePageHide)
        window.removeEventListener('learner:feedback:sync', handleCustomSync)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}


