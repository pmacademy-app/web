import { logSystemError } from '@/lib/monitoring/logger'
import { evaluatePersistentRateLimit } from '@/lib/rate-limit'

export interface TurnstileVerificationSuccess {
  success: true
  challengeTs?: string
  hostname?: string
}

export interface TurnstileVerificationFailure {
  success: false
  code: 'CAPTCHA_FAILED' | 'CAPTCHA_UNAVAILABLE'
  errorCodes?: string[]
  isTimeout?: boolean
}

export type TurnstileVerificationResult =
  | TurnstileVerificationSuccess
  | TurnstileVerificationFailure

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const VERIFY_TIMEOUT_MS = 5000

/**
 * Platform-wide ceiling on outbound Siteverify calls (B-TS/F-06).
 *
 * The per-IP signup limiter caps a single source, but it cannot cap a distributed
 * campaign: every rotated address buys a fresh budget, and each attempt that reaches
 * this module holds a serverless invocation for up to VERIFY_TIMEOUT_MS waiting on
 * Cloudflare. The cost is function-time amplification rather than provider credit, so
 * one constant key — which no rotation can escape — is the control that actually
 * bounds it.
 *
 * 500/hour is deliberately generous: the busiest observed organic day before the
 * 2026-09-06 incident was 49 signups, and the downstream signup ceiling is
 * max(15, dailyEmailLimit/24) per hour, so real traffic never approaches this. It caps
 * the worst case at roughly 500 x 5s of blocked invocation time per hour.
 *
 * Fail-closed, for the same reason the signup limiters are: a limiter outage must not
 * reopen an amplification path.
 */
const SITEVERIFY_BUDGET_KEY = 'turnstile_siteverify_global'
const SITEVERIFY_BUDGET = { windowMs: 60 * 60 * 1000, limit: 500, failClosed: true }

/**
 * Consumes one unit of the platform-wide Siteverify budget.
 *
 * Callers must invoke this immediately before `verifyTurnstileToken()` and refuse the
 * request when it returns `false`, so an exhausted budget never reaches Cloudflare.
 */
export async function evaluateSiteverifyBudget(): Promise<{ success: boolean; resetInMs: number }> {
  const result = await evaluatePersistentRateLimit(SITEVERIFY_BUDGET_KEY, SITEVERIFY_BUDGET)
  return { success: result.success, resetInMs: result.resetInMs }
}

/**
 * Cloudflare's `remoteip` field must be a real client address. `getClientIpBucket()`
 * returns the sentinel `'unresolved'` when no trusted address could be derived, and
 * forwarding that string makes Siteverify answer `bad-request` — which this module
 * would then report to the learner as a failed challenge they can never pass. Anything
 * that is not recognisably an address is dropped and the field is simply omitted.
 */
function normalizeRemoteIp(clientIp: unknown): string | null {
  if (typeof clientIp !== 'string') return null
  const candidate = clientIp.trim()
  if (!candidate || candidate.length > 64) return null
  const isIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(candidate)
  const isIpv6 = /^[0-9a-f:]+$/i.test(candidate) && candidate.includes(':')
  return isIpv4 || isIpv6 ? candidate : null
}

/**
 * Verifies a Cloudflare Turnstile token server-side.
 *
 * Security invariants:
 * - Single-use token: 0 retries on timeout/failure to avoid token duplication or latency amplification.
 * - Production: fail-closed if secret is missing or verification is unavailable.
 * - Explicit dev bypass: only honoured if NODE_ENV !== 'production' and DEV_TURNSTILE_BYPASS === 'true'.
 * - Redaction: secret keys and raw challenge tokens are never logged.
 */
