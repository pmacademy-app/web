/**
 * Client Authentication Telemetry (Phase 6).
 *
 * Lightweight, non-blocking telemetry client for logging classified authentication
 * failures to /api/auth/telemetry without collecting sensitive user PII, credentials,
 * or raw exception stack traces.
 */

import type { AuthErrorCode, ClassifiedAuthError } from './errors'

export type AuthTelemetryAction =
  | 'login'
  | 'signup'
  | 'verify'
  | 'reset_password'
  | 'resend_verification'
  | 'session_sync'

export interface AuthTelemetryPayload {
  errorCode: AuthErrorCode
  authAction: AuthTelemetryAction
  isNetworkError?: boolean
  browserFamily?: 'chrome' | 'firefox' | 'safari' | 'edge' | 'other'
  onlineState?: boolean
}

/**
 * Normalizes user-agent string into a coarse browser family.
 * Never collects full UA string or unique device identifiers.
 */
function getNormalizedBrowserFamily(): 'chrome' | 'firefox' | 'safari' | 'edge' | 'other' {
  if (typeof navigator === 'undefined' || !navigator.userAgent) {
    return 'other'
  }

  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('edg/')) return 'edge'
  if (ua.includes('chrome') && !ua.includes('edg/')) return 'chrome'
  if (ua.includes('safari') && !ua.includes('chrome')) return 'safari'
  if (ua.includes('firefox')) return 'firefox'
  return 'other'
}

/**
 * Asynchronously records an authentication telemetry event.
 * Guaranteed to never throw and never block the authentication UX.
 */
export function recordAuthTelemetry(
  error: ClassifiedAuthError,
  action: AuthTelemetryAction
): void {
  try {
    const payload: AuthTelemetryPayload = {
      errorCode: error.code,
      authAction: action,
      isNetworkError: error.isNetworkError,
      browserFamily: getNormalizedBrowserFamily(),
      onlineState: typeof navigator !== 'undefined' ? navigator.onLine : true,
    }

    const jsonString = JSON.stringify(payload)

    // 1. Prefer navigator.sendBeacon for lightweight, non-blocking delivery
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      try {
        const blob = new Blob([jsonString], { type: 'application/json' })
        const queued = navigator.sendBeacon('/api/auth/telemetry', blob)
        if (queued) return
      } catch {
        // Fallback to fetch
      }
    }

    // 2. Fallback to fetch with keepalive: true
    if (typeof fetch === 'function') {
      fetch('/api/auth/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: jsonString,
        keepalive: true,
      }).catch(() => {
        // Telemetry failure is completely silent and non-fatal
      })
    }
  } catch {
    // Top-level catch ensures telemetry can NEVER cause an auth failure
  }
}
