'use client'

import { useState, useCallback, useRef } from 'react'
import { calculateLevel, type LevelInfo } from '@/lib/xp'

export interface XpAnimationState {
  isAnimating: boolean
  xpGained: number
  oldLevelInfo: LevelInfo | null
  newLevelInfo: LevelInfo | null
  isLevelUp: boolean
}

export function useXpAnimation(durationMs: number = 3000) {
  const [animationState, setAnimationState] = useState<XpAnimationState>({
    isAnimating: false,
    xpGained: 0,
    oldLevelInfo: null,
    newLevelInfo: null,
    isLevelUp: false,
  })

  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const triggerXpGain = useCallback(
    (xpGained: number, previousTotalXp: number, newTotalXp: number) => {
      if (xpGained <= 0) return

      const oldLevelInfo = calculateLevel(previousTotalXp)
      const newLevelInfo = calculateLevel(newTotalXp)
      const isLevelUp = newLevelInfo.level > oldLevelInfo.level

      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }

      setAnimationState({
        isAnimating: true,
        xpGained,
        oldLevelInfo,
        newLevelInfo,
        isLevelUp,
      })

      timerRef.current = setTimeout(() => {
        setAnimationState((prev) => ({ ...prev, isAnimating: false }))
      }, durationMs)
    },
    [durationMs]
  )

  const dismissAnimation = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    setAnimationState((prev) => ({ ...prev, isAnimating: false }))
  }, [])

  return {
    ...animationState,
    triggerXpGain,
    dismissAnimation,
  }
}
