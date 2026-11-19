import crypto from 'crypto'

import { adminSiteUrlFor } from '@/lib/admin-site'
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
  /** The caught value. When it is an Error with a stack, the redacted stack is stored. */
  error?: unknown
  /** A stack captured elsewhere (the browser beacon). Redacted and bounded here. */
  stack?: string
  /** Where the failure happened. Defaults to 'server'. */
  runtime?: MonitoringRuntime
  /** Release reported by the browser. Defaults to this server's commit. */
  release?: string
}

/** Which repo wrote the row. The admin repo writes 'admin' into the same table. */
export const MONITORING_APP = 'web'

export type MonitoringRuntime = 'server' | 'client'

/** Longest stored stack, after redaction. */
export const MAX_STACK_LENGTH = 4000

/** Most stack frames kept. The frames past this are almost always framework internals. */
export const MAX_STACK_FRAMES = 30

/** Release tags are the first 12 characters of the commit SHA. */
export const RELEASE_LENGTH = 12

/** `system_settings` key holding the admin-managed list of fingerprints that never alert. */
export const IGNORED_FINGERPRINTS_SETTING_KEY = 'monitoring_ignored_fingerprints'

/** Largest ignore list honoured. Entries past this are dropped. */
const MAX_IGNORED_FINGERPRINTS = 500

/** How long the ignore list is cached in memory per server instance. */
const IGNORED_FINGERPRINTS_TTL_MS = 60 * 1000

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

/** A V8 (`    at fn (file:1:2)`) or Firefox/Safari (`fn@file:1:2`) frame line. */
const STACK_FRAME_LINE = /^\s*at\s|@\S*:\d+(:\d+)?\s*$/

/**
 * Redacts and bounds a stack: the header lines are kept, then at most
 * `MAX_STACK_FRAMES` frames, then the result is capped at `MAX_STACK_LENGTH`.
 * Redaction runs before truncation so a cut can never split a secret past the
 * patterns that would have caught it.
 */
export function formatStack(raw: string): string | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined
  const kept: string[] = []
  let frames = 0
  for (const line of raw.split(/\r?\n/)) {
    if (STACK_FRAME_LINE.test(line)) {
      if (frames >= MAX_STACK_FRAMES) break
      frames++
    }
    kept.push(line)
  }
  const redacted = redactText(kept.join('\n'))
  return redacted.length > MAX_STACK_LENGTH ? redacted.slice(0, MAX_STACK_LENGTH) : redacted
}

/** The stack of a thrown value, when it has one. Non-Error throws carry none. */
function stackOf(error: unknown): string | undefined {
  if (error instanceof Error && typeof error.stack === 'string') return error.stack
  if (error && typeof error === 'object' && typeof (error as { stack?: unknown }).stack === 'string') {
    return (error as { stack: string }).stack
  }
  return undefined
}

/** First 12 characters of a commit SHA, or undefined when there is none. */
export function normalizeRelease(value: string | undefined | null): string | undefined {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed ? trimmed.slice(0, RELEASE_LENGTH) : undefined
}

/** This deployment's release tag, from Vercel's build-time commit SHA. */
function serverRelease(): string | undefined {
  return normalizeRelease(process.env.VERCEL_GIT_COMMIT_SHA)
}

/**
 * The fields every report carries in `details`, shared with the admin repo:
 * `app`, `runtime`, and `stack` / `release` when known. Added AFTER the generic
 * details sanitizer, whose 2000-character string cap would cut the stack short;
 * the stack is redacted by `formatStack` instead.
 */
function monitoringFields(options: {
  error?: unknown
  stack?: string
  runtime?: MonitoringRuntime
  release?: string
}): Record<string, unknown> {
  const rawStack = options.stack ?? stackOf(options.error)
  const stack = rawStack ? formatStack(rawStack) : undefined
  const release = normalizeRelease(options.release) ?? serverRelease()
  return {
    ...(stack ? { stack } : {}),
    ...(release ? { release } : {}),
    app: MONITORING_APP,
    runtime: options.runtime === 'client' ? 'client' : 'server',
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `system_errors.user_id` is a uuid foreign key: anything else would fail the insert. */
function validUserId(value: string | undefined): string | undefined {
  return value && UUID_PATTERN.test(value) ? value : undefined
}

// ─── Ignore list ──────────────────────────────────────────────────────────────

let ignoredCache: { at: number; fingerprints: ReadonlySet<string> } | null = null

/** Test hook: drops the cached ignore list. */
export function resetIgnoredFingerprintsCacheForTests(): void {
  ignoredCache = null
}

/** Accepts the stored value as a JSON array, or a string holding one. */
function parseIgnoredFingerprints(value: unknown): ReadonlySet<string> {
  let list = value
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list)
    } catch {
      return new Set()
    }
  }
  if (!Array.isArray(list)) return new Set()
  return new Set(
    list
      .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
      .slice(0, MAX_IGNORED_FINGERPRINTS)
  )
}

/**
 * The admin-managed ignore list, cached for 60 seconds. Fails open to an empty
 * list: a settings outage must never silence alerts it was not asked to silence.
 */
