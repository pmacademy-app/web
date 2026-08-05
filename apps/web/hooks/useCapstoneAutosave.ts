'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface UseCapstoneAutosaveOptions {
  moduleSlug: string
  initialContent: string
  isLocked?: boolean
  debounceMs?: number
}

interface UseCapstoneAutosaveReturn {
  content: string
  setContent: (value: string | ((prev: string) => string)) => void
  status: AutosaveStatus
  lastSavedAt: Date | null
  error: string | null
  saveNow: () => Promise<boolean>
  isDirty: boolean
}

const LOCAL_STORAGE_KEY_PREFIX = 'pm_academy_capstone_draft_'

export function useCapstoneAutosave({
  moduleSlug,
  initialContent,
  isLocked = false,
  debounceMs = 2500,
}: UseCapstoneAutosaveOptions): UseCapstoneAutosaveReturn {
  const [content, setContentState] = useState<string>(() => {
    if (isLocked) return initialContent
    const storageKey = `${LOCAL_STORAGE_KEY_PREFIX}${moduleSlug}`
    const localSaved = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null
    if (localSaved && localSaved.trim().length > initialContent.trim().length) {
      return localSaved
    }
    return initialContent
  })

  const [status, setStatus] = useState<AutosaveStatus>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState<boolean>(false)

  const contentRef = useRef(content)
  const lastSavedContentRef = useRef(initialContent)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Synchronize ref on content state change
  useEffect(() => {
    contentRef.current = content
  }, [content])

  // Synchronize when remote initialContent finishes loading
  useEffect(() => {
    if (initialContent && !lastSavedContentRef.current) {
      lastSavedContentRef.current = initialContent
    }
  }, [initialContent])

  // Perform API Save
  const performSave = useCallback(async (textToSave: string): Promise<boolean> => {
    if (isLocked || !textToSave.trim()) return false

    setStatus('saving')
    setError(null)

    // Backup to LocalStorage immediately
    const storageKey = `${LOCAL_STORAGE_KEY_PREFIX}${moduleSlug}`
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, textToSave)
    }

    try {
      const res = await fetch(`/api/capstones/${moduleSlug}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: textToSave }),
      })

      if (!res.ok) {
        throw new Error(`Server status ${res.status}`)
      }

      lastSavedContentRef.current = textToSave
      setLastSavedAt(new Date())
      setStatus('saved')
      setIsDirty(false)
      return true
    } catch (err) {
      console.warn('[useCapstoneAutosave] Draft save error:', err)
      setStatus('error')
      setError('Draft saved locally (offline or server error).')
      return false
    }
  }, [moduleSlug, isLocked])

  // Debounced autosave effect
  const setContent = useCallback(
    (value: string | ((prev: string) => string)) => {
      if (isLocked) return

      setContentState((prev) => {
        const nextValue = typeof value === 'function' ? value(prev) : value
        if (nextValue !== prev) {
          setIsDirty(true)
          setStatus('idle')

          if (timerRef.current) {
            clearTimeout(timerRef.current)
          }

          timerRef.current = setTimeout(() => {
            performSave(nextValue)
          }, debounceMs)
        }
        return nextValue
      })
    },
    [isLocked, debounceMs, performSave]
  )

  // Force immediate save (e.g., before submission)
  const saveNow = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    return performSave(contentRef.current)
  }, [performSave])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  return {
    content,
    setContent,
    status,
    lastSavedAt,
    error,
    saveNow,
    isDirty,
  }
}
