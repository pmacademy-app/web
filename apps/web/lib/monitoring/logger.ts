import crypto from 'crypto'

import {
  categoryForReport,
  resolveErrorReport,
  type ErrorReport,
  type ErrorSeverity,
  type FailureKind,
  type ErrorDomain,
} from './error-taxonomy'

export type { ErrorSeverity }

/**
 * Legacy category union, kept because ~40 existing call sites pass it.
 * New code should call `logErrorReport()` with a typed `ErrorReport` instead.
 */
export type ErrorCategory =
  | 'auth'
  | 'verification'
  | 'queue'
  | 'resend'
  | 'brevo'
  | 'webhook'
  | 'cron'
  | 'system'
  | 'email'
  | 'admin'
  | 'db'
  | 'api'
  | 'config'

export interface LogSystemErrorOptions {
  severity: ErrorSeverity
  category: ErrorCategory
  operation: string
  message: string
  templateKey?: string
  queueId?: string
  resendId?: string
  userId?: string
  details?: Record<string, unknown>
}

/** Dedup window: repeats inside this window increment a counter instead of inserting. */
const DEDUP_WINDOW_MS = 15 * 60 * 1000

/** At most one admin alert per fingerprint per hour, however often it recurs. */
const ALERT_COOLDOWN_MS = 60 * 60 * 1000

/**
 * Secret patterns stripped from every message and every details value.
 *
 * Brevo is the primary provider and its key prefix (`xkeysib-`) was absent here, so a
 * provider error body that echoed the `api-key` header persisted a live production
 * credential into `system_errors`, readable by every admin.
 */
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/Bearer\s+[A-Za-z0-9\-\._~\+\/]+=*/gi, 'Bearer [REDACTED]'],
  [/(key|secret|token|password|auth|authorization)=['"]?[A-Za-z0-9\-\._~\+\/]+['"]?/gi, '$1=[REDACTED]'],
  [/whsec_[A-Za-z0-9\+\/]+/gi, 'whsec_[REDACTED]'],
  [/re_[A-Za-z0-9_]+/gi, 're_[REDACTED]'],
  // Brevo API keys and SMTP keys.
  [/xkeysib-[A-Za-z0-9\-_]+/gi, 'xkeysib-[REDACTED]'],
  [/xsmtpsib-[A-Za-z0-9\-_]+/gi, 'xsmtpsib-[REDACTED]'],
  // JWTs — Supabase anon/service-role keys are JWTs and must never be persisted.
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]'],
  [/v1,[A-Za-z0-9\+\/=]+/gi, 'v1,[REDACTED]'],
]

export function sanitizeErrorMessage(input: string): string {
  if (!input) return ''
  return SECRET_PATTERNS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), input)
}

/**
 * Recursively sanitizes a details payload.
 *
 * `details` was previously written to the database raw, so anything a caller happened
 * to include — a stringified request, a provider error body — bypassed redaction
 * entirely.
 */
export function sanitizeDetails(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]'
  if (typeof value === 'string') return sanitizeErrorMessage(value)
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitizeDetails(v, depth + 1))
  if (value instanceof Error) return sanitizeErrorMessage(`${value.name}: ${value.message}`)
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeDetails(v, depth + 1)
    }
    return out
  }
  return undefined
}

/**
 * Collapses volatile tokens so repeats of the same incident share a fingerprint.
 *
 * Legacy call sites interpolate ids and addresses into their message. Without this,
 * every occurrence hashes differently, dedup never matches, and one outage produces
 * one alert per affected user. Applied to the FINGERPRINT INPUT ONLY — the stored
 * message keeps its detail.
 */
export function stabilizeForFingerprint(input: string): string {
  return input
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '{uuid}')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '{email}')
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, '{timestamp}')
    .replace(/\b\d{4,}\b/g, '{n}')
    .trim()
}

function buildFingerprint(parts: string[]): string {
  return crypto.createHash('md5').update(parts.join(':')).digest('hex')
}

interface PersistArgs {
  severity: ErrorSeverity
  category: string
  domain: ErrorDomain | null
  kind: FailureKind | null
  retryability: string | null
  nextAction: string | null
  operation: string
  message: string
  fingerprint: string
  templateKey?: string
  queueId?: string
  resendId?: string
  userId?: string
  details?: Record<string, unknown>
}

/**
 * Writes one incident, deduplicating repeats inside the window.
 *
 * The previous lookup used `.maybeSingle()` on a filter that can legitimately match
 * many rows. PostgREST answers a multi-row `maybeSingle` with an error and null data;
 * the error was discarded, so `existing` came back null and a NEW row was inserted —
 * which made the next lookup match even more rows. Deduplication therefore stopped
 * working from the second occurrence onward, exactly during the sustained outages it
 * exists for. Ordering and taking one row cannot fail that way.
 */
