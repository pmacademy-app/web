'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { apiPost } from '@/lib/api/client'
import {
  queueDeferredQuickStart,
  shouldLaunchDeferredQuickStart,
  consumeDeferredQuickStart,
  clearDeferredQuickStart,
} from '@/lib/quick-start/deferred-launch'
import { QUICK_START_STEPS, QUICK_START_AUTO_LAUNCH_ENABLED, QuickStartStep } from './quick-start-steps'
import {
  trackQuickStartOpened,
  trackQuickStartStepViewed,
  trackQuickStartCompleted,
  trackQuickStartSkipped,
  trackQuickStartReopened,
  type QuickStartMode,
} from '@/lib/analytics'

interface QuickStartContextType {
  isOpen: boolean
  currentStepIndex: number
  currentStep: QuickStartStep
  totalSteps: number
  isManualReopen: boolean
  /** How the tour was last opened; null until it first opens. */
  openMode: QuickStartMode | null
  openQuickStart: (mode?: QuickStartMode) => void
  closeQuickStart: () => void
  nextStep: () => void
  prevStep: () => void
  skipTour: () => Promise<void>
  finishTour: () => Promise<void>
  /**
   * Queue the tour to open on the next non-lesson page (Growth R1, Task 5). Called when the
   * first-lesson celebration closes. No-op once the tour was skipped or finished.
   */
  requestDeferredLaunch: () => void
}

/**
 * Delay after the next animation frame before a deferred open, so the celebration's Radix
 * dialog has fully unmounted (body pointer-events lock and focus trap released) first.
 */
const DEFERRED_LAUNCH_DELAY_MS = 300

const QuickStartContext = createContext<QuickStartContextType | null>(null)

interface QuickStartProviderProps {
  children: React.ReactNode
  initialOnboardingComplete: boolean
  initialQuickStartCompleted: boolean
}

