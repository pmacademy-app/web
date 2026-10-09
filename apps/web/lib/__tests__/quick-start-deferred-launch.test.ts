/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  QUICK_START_PENDING_KEY,
  QUICK_START_AUTO_SHOWN_KEY,
  queueDeferredQuickStart,
  isLessonPath,
  shouldLaunchDeferredQuickStart,
  consumeDeferredQuickStart,
  clearDeferredQuickStart,
} from '@/lib/quick-start/deferred-launch'

// Growth R1 / Task 5: the Quick Start tour is deferred until after the learner's first
// completed lesson, and opens on the next non-lesson page — at most once per session, and
// never after it was skipped or finished.

const base = { pathname: '/dashboard', isOpen: false, completed: false }

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('storage keys', () => {
  it('uses the agreed key names', () => {
    expect(QUICK_START_PENDING_KEY).toBe('prodily_quick_start_pending')
    expect(QUICK_START_AUTO_SHOWN_KEY).toBe('prodily_quick_start_auto_shown')
  })
})

describe('isLessonPath', () => {
  it.each([
    ['/academy', false],
    ['/academy/', false],
    ['/academy/foundations', false],
    ['/academy/foundations/', false],
    ['/academy/foundations/les_1', true],
    ['/academy/foundations/les_1/', true],
    ['/academy/l/les_1', true],
    ['/academy/l', false],
    ['/dashboard', false],
    ['/', false],
    ['/academy-old/foundations/les_1', false],
    // Future lesson sub-routes count as lesson pages.
    ['/academy/foundations/les_1/extra', true],
    ['/academy/l/les_1/notes', true],
  ])('%s → %s', (pathname, expected) => {
    expect(isLessonPath(pathname)).toBe(expected)
  })

  it('treats a missing pathname as not a lesson path', () => {
    expect(isLessonPath(null)).toBe(false)
    expect(isLessonPath(undefined)).toBe(false)
    expect(isLessonPath('')).toBe(false)
  })
})

describe('queueDeferredQuickStart', () => {
  it('persists the pending flag in localStorage', () => {
    queueDeferredQuickStart()
    expect(window.localStorage.getItem(QUICK_START_PENDING_KEY)).toBe('1')
  })
})

describe('shouldLaunchDeferredQuickStart', () => {
  it('is false when nothing is pending', () => {
    expect(shouldLaunchDeferredQuickStart(base)).toBe(false)
  })

  it('is true when pending, off a lesson page, closed, not completed, not shown this session', () => {
    queueDeferredQuickStart()
    expect(shouldLaunchDeferredQuickStart(base)).toBe(true)
  })

  it('is false on a lesson path', () => {
    queueDeferredQuickStart()
    expect(shouldLaunchDeferredQuickStart({ ...base, pathname: '/academy/foundations/les_1' })).toBe(false)
    expect(shouldLaunchDeferredQuickStart({ ...base, pathname: '/academy/l/les_1' })).toBe(false)
  })

  it('is true on the academy index and a module page', () => {
    queueDeferredQuickStart()
    expect(shouldLaunchDeferredQuickStart({ ...base, pathname: '/academy' })).toBe(true)
    expect(shouldLaunchDeferredQuickStart({ ...base, pathname: '/academy/foundations' })).toBe(true)
  })

  it('is false when the tour is already open', () => {
    queueDeferredQuickStart()
    expect(shouldLaunchDeferredQuickStart({ ...base, isOpen: true })).toBe(false)
  })

  it('is false when the tour was completed', () => {
    queueDeferredQuickStart()
    expect(shouldLaunchDeferredQuickStart({ ...base, completed: true })).toBe(false)
  })

  it('is false when already shown this session', () => {
    queueDeferredQuickStart()
    window.sessionStorage.setItem(QUICK_START_AUTO_SHOWN_KEY, '1')
    expect(shouldLaunchDeferredQuickStart(base)).toBe(false)
  })
})

describe('consumeDeferredQuickStart', () => {
  it('clears the pending flag and sets the once-per-session key', () => {
    queueDeferredQuickStart()
    consumeDeferredQuickStart()
    expect(window.localStorage.getItem(QUICK_START_PENDING_KEY)).toBeNull()
    expect(window.sessionStorage.getItem(QUICK_START_AUTO_SHOWN_KEY)).toBe('1')
    expect(shouldLaunchDeferredQuickStart(base)).toBe(false)
  })

  it('a later queue in the same session still does not relaunch', () => {
    queueDeferredQuickStart()
    consumeDeferredQuickStart()
    queueDeferredQuickStart()
    expect(shouldLaunchDeferredQuickStart(base)).toBe(false)
  })
})

describe('clearDeferredQuickStart', () => {
  it('drops the pending flag without marking the session', () => {
    queueDeferredQuickStart()
    clearDeferredQuickStart()
    expect(window.localStorage.getItem(QUICK_START_PENDING_KEY)).toBeNull()
    expect(window.sessionStorage.getItem(QUICK_START_AUTO_SHOWN_KEY)).toBeNull()
    expect(shouldLaunchDeferredQuickStart(base)).toBe(false)
  })
})

describe('storage failures', () => {
  it('helpers do not throw and return safe defaults when storage methods throw', () => {
    const boom = () => {
      throw new Error('SecurityError')
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(boom)

    expect(() => queueDeferredQuickStart()).not.toThrow()
    expect(() => consumeDeferredQuickStart()).not.toThrow()
    expect(() => clearDeferredQuickStart()).not.toThrow()
    expect(shouldLaunchDeferredQuickStart(base)).toBe(false)
  })

  it('helpers do not throw when the storage accessor itself throws', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new Error('SecurityError')
    })

    expect(() => queueDeferredQuickStart()).not.toThrow()
    expect(() => consumeDeferredQuickStart()).not.toThrow()
    expect(() => clearDeferredQuickStart()).not.toThrow()
    expect(shouldLaunchDeferredQuickStart(base)).toBe(false)
  })

  it('helpers are inert without a window (server render)', () => {
    vi.stubGlobal('window', undefined)

    expect(() => queueDeferredQuickStart()).not.toThrow()
    expect(() => consumeDeferredQuickStart()).not.toThrow()
    expect(() => clearDeferredQuickStart()).not.toThrow()
    expect(shouldLaunchDeferredQuickStart(base)).toBe(false)
  })
})
