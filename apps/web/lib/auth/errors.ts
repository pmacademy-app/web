/**
 * Centralized Authentication Error Classifier (Phase 4).
 *
 * Maps raw browser network exceptions, Supabase Auth errors, and session
 * synchronization failures into typed, non-leaking, user-friendly error objects.
 * Designed to be reusable by Phase 6 Auth Telemetry.
 */

export type AuthErrorCode =
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_EMAIL_NOT_CONFIRMED'
  | 'AUTH_USER_ALREADY_EXISTS'
  | 'AUTH_PASSWORD_TOO_WEAK'
  | 'AUTH_NETWORK_ERROR'
  | 'AUTH_PROVIDER_UNAVAILABLE'
  | 'AUTH_RATE_LIMITED'
  | 'AUTH_SESSION_SYNC_FAILED'
  | 'AUTH_CAPTCHA_FAILED'
  | 'AUTH_UNKNOWN_ERROR'

/** Every code this classifier can produce, for validating a server-supplied code. */
export const AUTH_ERROR_CODES = new Set<string>([
  'AUTH_INVALID_CREDENTIALS',
  'AUTH_EMAIL_NOT_CONFIRMED',
  'AUTH_USER_ALREADY_EXISTS',
  'AUTH_PASSWORD_TOO_WEAK',
  'AUTH_NETWORK_ERROR',
  'AUTH_PROVIDER_UNAVAILABLE',
  'AUTH_RATE_LIMITED',
  'AUTH_SESSION_SYNC_FAILED',
  'AUTH_CAPTCHA_FAILED',
  'AUTH_UNKNOWN_ERROR',
])

export interface ClassifiedAuthError {
  /** Machine-readable error code suitable for telemetry and UI branching. */
  code: AuthErrorCode
  /** Safe, localized user-facing message free of internal stack traces and tokens. */
  message: string
  /** Whether the operation can be retried immediately or after a short delay. */
  retryable: boolean
  /** Whether the error is related to network connectivity. */
  isNetworkError: boolean
  /** Specific guidance action if needed. */
  requiresAction?: 'verify_email' | 'login' | 'reset_password' | 'wait'
  /** Sanitized error name or original code for internal diagnostic logging (never rendered to UI). */
  rawCode?: string
  /** Support correlation id returned by the API for an unexpected server failure. */
  errorId?: string
}

/**
 * Common network failure substrings from various browsers and HTTP clients.
 */
const NETWORK_ERROR_PATTERNS = [
  'failed to fetch',
  'networkerror',
  'network error',
  'load failed',
  'aborterror',
  'abort error',
  'fetch failed',
  'econnrefused',
  'econnreset',
  'etimedout',
  'enotfound',
  'socket hang up',
  'net::err_',
  'the request timed out',
  'timeout',
]

/**
 * Checks if an error message or name indicates a client-side or connectivity network failure.
 */
export function isNetworkFailure(error: unknown): boolean {
  if (!error) return false

  if (typeof error === 'string') {
    const lower = error.toLowerCase()
    return NETWORK_ERROR_PATTERNS.some((pattern) => lower.includes(pattern))
  }

  if (typeof error === 'object' && error !== null) {
    const err = error as { name?: string; message?: string; code?: string }
    const combined = `${err.name || ''} ${err.message || ''} ${err.code || ''}`.toLowerCase()

    if (err.name === 'AbortError' || err.name === 'NetworkError') {
      return true
    }

    return NETWORK_ERROR_PATTERNS.some((pattern) => combined.includes(pattern))
  }

  return false
}

export type AuthErrorContext =
  | 'login'
  | 'signup'
  | 'admin_login'
  | 'session_sync'
  | 'reset_password'
  | 'resend_verification'
  | 'verify'

/**
 * Classifies any auth error (from Supabase Auth, browser fetch, or session sync)
 * into a typed ClassifiedAuthError.
 */