async function loadIgnoredFingerprints(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase').createServiceRoleClient>>
): Promise<ReadonlySet<string>> {
  if (ignoredCache && Date.now() - ignoredCache.at < IGNORED_FINGERPRINTS_TTL_MS) {
    return ignoredCache.fingerprints
  }
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', IGNORED_FINGERPRINTS_SETTING_KEY)
      .maybeSingle()
    if (error) return new Set()
    const fingerprints = parseIgnoredFingerprints((data as { value?: unknown } | null)?.value)
    // Only a successful read is cached, so a recovered database is honoured at once.
    ignoredCache = { at: Date.now(), fingerprints }
    return fingerprints
  } catch {
    return new Set()
  }
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
    const nowMs = Date.now()
    const nowIso = new Date(nowMs).toISOString()

    // The latest row for this fingerprint, by insert time (served by the
    // (fingerprint, timestamp DESC) index). Not bounded by the window in SQL: a
    // resolved row from last week still has to be seen, so a fixed bug that comes
    // back is flagged as a regression rather than filed as a fresh incident.
    const { data: recentRows, error: lookupErr } = await supabase
      .from('system_errors')
      .select('id, occurrence_count, status, updated_at, timestamp')
      .eq('fingerprint', args.fingerprint)
      .order('timestamp', { ascending: false })
      .limit(1)

    let regression = false
    if (!lookupErr && recentRows && recentRows.length > 0) {
      const existing = recentRows[0] as {
        id: string
        occurrence_count?: number | null
        status?: string | null
        updated_at?: string | null
        timestamp?: string | null
      }

      if (existing.status === 'resolved') {
        // Resolved means someone said it was fixed. Counting the comeback onto that
        // row would hide it; a new row puts it back in the "new" queue.
        regression = true
      } else {
        // The window runs from when the incident was LAST SEEN, so a continuous
        // outage stays one row however long it lasts.
        const lastSeen = Date.parse(existing.updated_at ?? existing.timestamp ?? '')
        if (Number.isFinite(lastSeen) && nowMs - lastSeen <= DEDUP_WINDOW_MS) {
          await supabase
            .from('system_errors')
            .update({
              occurrence_count: (existing.occurrence_count ?? 1) + 1,
              updated_at: nowIso,
            })
            .eq('id', existing.id)
          return existing.id
        }
      }
    }

    const details = regression ? { ...(args.details || {}), regression: true } : args.details
    const userId = validUserId(args.userId)
    const row = {
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
      user_id: userId || null,
      fingerprint: args.fingerprint,
      status: 'new',
      occurrence_count: 1,
      first_seen_at: nowIso,
      details: (details as unknown as import('@/lib/supabase').Json) || null,
    }

    let { data: inserted, error: insertErr } = await supabase
      .from('system_errors')
      .insert(row)
      .select('id')
      .maybeSingle()

    // `user_id` references public.users. An auth user whose profile row is missing
    // (or was deleted) fails that foreign key; the incident matters more than the
    // attribution, so it is written once more without it.
    if (insertErr && userId && (insertErr as { code?: string }).code === '23503') {
      ;({ data: inserted, error: insertErr } = await supabase
        .from('system_errors')
        .insert({ ...row, user_id: null })
        .select('id')
        .maybeSingle())
    }

    if (insertErr) {
      console.warn('[logSystemError] DB insert failed (table may be pending migration):', insertErr.message)
      return null
    }

    const incidentId = (inserted as { id: string } | null)?.id || null

    if (args.severity === 'critical' && incidentId) {
      // An ignored fingerprint is still recorded above; it only never alerts.
      const ignored = await loadIgnoredFingerprints(supabase)
      if (!ignored.has(args.fingerprint)) {
        await notifyAdminsOnce(supabase, args, incidentId)
      }
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

    // Out-of-band delivery happens BEFORE the admin lookup, deliberately.
    //
    // The in-app path below needs two more successful database reads and at least one
    // admin row, and returns silently if either is unavailable — which is precisely the
    // situation this channel exists for. Placing it after the cooldown check keeps the
    // one-alert-per-fingerprint-per-hour guarantee while making delivery independent of
    // everything downstream. Awaited so a test can observe it; it never throws.
    // B9-A / F-REL-4.
    const { deliverOutOfBandAlert } = await import('./out-of-band-alert')
    await deliverOutOfBandAlert({
      incidentId,
      severity: args.severity,
      kind: args.kind,
      domain: args.domain,
      operation: args.operation,
      message: args.message,
      nextAction: args.nextAction,
      fingerprint: args.fingerprint,
    })

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
          // The console lives on its own host. The relative fallback still works there
          // (and the learner proxy 308s /admin/* to ADMIN_SITE_URL once it is set).
          actionUrl: adminSiteUrlFor('/admin/system') ?? '/admin/system',
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
    // B9-B. In `details`, never in the fingerprint above: the fingerprint is what
    // collapses repeats of one incident into a single alert, and a per-request value
    // in it would give every occurrence a distinct hash.
    ...(resolved.requestId ? { requestId: resolved.requestId } : {}),
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
  Object.assign(details, monitoringFields({ error: resolved.error }))

  console.error(
    `[SystemError:${resolved.severity.toUpperCase()}:${resolved.domain}/${resolved.kind}]` +
      `${resolved.requestId ? ` [${resolved.requestId}]` : ''} ${resolved.operation} - ${summary}`
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
    userId: resolved.userId ?? resolved.subject?.userId,
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
    details: {
      ...((sanitizeDetails(options.details) as Record<string, unknown> | undefined) || {}),
      ...monitoringFields({
        error: options.error,
        stack: options.stack,
        runtime: options.runtime,
        release: options.release,
      }),
    },
  })
}
