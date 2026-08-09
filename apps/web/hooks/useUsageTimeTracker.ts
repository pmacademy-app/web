'use client'

import { useEffect, useRef } from 'react'

const PROMPT_THRESHOLD_MS = 60 * 60 * 1000 // 1 hour
const STORAGE_KEY = 'pm_academy_usage_prompt_fired'

interface UseUsageTimeTrackerOptions {
  onPromptTriggered: (key: string) => void
}

/**
 * Tracks cumulative session usage time. After 1 hour of active usage,
 * fires the 'usage_1hr' prompt key once per browser session.
 * The fired flag is persisted to sessionStorage so it doesn't re-trigger
 * on the same tab after navigating between pages.
 */
export function useUsageTimeTracker({ onPromptTriggered }: UseUsageTimeTrackerOptions): void {
  const startTimeRef = useRef<number>(0)
  const firedRef = useRef<boolean>(false)

  useEffect(() => {
    // Don't fire again if already prompted in this browser session
    if (typeof window !== 'undefined' && sessionStorage.getItem(STORAGE_KEY) === '1') {
      firedRef.current = true
    }

    if (firedRef.current) return

    startTimeRef.current = Date.now()

    const interval = setInterval(() => {
      if (firedRef.current) {
        clearInterval(interval)
        return
      }

      const elapsed = Date.now() - startTimeRef.current
      if (elapsed >= PROMPT_THRESHOLD_MS) {
        firedRef.current = true
        sessionStorage.setItem(STORAGE_KEY, '1')
        clearInterval(interval)
        onPromptTriggered('usage_1hr')
      }
    }, 60 * 1000) // Check every minute

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
