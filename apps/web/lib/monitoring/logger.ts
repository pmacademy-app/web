import crypto from 'crypto'

import { sanitizeErrorMessage as redactText, sanitizeStructuredPayload } from './redaction'
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
 * Redaction lives in `./redaction` so there is exactly ONE implementation shared by
 * the logger, the queue, and anything else that persists diagnostic payloads.
 * Re-exported here because existing call sites and tests import it from this module.
 */
export { sanitizeErrorMessage, maskEmailAddress, maskEmailsInText } from './redaction'

/**
 * Recursively sanitizes a details payload before persistence.
 *
 * Redacts by value shape AND by key name — a token in an unanticipated format is
 * still caught because of where it sits in the object.
 */
export function sanitizeDetails(value: unknown): unknown {
  return sanitizeStructuredPayload(value)
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
 * Detects whether the current process is running in an automated test environment.
 * Checks Vitest, Jest, and NODE_ENV test markers.
 */
export function isTestEnvironment(): boolean {
  return (
    typeof process !== 'undefined' &&
    (process.env.NODE_ENV === 'test' ||
      process.env.VITEST === 'true' ||
      Boolean(process.env.VITEST) ||
      Boolean(process.env.VITEST_WORKER_ID) ||
      Boolean(process.env.JEST_WORKER_ID))
  )
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

    // In automated test environments, protect the production database from synthetic test telemetry.
    // Allow persistence ONLY if createServiceRoleClient is explicitly mocked/spied on in a test harness
    // or if test DB persistence is explicitly enabled.
    const isMocked =
      typeof createServiceRoleClient === 'function' &&
      ('_isMockFunction' in createServiceRoleClient ||
        'mock' in createServiceRoleClient ||
        'getMockName' in (createServiceRoleClient as unknown as Record<string, unknown>))

    if (isTestEnvironment() && !isMocked && process.env.ALLOW_TEST_SYSTEM_ERRORS !== 'true') {
      return `test_incident_${args.fingerprint.slice(0, 16)}`
    }

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
  if (isTestEnvironment() && process.env.ALLOW_TEST_ADMIN_NOTIFICATIONS !== 'true') {
    return
  }
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
  const summary = redactText(resolved.summary)
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
  const sanitizedMsg = redactText(options.message)
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
