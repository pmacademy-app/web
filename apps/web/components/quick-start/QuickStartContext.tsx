'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { QUICK_START_STEPS, QuickStartStep } from './quick-start-steps'
import {
  trackQuickStartOpened,
  trackQuickStartStepViewed,
  trackQuickStartCompleted,
  trackQuickStartSkipped,
  trackQuickStartReopened,
} from '@/lib/analytics'

interface QuickStartContextType {
  isOpen: boolean
  currentStepIndex: number
  currentStep: QuickStartStep
  totalSteps: number
  isManualReopen: boolean
  openQuickStart: (mode?: 'auto' | 'manual') => void
  closeQuickStart: () => void
  nextStep: () => void
  prevStep: () => void
  skipTour: () => Promise<void>
  finishTour: () => Promise<void>
}

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

  // Auto-launch trigger on mount
  useEffect(() => {
    if (initialOnboardingComplete && !initialQuickStartCompleted) {
      setIsOpen(true)
      setIsManualReopen(false)
      setCurrentStepIndex(0)
      trackQuickStartOpened('auto')
      trackQuickStartStepViewed(1, QUICK_START_STEPS[0].title)
    }
  }, [initialOnboardingComplete, initialQuickStartCompleted])

  const openQuickStart = useCallback((mode: 'auto' | 'manual' = 'manual') => {
    setCurrentStepIndex(0)
    setIsOpen(true)
    setIsManualReopen(mode === 'manual')
    if (mode === 'manual') {
      trackQuickStartReopened()
    }
    trackQuickStartOpened(mode)
    trackQuickStartStepViewed(1, QUICK_START_STEPS[0].title)
  }, [])

  const closeQuickStart = useCallback(() => {
    setIsOpen(false)
  }, [])

  const persistCompletion = useCallback(async () => {
    try {
      const supabase = createBrowserSupabaseClient()
      const { error } = await supabase.auth.updateUser({
        data: { quick_start_completed: true },
      })

      if (error) {
        console.error('[QuickStart] Persistence error updating user metadata:', error.message)
      } else {
        // Refresh session token so client session reflects new user_metadata
        await supabase.auth.refreshSession()
      }
    } catch (err) {
      console.error('[QuickStart] Unexpected persistence error:', err)
    }
  }, [])

  const skipTour = useCallback(async () => {
    const atStep = currentStepIndex + 1
    setIsOpen(false)
    trackQuickStartSkipped(atStep)
    await persistCompletion()
  }, [currentStepIndex, persistCompletion])

  const finishTour = useCallback(async () => {
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
        openQuickStart,
        closeQuickStart,
        nextStep,
        prevStep,
        skipTour,
        finishTour,
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
