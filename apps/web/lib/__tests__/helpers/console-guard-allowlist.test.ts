import { describe, it, expect } from 'vitest'
import {
  CONSOLE_GUARD_ALLOWLIST,
  MAX_ENTRIES,
  isConsoleGuardAllowlisted,
  allowConsoleErrors,
  isConsoleErrorsAllowed,
  resetConsoleErrorsAllowed,
} from './console-guard-allowlist'

describe('console guard allowlist', () => {
  it('does not exceed pinned MAX_ENTRIES', () => {
    expect(CONSOLE_GUARD_ALLOWLIST.length).toBeLessThanOrEqual(MAX_ENTRIES)
  })

  it('has valid future fixBy dates and non-empty reasons for every entry', () => {
    const now = Date.now()
    for (const entry of CONSOLE_GUARD_ALLOWLIST) {
      expect(typeof entry.file).toBe('string')
      expect(entry.file.length).toBeGreaterThan(0)

      expect(typeof entry.reason).toBe('string')
      expect(entry.reason.length).toBeGreaterThan(0)

      const fixByTime = new Date(entry.fixBy).getTime()
      expect(Number.isNaN(fixByTime)).toBe(false)
      expect(fixByTime).toBeGreaterThan(now)
    }
  })

  it('correctly matches allowlisted files by path suffix or inclusion', () => {
    expect(isConsoleGuardAllowlisted('')).toBe(false)
    expect(isConsoleGuardAllowlisted('some/random/unlisted/test.ts')).toBe(false)
  })

  it('allowConsoleErrors opt-out correctly sets and resets error tolerance flag', () => {
    resetConsoleErrorsAllowed()
    expect(isConsoleErrorsAllowed()).toBe(false)

    const restore = allowConsoleErrors()
    expect(isConsoleErrorsAllowed()).toBe(true)

    restore()
    expect(isConsoleErrorsAllowed()).toBe(false)
  })

  it('allows console errors when explicitly opted out', () => {
    allowConsoleErrors()
    console.error('simulated mock: obj.missing is not a function')
  })
})
