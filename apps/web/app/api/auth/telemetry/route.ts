import { logSystemError, type ErrorSeverity } from '@/lib/monitoring/logger'
import type { AuthErrorCode } from '@/lib/auth/errors'

export const runtime = 'nodejs'

const ALLOWED_ERROR_CODES = new Set<AuthErrorCode>([
  'AUTH_INVALID_CREDENTIALS',
  'AUTH_EMAIL_NOT_CONFIRMED',
  'AUTH_USER_ALREADY_EXISTS',
  'AUTH_PASSWORD_TOO_WEAK',
  'AUTH_NETWORK_ERROR',
  'AUTH_PROVIDER_UNAVAILABLE',
  'AUTH_RATE_LIMITED',
  'AUTH_SESSION_SYNC_FAILED',
  'AUTH_UNKNOWN_ERROR',
])

const ALLOWED_AUTH_ACTIONS = new Set([
  'login',
  'signup',
  'verify',
  'reset_password',
  'resend_verification',
  'session_sync',
])

const ALLOWED_BROWSERS = new Set(['chrome', 'firefox', 'safari', 'edge', 'other'])

interface ValidatedTelemetryPayload {
  errorCode: AuthErrorCode
  authAction: string
  isNetworkError?: boolean
  browserFamily?: 'chrome' | 'firefox' | 'safari' | 'edge' | 'other'
  onlineState?: boolean
}

function validateTelemetryPayload(data: unknown): ValidatedTelemetryPayload | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null
  }

  const obj = data as Record<string, unknown>
  if (typeof obj.errorCode !== 'string' || !ALLOWED_ERROR_CODES.has(obj.errorCode as AuthErrorCode)) {
    return null
  }

  if (typeof obj.authAction !== 'string' || !ALLOWED_AUTH_ACTIONS.has(obj.authAction)) {
    return null
  }

  const browserFamily =
    typeof obj.browserFamily === 'string' && ALLOWED_BROWSERS.has(obj.browserFamily)
      ? (obj.browserFamily as 'chrome' | 'firefox' | 'safari' | 'edge' | 'other')
      : undefined

  return {
    errorCode: obj.errorCode as AuthErrorCode,
    authAction: obj.authAction,
    isNetworkError: typeof obj.isNetworkError === 'boolean' ? obj.isNetworkError : undefined,
    browserFamily,
    onlineState: typeof obj.onlineState === 'boolean' ? obj.onlineState : undefined,
  }
}

// In-memory sliding window rate limiter to protect the endpoint from denial-of-service/flooding
const ipRateLimitMap = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const windowMs = 60 * 1000
  const maxEventsPerWindow = 60

  const record = ipRateLimitMap.get(ip)
  if (!record || now > record.resetAt) {
    ipRateLimitMap.set(ip, { count: 1, resetAt: now + windowMs })
    return false
  }

  if (record.count >= maxEventsPerWindow) {
    return true
  }

  record.count += 1
  return false
}

// Cleanup stale rate limit records periodically
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [ip, record] of ipRateLimitMap.entries()) {
      if (now > record.resetAt) {
        ipRateLimitMap.delete(ip)
      }
    }
  }, 5 * 60 * 1000).unref?.()
}

/**
 * Derives appropriate SystemError severity from Auth error code.
 */
function deriveSeverity(errorCode: AuthErrorCode): ErrorSeverity {
  switch (errorCode) {
    case 'AUTH_PROVIDER_UNAVAILABLE':
      return 'critical'
    case 'AUTH_NETWORK_ERROR':
    case 'AUTH_SESSION_SYNC_FAILED':
    case 'AUTH_UNKNOWN_ERROR':
      return 'error'
    case 'AUTH_RATE_LIMITED':
    case 'AUTH_USER_ALREADY_EXISTS':
    case 'AUTH_INVALID_CREDENTIALS':
    case 'AUTH_PASSWORD_TOO_WEAK':
    case 'AUTH_EMAIL_NOT_CONFIRMED':
    default:
      return 'warning'
  }
}

export async function POST(request: Request) {
  // 1. IP extraction & rate limiting check
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'anonymous_client'

  if (isRateLimited(ip)) {
    return Response.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  // 2. Parse and validate JSON payload
  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON payload' }, { status: 400 })
  }

  const payload = validateTelemetryPayload(rawBody)
  if (!payload) {
    return Response.json({ error: 'Invalid telemetry payload schema' }, { status: 400 })
  }

  const { errorCode, authAction, isNetworkError, browserFamily, onlineState } = payload
  const severity = deriveSeverity(errorCode)

  // 3. Log to system_errors infrastructure with safe sanitized metadata
  try {
    const errorId = await logSystemError({
      severity,
      category: 'auth',
      operation: authAction,
      message: `Authentication error ${errorCode} during ${authAction}`,
      details: {
        errorCode,
        authAction,
        isNetworkError: Boolean(isNetworkError),
        browserFamily: browserFamily || 'other',
        onlineState: onlineState ?? true,
      },
    })

    return Response.json({ success: true, errorId }, { status: 200 })
  } catch (err) {
    console.warn('[auth-telemetry] Internal logging exception:', err)
    return Response.json({ success: false }, { status: 500 })
  }
}