export function classifyAuthError(
  error: unknown,
  context?: AuthErrorContext | string
): ClassifiedAuthError {
  if (!error) {
    return {
      code: 'AUTH_UNKNOWN_ERROR',
      message: 'An unexpected authentication error occurred. Please try again.',
      retryable: true,
      isNetworkError: false,
    }
  }

  // 1. Session synchronization specific context
  if (context === 'session_sync') {
    const isNet = isNetworkFailure(error)
    return {
      code: 'AUTH_SESSION_SYNC_FAILED',
      message: isNet
        ? 'Unable to synchronize your login session. Please check your internet connection and try again.'
        : 'Session synchronization failed. Please try logging in again.',
      retryable: true,
      isNetworkError: isNet,
      rawCode: extractErrorCode(error),
    }
  }

  // 2. Network / connectivity error detection
  if (isNetworkFailure(error)) {
    return {
      code: 'AUTH_NETWORK_ERROR',
      message:
        'Unable to connect to the authentication service. Please check your internet connection, disable any ad-blockers or restrictive privacy extensions, and try again.',
      retryable: true,
      isNetworkError: true,
      rawCode: extractErrorCode(error) || 'NETWORK_FAILURE',
    }
  }

  const rawMessage = extractErrorMessage(error).toLowerCase()
  const rawCode = extractErrorCode(error)

  // 3. Invalid credentials
  if (
    rawMessage.includes('invalid login credentials') ||
    rawMessage.includes('invalid credentials') ||
    rawMessage.includes('invalid username or password') ||
    rawMessage.includes('invalid email or password') ||
    rawMessage.includes('wrong password') ||
    (rawMessage.includes('user not found') && context !== 'signup')
  ) {
    return {
      code: 'AUTH_INVALID_CREDENTIALS',
      message: 'Invalid email or password. Please check your credentials and try again.',
      retryable: false,
      isNetworkError: false,
      rawCode: rawCode || 'invalid_credentials',
    }
  }

  // 4. Email not confirmed / verified
  if (
    rawMessage.includes('email not confirmed') ||
    rawMessage.includes('email_not_confirmed') ||
    rawMessage.includes('unconfirmed email') ||
    rawMessage.includes('please verify your email') ||
    rawMessage.includes('signup requires confirmation')
  ) {
    return {
      code: 'AUTH_EMAIL_NOT_CONFIRMED',
      message: 'Please verify your email address before logging in. Check your inbox (and spam folder) for the confirmation link.',
      retryable: false,
      isNetworkError: false,
      requiresAction: 'verify_email',
      rawCode: rawCode || 'email_not_confirmed',
    }
  }

  // 5. Existing user / account already exists
  if (
    rawMessage.includes('user already registered') ||
    rawMessage.includes('already registered') ||
    rawMessage.includes('already in use') ||
    rawMessage.includes('already exists') ||
    rawMessage.includes('user with this email already exists')
  ) {
    return {
      code: 'AUTH_USER_ALREADY_EXISTS',
      message: 'An account already exists with this email address. Please log in instead.',
      retryable: false,
      isNetworkError: false,
      requiresAction: 'login',
      rawCode: rawCode || 'user_already_exists',
    }
  }

  // 6. Weak password
  if (
    rawMessage.includes('password should be at least') ||
    rawMessage.includes('password is too weak') ||
    rawMessage.includes('weak password') ||
    rawMessage.includes('password must be') ||
    rawMessage.includes('password too short') ||
    // Idempotency: this classifier's OWN weak-password copy must re-classify to the
    // same code. API routes now return classified messages instead of raw provider
    // text, and the auth screens re-classify what they receive — without this the
    // specific password guidance would degrade to AUTH_UNKNOWN_ERROR on the client.
    rawMessage.includes('does not meet security requirements')
  ) {
    return {
      code: 'AUTH_PASSWORD_TOO_WEAK',
      message: 'Password does not meet security requirements. Please choose a password with at least 6 characters.',
      retryable: false,
      isNetworkError: false,
      rawCode: rawCode || 'weak_password',
    }
  }

  // 7. Rate limiting & security cooldowns
  const is429 =
    (typeof error === 'object' && error !== null && (
      (error as { status?: unknown }).status === 429 ||
      (error as { status?: unknown }).status === '429' ||
      (error as { statusCode?: unknown }).statusCode === 429 ||
      (error as { statusCode?: unknown }).statusCode === '429' ||
      (error as { code?: unknown }).code === 429 ||
      (error as { code?: unknown }).code === '429'
    )) ||
    rawCode === '429' ||
    rawCode === 'over_email_send_rate_limit' ||
    rawCode === 'over_request_rate_limit' ||
    rawCode === 'rate_limit' ||
    rawCode === 'rate_limit_exceeded'

  const hasRateLimitText =
    rawMessage.includes('too many') ||
    rawMessage.includes('rate limit') ||
    rawMessage.includes('rate_limit') ||
    rawMessage.includes('over_email_send_rate_limit') ||
    rawMessage.includes('over_request_rate_limit') ||
    rawMessage.includes('security purposes') ||
    rawMessage.includes('cooldown') ||
    (rawMessage.includes('please wait') && (rawMessage.includes('second') || rawMessage.includes('minute')))

  if (is429 || hasRateLimitText) {
    const secondsMatch = rawMessage.match(/(?:after|wait|every)\s+(\d+)\s+seconds?/i)
    const seconds = secondsMatch ? secondsMatch[1] : undefined
    const message = seconds
      ? `Please wait ${seconds} second${seconds === '1' ? '' : 's'} before trying again.`
      : 'Too many attempts. For your security, please wait a few moments before trying again.'

    return {
      code: 'AUTH_RATE_LIMITED',
      message,
      retryable: true,
      isNetworkError: false,
      requiresAction: 'wait',
      rawCode: rawCode || (is429 ? '429' : 'rate_limited'),
    }
  }

  // 8. Missing required email / input validation
  if (
    rawMessage.includes('email is required') ||
    rawMessage.includes('email address is required') ||
    rawMessage.includes('valid email address')
  ) {
    return {
      code: 'AUTH_UNKNOWN_ERROR',
      message: 'Please enter a valid email address.',
      retryable: true,
      isNetworkError: false,
      rawCode: rawCode || 'email_required',
    }
  }

  // 8b. Missing / expired recovery session (Supabase 'Auth session missing!' and related)
  // This occurs if auth.updateUser() is called without an active SDK session.
  // Surface it as an expired-link error rather than the generic AUTH_UNKNOWN_ERROR.
  if (
    rawMessage.includes('auth session missing') ||
    rawMessage.includes('session missing') ||
    rawMessage.includes('no session found') ||
    rawMessage.includes('not authenticated') ||
    rawMessage.includes('unauthenticated')
  ) {
    return {
      code: 'AUTH_UNKNOWN_ERROR',
      message: 'Your password reset session has expired. Please request a new reset link.',
      retryable: false,
      isNetworkError: false,
      requiresAction: 'reset_password',
      rawCode: rawCode || 'auth_session_missing',
    }
  }

  // 9. Provider / Service unavailable (502, 503, 504, 500 database error saving new user)
  if (
    rawMessage.includes('502') ||
    rawMessage.includes('503') ||
    rawMessage.includes('504') ||
    rawMessage.includes('bad gateway') ||
    rawMessage.includes('service unavailable') ||
    rawMessage.includes('gateway timeout') ||
    rawMessage.includes('database error saving new user') ||
    rawMessage.includes('internal server error') ||
    rawMessage.includes('auth provider unavailable') ||
    // Idempotency: matches this classifier's own service-unavailable copy, which API
    // routes return for unexpected auth failures.
    rawMessage.includes('service is temporarily unavailable')
  ) {
    return {
      code: 'AUTH_PROVIDER_UNAVAILABLE',
      message: 'The authentication service is temporarily unavailable. Please try again in a few moments.',
      retryable: true,
      isNetworkError: false,
      rawCode: rawCode || 'service_unavailable',
    }
  }

  // 10. Security verification / CAPTCHA failure
  if (
    rawMessage.includes('security verification') ||
    rawMessage.includes('verification challenge') ||
    rawMessage.includes('turnstile') ||
    rawMessage.includes('captcha')
  ) {
    return {
      code: 'AUTH_CAPTCHA_FAILED',
      message: 'Security verification failed. Please complete the verification challenge and try again.',
      retryable: true,
      isNetworkError: false,
      rawCode: rawCode || 'captcha_failed',
    }
  }

  // 11. Unknown / Unclassified error fallback
  return {
    code: 'AUTH_UNKNOWN_ERROR',
    message: 'An unexpected authentication error occurred. Please try again.',
    retryable: true,
    isNetworkError: false,
    rawCode: rawCode || 'unknown_error',
  }
}

