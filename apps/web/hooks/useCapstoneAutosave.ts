'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface UseCapstoneAutosaveOptions {
  moduleSlug: string
  /**
   * The signed-in learner's id. The local backup is keyed by it, so drafts never leak
   * between learners on a shared browser. While it is unknown (null/undefined) the hook
   * neither reads nor writes local storage; network saves still run.
   */
  userId: string | null | undefined
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
  /** Removes this learner's local backup for the module (call after a successful submit). */
  clearLocalDraft: () => void
}

/** Pre-CQ-08 key. Not scoped to a user, so it is only ever deleted, never read. */
const LEGACY_STORAGE_KEY_PREFIX = 'pm_academy_capstone_draft_'

/** Browsers cap keepalive request bodies at 64 KiB; stay safely under it. */
const KEEPALIVE_BODY_LIMIT_BYTES = 60_000

export function capstoneDraftStorageKey(userId: string, moduleSlug: string): string {
  return `capstone-draft:${userId}:${moduleSlug}`
}

function readLocalDraft(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeLocalDraft(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Storage full or blocked: the network save is still the source of truth.
  }
}

function removeLocalDraft(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Ignore blocked storage.
  }
}

export function useCapstoneAutosave({
  moduleSlug,
  userId,
  initialContent,
  isLocked = false,
  debounceMs = 2500,
}: UseCapstoneAutosaveOptions): UseCapstoneAutosaveReturn {
  // Local storage is read after mount (see the restore effect), never in the initializer,
  // so the first client render matches the server render.
  const [content, setContentState] = useState<string>(initialContent)
  const [prevInitialContent, setPrevInitialContent] = useState<string>(initialContent)
  const [status, setStatus] = useState<AutosaveStatus>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState<boolean>(false)

  const storageKey = userId ? capstoneDraftStorageKey(userId, moduleSlug) : null

  const contentRef = useRef(content)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasPendingSaveRef = useRef(false)
  const saveSeqRef = useRef(0)
  const isMountedRef = useRef(true)
  const restoredKeyRef = useRef<string | null>(null)

  // Keep the ref in step with state changes that did not go through setContent
  // (the initialContent adjustment below and the local restore).
  useEffect(() => {
    contentRef.current = content
  }, [content])

  // Synchronize state when remote initialContent finishes loading (React-standard render adjustment)
  if (initialContent !== prevInitialContent) {
    setPrevInitialContent(initialContent)
    if (isLocked || !content || content.trim() === '') {
      setContentState(initialContent)
      if (initialContent.trim().length > 0) {
        setLastSavedAt(new Date())
      }
    }
  }

  const performSave = useCallback(
    async (textToSave: string, options: { keepalive?: boolean } = {}): Promise<boolean> => {
      if (isLocked || !textToSave.trim()) return false

      const seq = ++saveSeqRef.current
      const isCurrent = () => isMountedRef.current && seq === saveSeqRef.current

      if (isMountedRef.current) {
        setStatus('saving')
        setError(null)
      }

      const body = JSON.stringify({ content: textToSave })
      const keepalive =
        options.keepalive === true && new TextEncoder().encode(body).length <= KEEPALIVE_BODY_LIMIT_BYTES

      try {
        const res = await fetch(`/api/capstones/${moduleSlug}/draft`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive,
        })

        if (!res.ok) {
          throw new Error(`Server status ${res.status}`)
        }

        // A newer save (or newer typing) supersedes this response: do not let it mark the
        // editor as saved.
        if (isCurrent()) {
          setLastSavedAt(new Date())
          setStatus('saved')
          if (contentRef.current === textToSave) {
            setIsDirty(false)
          }
        }
        return true
      } catch (err) {
        console.warn('[useCapstoneAutosave] Draft save error:', err)
        if (isCurrent()) {
          setStatus('error')
          setError('Draft saved locally (offline or server error).')
        }
        return false
      }
    },
    [moduleSlug, isLocked]
  )

  // Latest performSave for the unmount and pagehide flushes, which must not re-subscribe
  // (and therefore must not flush) every time the callback identity changes.
  const performSaveRef = useRef(performSave)
  useEffect(() => {
    performSaveRef.current = performSave
  }, [performSave])

  // Debounced network save of `text`. Marks the save pending first so the unmount and
  // pagehide flushes send it if the timer has not fired yet.
  const scheduleSave = useCallback(
    (text: string) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      hasPendingSaveRef.current = true
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        hasPendingSaveRef.current = false
        void performSaveRef.current(text)
      }, debounceMs)
    },
    [debounceMs]
  )

  // Restore this learner's local backup once their id is known. The legacy unscoped key
  // could hold another learner's draft, so it is removed and never read.
  useEffect(() => {
    if (!userId || !storageKey || isLocked) return
    if (restoredKeyRef.current === storageKey) return
    restoredKeyRef.current = storageKey

    removeLocalDraft(`${LEGACY_STORAGE_KEY_PREFIX}${moduleSlug}`)

    const localSaved = readLocalDraft(storageKey)
    if (localSaved && localSaved.trim().length > contentRef.current.trim().length) {
      contentRef.current = localSaved
      // Any in-flight save now describes stale content.
      saveSeqRef.current += 1
      setContentState(localSaved)
      setIsDirty(true)
      // The restored text exists only in this browser. Queue it for the server too, so it
      // is not lost if the learner leaves without typing (S3).
      scheduleSave(localSaved)
    }
  }, [userId, storageKey, moduleSlug, isLocked, scheduleSave])

  const setContent = useCallback(
    (value: string | ((prev: string) => string)) => {
      if (isLocked) return

      // Compute outside the state updater so the updater stays pure (StrictMode double-invokes
      // updaters) and the side effects below run exactly once.
      const prev = contentRef.current
      const next = typeof value === 'function' ? value(prev) : value
      if (next === prev) return

      contentRef.current = next
      // Any in-flight save now describes stale content.
      saveSeqRef.current += 1
      setContentState(next)
      setIsDirty(true)
      setStatus('idle')

      // Back up every keystroke; only the network save is debounced.
      if (storageKey) writeLocalDraft(storageKey, next)

      scheduleSave(next)
    },
    [isLocked, scheduleSave, storageKey]
  )

  // Force immediate save (e.g., before submission)
  const saveNow = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    hasPendingSaveRef.current = false
    return performSave(contentRef.current)
  }, [performSave])

  const clearLocalDraft = useCallback(() => {
    if (storageKey) removeLocalDraft(storageKey)
  }, [storageKey])

  // Flush a pending debounced save when the page is hidden or the component unmounts,
  // instead of discarding it.
  useEffect(() => {
    isMountedRef.current = true

    const flushPending = () => {
      if (!hasPendingSaveRef.current) return
      hasPendingSaveRef.current = false
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      void performSaveRef.current(contentRef.current, { keepalive: true })
    }

    window.addEventListener('pagehide', flushPending)
    return () => {
      window.removeEventListener('pagehide', flushPending)
      isMountedRef.current = false
      flushPending()
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
    clearLocalDraft,
  }
}
