'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

interface SettingsDirtyContextValue {
  isDirty: boolean
  setDirty: (dirty: boolean) => void
  confirmNavigationIfDirty: () => boolean
}

const SettingsDirtyContext = createContext<SettingsDirtyContextValue | null>(null)

export function SettingsDirtyProvider({ children }: { children: React.ReactNode }) {
  const [isDirty, setIsDirty] = useState(false)

  const confirmNavigationIfDirty = useCallback(() => {
    if (!isDirty) return true
    const confirmed = typeof window !== 'undefined'
      ? window.confirm('You have unsaved changes. Are you sure you want to discard them?')
      : true
    if (confirmed) {
      setIsDirty(false)
    }
    return confirmed
  }, [isDirty])

  return (
    <SettingsDirtyContext.Provider value={{ isDirty, setDirty: setIsDirty, confirmNavigationIfDirty }}>
      {children}
    </SettingsDirtyContext.Provider>
  )
}

export function useSettingsDirtyContext(): SettingsDirtyContextValue {
  const ctx = useContext(SettingsDirtyContext)
  if (!ctx) {
    return {
      isDirty: false,
      setDirty: () => {},
      confirmNavigationIfDirty: () => true,
    }
  }
  return ctx
}

/**
 * Hook to guard a form with unsaved changes.
 * - Prevents window/tab close or refresh via `beforeunload`
 * - Synchronizes with the surrounding SettingsDirtyContext for in-app tab transitions
 */
export function useDirtyFormGuard(isDirty: boolean, customMessage?: string) {
  const { setDirty } = useSettingsDirtyContext()
  const message = customMessage || 'You have unsaved changes. Are you sure you want to leave?'

  // Sync with Settings tab switcher
  useEffect(() => {
    setDirty(isDirty)
    return () => {
      setDirty(false)
    }
  }, [isDirty, setDirty])

  // Prevent browser close/reload
  useEffect(() => {
    if (!isDirty) return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = message
      return message
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [isDirty, message])
}

/**
 * Deep comparison helper for settings form state objects to reliably compute dirty state.
 */
export function areFormsEqual<T>(a: T, b: T): boolean {
  if (a === b) return true
  if (!a || !b) return false
  if (typeof a !== 'object' || typeof b !== 'object') return a === b
  return JSON.stringify(a) === JSON.stringify(b)
}
