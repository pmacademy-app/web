/**
 * Console guard allowlist (AG-06 / CQ-32).
 *
 * Tracks test suites with legacy hand-rolled mocks that trip the vitest.setup.ts
 * "is not a function" console guard. This list is shrink-only:
 * - MAX_ENTRIES is pinned and can only be decreased.
 * - Every entry has a strict "fix by" date that must be in the future.
 * - Test suites migrated to SupabaseFake must be removed from this list.
 */

export interface ConsoleGuardAllowlistEntry {
  /** Relative path or file name of the test suite. */
  file: string
  /** ISO date string (YYYY-MM-DD) by which the suite must be fixed. */
  fixBy: string
  /** Reason for the temporary exemption. */
  reason: string
}

let isErrorsAllowed = false

/**
 * Explicit test-level opt-out for tests that intentionally test error degradation.
 */
export function allowConsoleErrors(): () => void {
  isErrorsAllowed = true
  return () => {
    isErrorsAllowed = false
  }
}

export function isConsoleErrorsAllowed(): boolean {
  return isErrorsAllowed
}

export function resetConsoleErrorsAllowed(): void {
  isErrorsAllowed = false
}

/**
 * Pinned maximum number of allowed entries.
 * Lowering MAX_ENTRIES is the only permitted modification.
 */
export const MAX_ENTRIES = 0

/**
 * Shrink-only allowlist of legacy suites.
 */
export const CONSOLE_GUARD_ALLOWLIST: readonly ConsoleGuardAllowlistEntry[] = []

/**
 * Returns true if the test file is currently allowlisted.
 */
export function isConsoleGuardAllowlisted(testPath: string): boolean {
  if (!testPath) return false
  const normalized = testPath.replace(/\\/g, '/')
  return CONSOLE_GUARD_ALLOWLIST.some((entry) => {
    const entryNorm = entry.file.replace(/\\/g, '/')
    return normalized.endsWith(entryNorm) || normalized.includes(entryNorm)
  })
}
