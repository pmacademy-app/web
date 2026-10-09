/**
 * Deferred Quick Start launch (Growth R1, Task 5).
 *
 * The entrance auto-launch stays off (`QUICK_START_AUTO_LAUNCH_ENABLED = false`). Instead,
 * closing the first-lesson celebration queues the tour, and it opens on the next page that is
 * not a lesson — in this session or a later one, at most once per browser session.
 *
 * - The pending flag lives in localStorage so it survives a full reload or a new tab.
 * - The once-per-session key lives in sessionStorage.
 *
 * Framework-agnostic: no React, no Next imports. Every storage access is guarded, because
 * reading `window.localStorage` can itself throw (blocked site data, some private modes),
 * and none of this is worth breaking a page for — on failure the tour simply does not open.
 */

export const QUICK_START_PENDING_KEY = 'prodily_quick_start_pending'
export const QUICK_START_AUTO_SHOWN_KEY = 'prodily_quick_start_auto_shown'

type StorageKind = 'localStorage' | 'sessionStorage'

function getStorage(kind: StorageKind): Storage | null {
  try {
    if (typeof window === 'undefined' || !window) return null
    return window[kind] ?? null
  } catch {
    return null
  }
}

function readItem(kind: StorageKind, key: string): string | null {
  try {
    return getStorage(kind)?.getItem(key) ?? null
  } catch {
    return null
  }
}

function writeItem(kind: StorageKind, key: string, value: string): void {
  try {
    getStorage(kind)?.setItem(key, value)
  } catch {
    // Storage unavailable or full — the deferred launch is best-effort.
  }
}

function removeItem(kind: StorageKind, key: string): void {
  try {
    getStorage(kind)?.removeItem(key)
  } catch {
    // Storage unavailable — nothing to clear.
  }
}

/** Mark the tour as waiting to open on the next non-lesson page. */
export function queueDeferredQuickStart(): void {
  writeItem('localStorage', QUICK_START_PENDING_KEY, '1')
}

/**
 * True for a lesson page: `/academy/<moduleSlug>/<lessonId>` or `/academy/l/<lessonId>`.
 * `/academy` and `/academy/<moduleSlug>` are not lesson pages.
 */
export function isLessonPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  const segments = pathname.split('/').filter(Boolean)
  if (segments[0] !== 'academy') return false
  // `/academy/l/<lessonId>` and `/academy/<moduleSlug>/<lessonId>` both have two segments
  // after `/academy`; deeper paths are future lesson sub-routes and count as lesson pages.
  return segments.length >= 3
}

export interface DeferredLaunchState {
  pathname: string | null | undefined
  isOpen: boolean
  completed: boolean
}

/**
 * Whether the queued tour should open now: it is pending, the learner is not on a lesson
 * page, the tour is not already open, it was never skipped/finished, and it has not been
 * shown in this browser session.
 */
export function shouldLaunchDeferredQuickStart({ pathname, isOpen, completed }: DeferredLaunchState): boolean {
  if (isOpen || completed) return false
  if (isLessonPath(pathname)) return false
  if (readItem('localStorage', QUICK_START_PENDING_KEY) !== '1') return false
  if (readItem('sessionStorage', QUICK_START_AUTO_SHOWN_KEY) !== null) return false
  return true
}

/** Clear the pending flag and mark the tour as shown for this session. */
export function consumeDeferredQuickStart(): void {
  clearDeferredQuickStart()
  writeItem('sessionStorage', QUICK_START_AUTO_SHOWN_KEY, '1')
}

/**
 * Drop a queued launch without marking the session — used once the tour was opened by any
 * route, skipped, or finished, so a stale flag never resurfaces it later.
 */
export function clearDeferredQuickStart(): void {
  removeItem('localStorage', QUICK_START_PENDING_KEY)
}