/**
 * Extracts error message string from various error representations safely.
 */
function extractErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (typeof error === 'object' && error !== null) {
    const err = error as {
      message?: unknown
      error_description?: unknown
      error?: unknown
      msg?: unknown
      details?: unknown
    }
    if (typeof err.message === 'string') return err.message
    if (typeof err.error_description === 'string') return err.error_description
    if (typeof err.msg === 'string') return err.msg
    if (typeof err.error === 'string') return err.error
    if (typeof err.details === 'string') return err.details
  }
  return ''
}

/**
 * Extracts error code from various error representations safely.
 */
function extractErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null) {
    const err = error as {
      code?: unknown
      status?: unknown
      statusCode?: unknown
      error_code?: unknown
      name?: unknown
    }
    if (typeof err.code === 'string') return err.code
    if (typeof err.code === 'number') return String(err.code)
    if (typeof err.error_code === 'string') return err.error_code
    if (typeof err.status === 'number') return String(err.status)
    if (typeof err.status === 'string') return err.status
    if (typeof err.statusCode === 'number') return String(err.statusCode)
    if (typeof err.statusCode === 'string') return err.statusCode
    if (typeof err.name === 'string' && err.name !== 'Error') return err.name
  }
  return undefined
}


/**
 * Builds a ClassifiedAuthError from an API error response body.
 *
 * The auth screens previously re-derived the code by re-classifying the message
 * string. That still works — the API returns classifier copy and the classifier is
 * idempotent — but it is lossy: the server already decided the code, and reading it
 * back out of English is a round-trip that only holds while the copy matches a
 * pattern. When the server supplies one of our codes, trust it and keep its copy.
 *
 * `errorId` is carried through so an unexpected failure can be quoted to support.
 */