export async function verifyTurnstileToken(
  token: unknown,
  clientIp?: string
): Promise<TurnstileVerificationResult> {
  // 1. Validation: Token must be a non-empty string
  if (typeof token !== 'string' || !token.trim()) {
    return {
      success: false,
      code: 'CAPTCHA_FAILED',
      errorCodes: ['missing-input-response'],
    }
  }

  // 2. Explicit Development Bypass: only effective outside of production
  if (process.env.NODE_ENV !== 'production' && process.env.DEV_TURNSTILE_BYPASS === 'true') {
    console.warn('[turnstile] WARNING: DEV_TURNSTILE_BYPASS is active. Bypassing Turnstile challenge verification.')
    return { success: true }
  }

  // 3. Server Secret Verification
  const secretKey = process.env.TURNSTILE_SECRET_KEY

  if (!secretKey) {
    // Missing secret in production is a critical system configuration failure
    if (process.env.NODE_ENV === 'production') {
      try {
        await logSystemError({
          severity: 'critical',
          category: 'auth',
          operation: 'auth.turnstile_verify',
          message: 'TURNSTILE_SECRET_KEY is missing in production environment. Registration requests failing closed.',
          details: { clientIp: clientIp ? '[present]' : '[absent]' },
        })
      } catch {
        // Never let logging failure break error flow
      }
      return {
        success: false,
        code: 'CAPTCHA_UNAVAILABLE',
        errorCodes: ['missing-secret-key'],
      }
    }

    // In local dev/test without secret or dummy key, fail closed
    console.error('[turnstile] TURNSTILE_SECRET_KEY is not configured.')
    return {
      success: false,
      code: 'CAPTCHA_UNAVAILABLE',
      errorCodes: ['missing-secret-key'],
    }
  }

  // 4. Request Cloudflare Siteverify
  const formData = new URLSearchParams()
  formData.append('secret', secretKey)
  formData.append('response', token.trim())
  const remoteIp = normalizeRemoteIp(clientIp)
  if (remoteIp) {
    formData.append('remoteip', remoteIp)
  }

  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    })

    if (!response.ok) {
      try {
        await logSystemError({
          severity: 'error',
          category: 'auth',
          operation: 'auth.turnstile_verify',
          message: `Cloudflare Turnstile siteverify responded with HTTP status ${response.status}`,
          details: {
            status: response.status,
            statusText: response.statusText,
          },
        })
      } catch {
        // Fall through
      }

      return {
        success: false,
        code: 'CAPTCHA_UNAVAILABLE',
        errorCodes: [`http-status-${response.status}`],
      }
    }

    const data = await response.json().catch(() => null)

    if (!data || typeof data !== 'object') {
      return {
        success: false,
        code: 'CAPTCHA_UNAVAILABLE',
        errorCodes: ['invalid-json-response'],
      }
    }

    if (data.success === true) {
      return {
        success: true,
        challengeTs: typeof data.challenge_ts === 'string' ? data.challenge_ts : undefined,
        hostname: typeof data.hostname === 'string' ? data.hostname : undefined,
      }
    }

    const errorCodes = Array.isArray(data['error-codes'])
      ? data['error-codes'].map(String)
      : []

    return {
      success: false,
      code: 'CAPTCHA_FAILED',
      errorCodes,
    }
  } catch (error: unknown) {
    const isTimeout =
      error instanceof Error &&
      (error.name === 'TimeoutError' || error.name === 'AbortError' || error.message.toLowerCase().includes('timeout'))

    try {
      await logSystemError({
        severity: isTimeout ? 'warning' : 'error',
        category: 'auth',
        operation: 'auth.turnstile_verify',
        message: isTimeout
          ? 'Cloudflare Turnstile siteverify request timed out (>5000ms)'
          : `Cloudflare Turnstile siteverify network failure: ${error instanceof Error ? error.message : String(error)}`,
        details: {
          isTimeout,
          errorName: error instanceof Error ? error.name : 'UnknownError',
        },
      })
    } catch {
      // Fall through
    }

    return {
      success: false,
      code: 'CAPTCHA_UNAVAILABLE',
      isTimeout,
      errorCodes: [isTimeout ? 'timeout' : 'network-error'],
    }
  }
}