export function QuickStartProvider({
  children,
  initialOnboardingComplete,
  initialQuickStartCompleted,
}: QuickStartProviderProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [isManualReopen, setIsManualReopen] = useState(false)
  const pathname = usePathname()

  // Set when the learner skips or finishes the tour in this provider's lifetime. The
  // `initialQuickStartCompleted` prop is read server-side and can be stale until the next
  // server render, so it alone must not allow a deferred relaunch.
  const completedThisSessionRef = useRef(false)
  const [openMode, setOpenMode] = useState<QuickStartMode | null>(null)
  // Bumped by `requestDeferredLaunch` so the deferred-launch effect re-evaluates even when the
  // pathname has not changed.
  const [deferredLaunchSignal, setDeferredLaunchSignal] = useState(0)
  // Latest committed values, read by the deferred-launch timer when it fires.
  const latestRef = useRef({ pathname, isOpen, initialQuickStartCompleted })
  useEffect(() => {
    latestRef.current = { pathname, isOpen, initialQuickStartCompleted }
  })

  // Auto-launch trigger on mount.
  // Phase 4.2: gated off — the tour is no longer pushed at the entrance. It stays reachable
  // manually (see `openQuickStart('manual')`, wired to the Topbar control). Kept as a guarded
  // effect rather than deleted so the behaviour is a one-line flag flip to restore.
  useEffect(() => {
    if (!QUICK_START_AUTO_LAUNCH_ENABLED) return
    if (initialOnboardingComplete && !initialQuickStartCompleted) {
      const raf = requestAnimationFrame(() => {
        setIsOpen(true)
        setIsManualReopen(false)
        setOpenMode('auto')
        setCurrentStepIndex(0)
        trackQuickStartOpened('auto')
        trackQuickStartStepViewed(1, QUICK_START_STEPS[0].title)
      })
      return () => cancelAnimationFrame(raf)
    }
  }, [initialOnboardingComplete, initialQuickStartCompleted])

  const openQuickStart = useCallback((mode: QuickStartMode = 'manual') => {
    // However the tour opens, a queued deferred launch is now redundant.
    clearDeferredQuickStart()
    setCurrentStepIndex(0)
    setIsOpen(true)
    setOpenMode(mode)
    setIsManualReopen(mode === 'manual')
    if (mode === 'manual') {
      trackQuickStartReopened()
    }
    trackQuickStartOpened(mode)
    trackQuickStartStepViewed(1, QUICK_START_STEPS[0].title)
  }, [])

  const requestDeferredLaunch = useCallback(() => {
    if (initialQuickStartCompleted || completedThisSessionRef.current) return
    queueDeferredQuickStart()
    setDeferredLaunchSignal((n) => n + 1)
  }, [initialQuickStartCompleted])

  // Deferred launch (Growth R1, Task 5): after the first completed lesson the tour opens on
  // the next non-lesson page, at most once per browser session. The effect only reads
  // storage; the timer re-checks against the latest committed state and consumes the flag
  // only when it actually opens, so a cancelled timer (StrictMode re-run, navigation onto a
  // lesson, unmount) never loses the pending launch, and single-threaded timers mean at most
  // one open.
  useEffect(() => {
    const completed = initialQuickStartCompleted || completedThisSessionRef.current
    if (completed) {
      clearDeferredQuickStart()
      return
    }
    if (!shouldLaunchDeferredQuickStart({ pathname, isOpen, completed })) return

    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const raf = requestAnimationFrame(() => {
      timeoutId = setTimeout(() => {
        const latest = latestRef.current
        const stillLaunchable = shouldLaunchDeferredQuickStart({
          pathname: latest.pathname,
          isOpen: latest.isOpen,
          completed: latest.initialQuickStartCompleted || completedThisSessionRef.current,
        })
        if (!stillLaunchable) return
        consumeDeferredQuickStart()
        openQuickStart('post_first_lesson')
      }, DEFERRED_LAUNCH_DELAY_MS)
    })
    return () => {
      cancelAnimationFrame(raf)
      if (timeoutId !== undefined) clearTimeout(timeoutId)
    }
  }, [pathname, deferredLaunchSignal, isOpen, initialQuickStartCompleted, openQuickStart])

  const closeQuickStart = useCallback(() => {
    setIsOpen(false)
  }, [])

  /**
   * B13-A: this used to call `supabase.auth.updateUser()` on the browser client and then
   * `refreshSession()` to pull the new metadata into the local session. Both needed a
   * session in browser JavaScript, which no longer exists — the server owns it.
   *
   * `POST /api/user/quick-start` does the write with the actor resolved from the
   * httpOnly cookie, and the explicit `refreshSession()` is gone with it: the flag is
   * read server-side in `app/(app)/layout.tsx`, so the next navigation sees it.
   */
  const persistCompletion = useCallback(async () => {
    const result = await apiPost('/api/user/quick-start')
    if (!result.ok) {
      console.error('[QuickStart] Could not persist completion:', result.error.code)
    }
  }, [])

  const skipTour = useCallback(async () => {
    const atStep = currentStepIndex + 1
    completedThisSessionRef.current = true
    clearDeferredQuickStart()
    setIsOpen(false)
    trackQuickStartSkipped(atStep)
    await persistCompletion()
  }, [currentStepIndex, persistCompletion])

  const finishTour = useCallback(async () => {
    completedThisSessionRef.current = true
    clearDeferredQuickStart()
    setIsOpen(false)
    trackQuickStartCompleted()
    await persistCompletion()
  }, [persistCompletion])

  const nextStep = useCallback(() => {
    setCurrentStepIndex((prev) => {
      const nextIndex = Math.min(prev + 1, QUICK_START_STEPS.length - 1)
      trackQuickStartStepViewed(nextIndex + 1, QUICK_START_STEPS[nextIndex].title)
      return nextIndex
    })
  }, [])

  const prevStep = useCallback(() => {
    setCurrentStepIndex((prev) => {
      const prevIndex = Math.max(prev - 1, 0)
      trackQuickStartStepViewed(prevIndex + 1, QUICK_START_STEPS[prevIndex].title)
      return prevIndex
    })
  }, [])

  const currentStep = QUICK_START_STEPS[currentStepIndex] || QUICK_START_STEPS[0]

  return (
    <QuickStartContext.Provider
      value={{
        isOpen,
        currentStepIndex,
        currentStep,
        totalSteps: QUICK_START_STEPS.length,
        isManualReopen,
        openMode,
        openQuickStart,
        closeQuickStart,
        nextStep,
        prevStep,
        skipTour,
        finishTour,
        requestDeferredLaunch,
      }}
    >
      {children}
    </QuickStartContext.Provider>
  )
}

export function useQuickStart() {
  const context = useContext(QuickStartContext)
  if (!context) {
    throw new Error('useQuickStart must be used within a QuickStartProvider')
  }
  return context
}

/** Like `useQuickStart`, but returns null outside a `QuickStartProvider` instead of throwing. */
export function useQuickStartOptional() {
  return useContext(QuickStartContext)
}