export function resolveApiAuthError(
  body: { error?: string; code?: string; errorId?: string } | null | undefined,
  context: AuthErrorContext,
  fallbackMessage = 'Something went wrong. Please try again.'
): ClassifiedAuthError {
  const message = body?.error || fallbackMessage
  const classified = classifyAuthError(new Error(message), context)

  const serverCode = body?.code
  if (serverCode === 'CAPTCHA_FAILED') {
    classified.code = 'AUTH_CAPTCHA_FAILED'
    classified.message = message
    classified.retryable = true
  } else if (serverCode === 'CAPTCHA_UNAVAILABLE') {
    classified.code = 'AUTH_PROVIDER_UNAVAILABLE'
    classified.message = message
    classified.retryable = true
  } else if (serverCode && AUTH_ERROR_CODES.has(serverCode)) {
    // The server already classified this. Trust its code and its copy.
    classified.code = serverCode as AuthErrorCode
    classified.message = message
  } else if (body?.error && serverCode) {
    // A platform code we do not own (VALIDATION, SIGNUPS_DISABLED, SERVER_ERROR).
    // Keep the server's message: it is more specific than the classifier's fallback,
    // and overwriting it turned "Password is required." into "An unexpected
    // authentication error occurred." Classification still supplies the code and the
    // retryable/requiresAction metadata the screens branch on.
    //
    // The presence of a `code` is the trust signal: it means the body came from the
    // shared API error contract, which sanitizes its message. A body with no code is
    // of unknown provenance, so its text is discarded in favour of safe copy.
    classified.message = body.error
  }

  if (body?.errorId) {
    classified.errorId = body.errorId
  }

  return classified
}
