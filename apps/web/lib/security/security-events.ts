import { createHash } from 'node:crypto'
import { after } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase'

/**
 * Security event recording for the rule-based daily security summary.
 *
 * Failure and refusal paths (wrong password, rate limits, rejected Turnstile tokens,
 * bad webhook or cron credentials, cross-origin writes) call `recordSecurityEvent`,
 * which counts the event in `public.security_event_counts` through the
 * `record_security_event` RPC (held migration 20261119000007). The admin console
 * reads the counts and writes one summary per day. Event types and triggers are
 * listed in docs/SECURITY.md, section 4c.
 *
 * Contract for callers:
 *  - It never throws and never delays the response: the write is scheduled with
 *    `after()` inside a request scope, or runs as a detached promise outside one.
 *  - Nothing identifying is stored in the clear: the subject (email or user id) is
 *    reduced to a 16-hex sha256 prefix plus a masked hint, the IP to its network
 *    prefix, and the path loses its query string.
 *  - Until the migration is applied the RPC is missing; the first such error turns
 *    recording off for this process for 10 minutes, so logs are not flooded.
 */

/** Must equal the CHECK list in 20261119000007_security_events.sql (a test pins this). */
export const SECURITY_EVENT_TYPES = [
  'login_failed',
  'login_rate_limited',
  'admin_login_failed',
  'admin_login_rate_limited',
  'admin_login_non_admin',
  'signup_blocked',
  'turnstile_failed',
  'password_reset_requested',
  'password_reset_rate_limited',
  'origin_rejected',
  'webhook_auth_failed',
  'email_hook_auth_failed',
  'cron_auth_failed',
  'internal_revalidate_auth_failed',
  'client_errors_flood',
  'quiz_check_rate_limited',
] as const

export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number]

export interface SecurityEventDetails {
  /** The learner repo only records for itself; the admin console records `admin` on its side. */
  app?: 'web'
  /** From `getClientIpBucket(request)`. Reduced to a network prefix before storage. */
  ipBucket?: string | null
  /** Email or user id. Hashed; an email also yields a masked hint. */
  subject?: string | null
  /** Request path. The query string and fragment are dropped. */
  path?: string | null
}

/** The RPC arguments, exactly as `record_security_event` takes them. */
export interface SecurityEventPayload {
  p_event_type: SecurityEventType
  p_app: 'web' | 'admin'
  p_ip_bucket: string
  p_subject_hash: string
  p_subject_hint: string | null
  p_path: string | null
}

const KNOWN_TYPES: ReadonlySet<string> = new Set(SECURITY_EVENT_TYPES)
const MISSING_RPC_CODES = new Set(['PGRST202', '42883'])
export const MISSING_RPC_BACKOFF_MS = 10 * 60 * 1000
const WARN_INTERVAL_MS = 60 * 1000

let disabledUntil = 0
let lastWarnAt = 0

/** First 16 hex chars of sha256(lower(trim(subject))), or '' when there is no subject. */
export function hashSecuritySubject(subject: string | null | undefined): string {
  const normalized = (subject ?? '').trim().toLowerCase()
  if (!normalized) return ''
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16)
}

/** `jane@gmail.com` becomes `j***@gmail.com`. Anything that is not an email has no hint. */
export function securitySubjectHint(subject: string | null | undefined): string | null {
  const normalized = (subject ?? '').trim().toLowerCase()
  const match = /^([^@\s]+)@([^@\s]+\.[^@\s]+)$/.exec(normalized)
  if (!match) return null
  return `${match[1].charAt(0)}***@${match[2]}`.slice(0, 120)
}

/**
 * Reduces an address to its network: IPv4 to /24, IPv6 to /48. The rate-limit bucket
 * from `getClientIpBucket` is the full client address, which the digest does not need
 * and should not keep. `unresolved` and anything unrecognised pass through as a label.
 */
export function toSecurityIpBucket(ipBucket: string | null | undefined): string {
  const value = (ipBucket ?? '').trim().toLowerCase()
  if (!value) return ''
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(value)
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`
  if (value.includes(':') && /^[0-9a-f:]+$/.test(value)) {
    const [head] = value.split('::')
    const groups = head.split(':').filter(Boolean)
    const prefix = [...groups, '0', '0', '0'].slice(0, 3).join(':')
    return `${prefix}::/48`
  }
  return /^[a-z0-9_-]{1,32}$/.test(value) ? value : 'other'
}

/**
 * Path without query or fragment, at most 200 characters, or null. A full URL (callers
 * may pass `request.url`) is reduced to its pathname, so the host is not stored either.
 */
export function toSecurityPath(path: string | null | undefined): string | null {
  let value = (path ?? '').trim()
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    try {
      value = new URL(value).pathname
    } catch {
      return null
    }
  }
  const bare = value.split(/[?#]/, 1)[0]
  return bare ? bare.slice(0, 200) : null
}

export function buildSecurityEventPayload(
  type: SecurityEventType,
  details: SecurityEventDetails = {}
): SecurityEventPayload {
  return {
    p_event_type: type,
    p_app: details.app ?? 'web',
    p_ip_bucket: toSecurityIpBucket(details.ipBucket).slice(0, 64),
    p_subject_hash: hashSecuritySubject(details.subject),
    p_subject_hint: securitySubjectHint(details.subject),
    p_path: toSecurityPath(details.path),
  }
}

function warnOnce(message: string, code: string | undefined): void {
  const now = Date.now()
  if (now - lastWarnAt < WARN_INTERVAL_MS) return
  lastWarnAt = now
  // Event type and error code only: no subject, hint, IP or provider text.
  console.warn(`[security-events] ${message}`, code ? { code } : {})
}

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: { code?: string } | null }>
}

async function send(payload: SecurityEventPayload): Promise<void> {
  try {
    const client = createServiceRoleClient() as unknown as RpcClient
    const { error } = await client.rpc('record_security_event', { ...payload })
    if (!error) return
    const code = typeof error.code === 'string' ? error.code : undefined
    if (code && MISSING_RPC_CODES.has(code)) {
      disabledUntil = Date.now() + MISSING_RPC_BACKOFF_MS
      warnOnce('record_security_event is not available (migration 20261119000007 not applied); paused for 10 minutes', code)
      return
    }
    warnOnce(`failed to record ${payload.p_event_type}`, code)
  } catch {
    warnOnce(`failed to record ${payload.p_event_type}`, undefined)
  }
}

/**
 * Counts one security event. Fire and forget: returns immediately, never throws.
 */
export function recordSecurityEvent(type: SecurityEventType, details: SecurityEventDetails = {}): void {
  try {
    if (!KNOWN_TYPES.has(type)) return
    if (Date.now() < disabledUntil) return
    const payload = buildSecurityEventPayload(type, details)
    const task = () => send(payload)
    try {
      // Runs after the response is sent, and keeps the invocation alive until it finishes.
      after(task)
    } catch {
      // Outside a request scope (a script, a test): run detached. `send` never rejects.
      void task()
    }
  } catch {
    // Instrumentation must never change the outcome it observes.
  }
}

/** Test hook: clears the missing-RPC pause and the warning throttle. */
export function resetSecurityEventsStateForTests(): void {
  disabledUntil = 0
  lastWarnAt = 0
}