async function persistIncident(args: PersistArgs): Promise<string | null> {
  try {
    const { createServiceRoleClient } = await import('@/lib/supabase')
    const supabase = createServiceRoleClient()
    const nowIso = new Date().toISOString()
    const windowStart = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString()

    const { data: recentRows, error: lookupErr } = await supabase
      .from('system_errors')
      .select('id, occurrence_count')
      .eq('fingerprint', args.fingerprint)
      .gte('timestamp', windowStart)
      .order('timestamp', { ascending: false })
      .limit(1)

    if (!lookupErr && recentRows && recentRows.length > 0) {
      const existing = recentRows[0] as { id: string; occurrence_count?: number | null }
      await supabase
        .from('system_errors')
        .update({
          occurrence_count: (existing.occurrence_count ?? 1) + 1,
          updated_at: nowIso,
        })
        .eq('id', existing.id)
      return existing.id
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('system_errors')
      .insert({
        severity: args.severity,
        category: args.category,
        domain: args.domain,
        kind: args.kind,
        retryability: args.retryability,
        next_action: args.nextAction,
        operation: args.operation,
        message: args.message,
        template_key: args.templateKey || null,
        queue_id: args.queueId || null,
        resend_id: args.resendId || null,
        user_id: args.userId || null,
        fingerprint: args.fingerprint,
        status: 'new',
        occurrence_count: 1,
        first_seen_at: nowIso,
        details: (args.details as unknown as import('@/lib/supabase').Json) || null,
      })
      .select('id')
      .maybeSingle()

    if (insertErr) {
      console.warn('[logSystemError] DB insert failed (table may be pending migration):', insertErr.message)
      return null
    }

    const incidentId = (inserted as { id: string } | null)?.id || null

    if (args.severity === 'critical' && incidentId) {
      await notifyAdminsOnce(supabase, args, incidentId)
    }

    return incidentId
  } catch (err) {
    console.warn('[logSystemError] Error logger invocation failed:', err)
    return null
  }
}

/**
 * Sends at most one admin in-app notification per fingerprint per hour.
 *
 * Previously every critical insert fanned out a notification to every admin, awaited
 * serially. Combined with the broken dedup above, a provider outage buried the signal
 * under hundreds of near-identical alerts.
 */
async function notifyAdminsOnce(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase').createServiceRoleClient>>,
  args: PersistArgs,
  incidentId: string
): Promise<void> {
  try {
    const cooldownStart = new Date(Date.now() - ALERT_COOLDOWN_MS).toISOString()
    const { data: priorRows } = await supabase
      .from('system_errors')
      .select('id')
      .eq('fingerprint', args.fingerprint)
      .gte('timestamp', cooldownStart)
      .neq('id', incidentId)
      .limit(1)

    // An earlier incident with this fingerprint already alerted within the cooldown.
    if (priorRows && priorRows.length > 0) return

    const { data: adminUsers } = await supabase.from('users').select('id').eq('is_admin', true)
    const adminList = (adminUsers || []) as unknown as Array<{ id: string }>
    if (adminList.length === 0) return

    const { createInAppNotification } = await import('@/lib/notifications/in-app/service')
    const title = `🚨 ${args.kind ? args.kind.replace(/_/g, ' ') : args.category.toUpperCase()}`
    const body = args.nextAction ? `${args.message} — ${args.nextAction}` : args.message

    await Promise.all(
      adminList.map((admin) =>
        createInAppNotification({
          userId: admin.id,
          category: 'security',
          title,
          body,
          actionUrl: '/admin/system',
        }).catch(() => {})
      )
    )
  } catch (adminNotifErr) {
    console.warn('[logSystemError] Non-fatal admin notification failure:', adminNotifErr)
  }
}

/**
 * Structured entry point. Severity is derived from `kind` — do not pass one in.
 *
 * `summary` must be a stable sentence with no ids in it; identifiers go in `subject`.
 */
export async function logErrorReport(report: ErrorReport): Promise<string | null> {
  const resolved = resolveErrorReport(report)
  const summary = sanitizeErrorMessage(resolved.summary)
  const category = categoryForReport(resolved)

  const fingerprint = buildFingerprint([
    resolved.domain,
    resolved.kind,
    resolved.operation,
    stabilizeForFingerprint(summary),
  ])

  const details = sanitizeDetails({
    ...(resolved.details || {}),
    ...(resolved.provider
      ? {
          provider: resolved.provider.name,
          providerStatusCode: resolved.provider.statusCode,
          providerExternalId: resolved.provider.externalId,
          providerAttempt: resolved.provider.attempt,
        }
      : {}),
    ...(resolved.subject?.maskedEmail ? { maskedEmail: resolved.subject.maskedEmail } : {}),
    ...(resolved.subject?.broadcastId ? { broadcastId: resolved.subject.broadcastId } : {}),
    ...(resolved.allProvidersFailed ? { allProvidersFailed: true } : {}),
  }) as Record<string, unknown>

  console.error(
    `[SystemError:${resolved.severity.toUpperCase()}:${resolved.domain}/${resolved.kind}] ${resolved.operation} - ${summary}`
  )

  return persistIncident({
    severity: resolved.severity,
    category,
    domain: resolved.domain,
    kind: resolved.kind,
    retryability: resolved.retryability,
    nextAction: resolved.nextAction,
    operation: resolved.operation,
    message: summary,
    fingerprint,
    templateKey: resolved.subject?.templateKey,
    queueId: resolved.subject?.queueId,
    resendId: resolved.provider?.externalId,
    userId: resolved.subject?.userId,
    details,
  })
}

/**
 * Structured System Error Logger (legacy signature).
 *
 * Retained so the existing call sites keep working unchanged. New instrumentation
 * should use `logErrorReport()`, which derives severity and keeps summaries stable.
 */
export async function logSystemError(options: LogSystemErrorOptions): Promise<string | null> {
  const sanitizedMsg = sanitizeErrorMessage(options.message)
  const fingerprint = buildFingerprint([
    options.category,
    options.operation,
    stabilizeForFingerprint(sanitizedMsg),
  ])

  console.error(
    `[SystemError:${options.severity.toUpperCase()}:${options.category}] ${options.operation} - ${sanitizedMsg}`
  )

  return persistIncident({
    severity: options.severity,
    category: options.category,
    domain: null,
    kind: null,
    retryability: null,
    nextAction: null,
    operation: options.operation,
    message: sanitizedMsg,
    fingerprint,
    templateKey: options.templateKey,
    queueId: options.queueId,
    resendId: options.resendId,
    userId: options.userId,
    details: sanitizeDetails(options.details) as Record<string, unknown> | undefined,
  })
}
