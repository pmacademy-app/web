import { NextResponse } from 'next/server'

import { classifyAuthError, type AuthErrorContext } from '@/lib/auth/errors'
import type { ErrorDomain } from '@/lib/monitoring/error-taxonomy'
import { sanitizeErrorMessage } from '@/lib/monitoring/redaction'

/**
 * Shared API error response contract.
 *
 * The shape is deliberately ADDITIVE over what routes already returned. Clients read
 * `error` as a plain string and re-classify it (`app/(auth)/login/page.tsx` does
 * `classifyAuthError(new Error(json.error))`), and read `code` at the top level
 * (`json.code === 'SIGNUPS_DISABLED'`, `data.code === 'AUTH_RATE_LIMITED'`). Nesting
 * the error under `{ error: { code, message } }` would have been a cleaner greenfield
 * design, but it silently breaks every existing consumer — so `error` stays a string
 * and `success`/`code`/`errorId` are added alongside it.
 *
 * What callers must guarantee: `error` is copy we wrote, never text that came from an
 * exception, a provider, or the database.
 */
export interface ApiErrorBody {
  success: false
  /** Safe, user-facing message. Never a raw exception/provider/database string. */
  error: string
  /** Stable machine-readable code for client branching and support. */
  code: string
  /** Correlation id for an internal failure; quote it to support. */
  errorId?: string
  /** Route-specific additions (e.g. `requiresVerification`, `email`). */
  [key: string]: unknown
}

/**
 * Generic copy for an unexpected server-side failure.
 *
 * Phrased so it still classifies as AUTH_PROVIDER_UNAVAILABLE when a client feeds it
 * back through `classifyAuthError`, which keeps the auth screens showing a retryable
 * message instead of collapsing to AUTH_UNKNOWN_ERROR. Covered by a round-trip test.
 */
export const AUTH_SERVICE_UNAVAILABLE_MESSAGE =
  'The authentication service is temporarily unavailable. Please try again in a few moments.'

/** Generic copy for non-auth internal failures. */
export const GENERIC_SERVER_ERROR_MESSAGE =
  'Something went wrong on our side. Please try again in a moment.'

/** Builds an error response for a KNOWN, already-safe condition. */
export function apiError(options: {
  status: number
  code: string
  message: string
  errorId?: string
  extra?: Record<string, unknown>
}): NextResponse {
  const body: ApiErrorBody = {
    success: false,
    // Last line of defense. Callers are required to pass copy we wrote, but a single
    // careless caller would otherwise publish a secret to an unauthenticated client.
    // Static safe copy passes through unchanged, so this costs nothing when the
    // contract is honoured. `extra` is NOT sanitized — routes legitimately echo the
    // requester's own email there for the resend-verification flow.
    error: sanitizeErrorMessage(options.message),
    code: options.code,
    ...(options.errorId ? { errorId: options.errorId } : {}),
    ...(options.extra || {}),
  }
  return NextResponse.json(body, { status: options.status })
}

/**
 * Builds an error response for an UNEXPECTED exception.
 *
 * The exception never reaches the client. It is recorded as a structured incident and
 * the client receives generic copy plus an `errorId` that correlates to that incident,
 * so support can find the real cause without the cause being published.
 *
 * The id is generated locally rather than taken from the insert, so it still
 * correlates in logs when the incident write itself fails.
 */
export async function apiInternalError(options: {
  cause: unknown
  domain: ErrorDomain
  /** Stable operation name, e.g. 'auth.login'. */
  operation: string
  /** Stable one-line summary. No ids — see the taxonomy's fingerprint rules. */
  summary: string
  status?: number
  code?: string
  message?: string
  subject?: { userId?: string; maskedEmail?: string; templateKey?: string }
  extra?: Record<string, unknown>
}): Promise<NextResponse> {
  const errorId = `err_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`

  try {
    const { logErrorReport } = await import('@/lib/monitoring/logger')
    await logErrorReport({
      domain: options.domain,
      kind: 'unexpected',
      operation: options.operation,
      summary: options.summary,
      subject: options.subject,
      details: {
        errorId,
        // Sanitized by the logger before it is persisted.
        cause: options.cause instanceof Error
          ? `${options.cause.name}: ${options.cause.message}`
          : String(options.cause),
      },
    })
  } catch {
    // Never let instrumentation change the response the client receives.
  }

  return apiError({
    status: options.status ?? 500,
    code: options.code ?? 'SERVER_ERROR',
    message: options.message ?? GENERIC_SERVER_ERROR_MESSAGE,
    errorId,
    extra: options.extra,
  })
}

/**
 * Builds an error response from an auth-provider error, via the existing classifier.
 *
 * This is the integration point required so auth errors keep ONE classification
 * system: the provider's own message is never forwarded, but the classifier's typed
 * code and its safe copy are, which preserves the specific guidance the auth screens
 * show (weak password, account exists, rate limited) without leaking provider text.
 */
export function apiClassifiedAuthError(options: {
  cause: unknown
  context: AuthErrorContext
  status: number
  extra?: Record<string, unknown>
}): NextResponse {
  const classified = classifyAuthError(options.cause, options.context)
  return apiError({
    status: options.status,
    code: classified.code,
    message: classified.message,
    extra: options.extra,
  })
}

/**
 * Message for an **admin-facing** error response.
 *
 * Admin routes deliberately surface the underlying failure text — a bulk requeue that
 * the database refused is far more actionable with the Postgres error than with
 * "something went wrong", and P3 made several of these loud on purpose. That text is
 * still untrusted: a driver error can carry a connection string, and a provider error
 * can echo an API key.
 *
 * So admin routes sanitize rather than genericize. The operator keeps the diagnostic;
 * credentials, tokens and connection strings are redacted by the same rules that guard
 * `system_errors` (see ADR-005).
 *
 * Not for unauthenticated surfaces — those use `apiInternalError()`, which replaces the
 * message entirely and returns an `errorId`.
 */
export function adminErrorMessage(cause: unknown, fallback: string): string {
  const raw =
    cause instanceof Error
      ? cause.message
      : typeof cause === 'string'
        ? cause
        : ''
  const sanitized = sanitizeErrorMessage(raw).trim()
  return sanitized || fallback
}
