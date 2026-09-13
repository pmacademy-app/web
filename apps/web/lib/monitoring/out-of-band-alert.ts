/**
 * Out-of-band delivery for critical incidents (B9-A / F-REL-4).
 *
 * Until this existed, a critical incident produced an in-app notification written into
 * the same Supabase instance the incident was reporting on. A database outage therefore
 * filed its own alert somewhere nobody could read it.
 *
 * ## Why a generic webhook rather than a named provider
 *
 * The channel is an operator decision, and the roadmap leaves it open. A webhook URL in
 * configuration satisfies Slack, Discord, a Telegram bridge, PagerDuty's events API, or
 * anything else, without adding a dependency, locking the project to a vendor, or
 * needing a code change to switch. Crucially it also shares no infrastructure with the
 * two things most likely to be broken when a critical incident fires: Supabase and the
 * email pipeline.
 *
 * ## Guarantees
 *
 * - **Never throws.** Every failure path returns a result object. The caller sits inside
 *   `logSystemError`, which must not change the response a user receives.
 *   ADR-005's redaction has already run on everything this module sends.
 * - **Never blocks indefinitely.** The request is abort-bounded.
 * - **Adds no new fields.** It forwards only what the incident already carried, so it
 *   cannot widen what redaction approved.
 * - **Silent when unconfigured.** No URL means no attempt and no noise.
 *
 * Dedup is NOT implemented here. The caller already enforces one alert per fingerprint
 * per hour, and a second mechanism would be a second thing to reason about.
 */

/** Abort bound. Matches the email pipeline's `EMAIL_HTTP_TIMEOUT_MS` convention. */
export const ALERT_HTTP_TIMEOUT_MS = 8000

export interface OutOfBandAlert {
  /** Incident row id, so an operator can find it in the admin console. */
  incidentId: string
  severity: string
  /** Taxonomy failure kind, e.g. `db_unavailable`. */
  kind: string | null
  /** Taxonomy domain, e.g. `db`. */
  domain: string | null
  /** Stable operation name, e.g. `leaderboard.weekly_xp_events`. */
  operation: string
  /** Already-redacted summary. */
  message: string
  /** Operator guidance derived from the kind. */
  nextAction: string | null
  /** Stable fingerprint, so repeat alerts are recognisable. */
  fingerprint: string
}

export type OutOfBandAlertResult =
  | { delivered: true }
  | { delivered: false; reason: 'not_configured' | 'suppressed_in_test' | 'failed' }

/** Reads config at call time so tests and deploys can change it without a reimport. */
function getWebhookUrl(): string | null {
  const raw = process.env.ALERT_WEBHOOK_URL?.trim()
  if (!raw) return null
  // A malformed URL must not throw from inside the incident path.
  try {
    const parsed = new URL(raw)
    // Refuse plaintext transport: the payload carries operational detail about a
    // production failure, and http:// would put it on the wire in the clear.
    if (parsed.protocol !== 'https:') return null
    return raw
  } catch {
    return null
  }
}

/**
 * Builds the request body.
 *
 * `text` is included because most chat webhooks render that field directly, so the
 * common case works with no transformation step. The structured fields sit alongside it
 * for anything that parses rather than renders.
 */
export function buildAlertPayload(alert: OutOfBandAlert): Record<string, unknown> {
  const headline = `[${alert.severity.toUpperCase()}] ${alert.kind ?? alert.domain ?? 'incident'} — ${alert.operation}`
  const lines = [headline, alert.message]
  if (alert.nextAction) lines.push(`Next: ${alert.nextAction}`)
  lines.push(`Incident: ${alert.incidentId}`)

  return {
    text: lines.join('\n'),
    incidentId: alert.incidentId,
    severity: alert.severity,
    kind: alert.kind,
    domain: alert.domain,
    operation: alert.operation,
    message: alert.message,
    nextAction: alert.nextAction,
    fingerprint: alert.fingerprint,
  }
}

/**
 * Delivers one critical incident to the configured out-of-band channel.
 *
 * Resolves with a result rather than throwing, under every failure mode.
 */
export async function deliverOutOfBandAlert(
  alert: OutOfBandAlert
): Promise<OutOfBandAlertResult> {
  const url = getWebhookUrl()
  if (!url) return { delivered: false, reason: 'not_configured' }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildAlertPayload(alert)),
      signal: AbortSignal.timeout(ALERT_HTTP_TIMEOUT_MS),
    })

    if (!res.ok) {
      console.warn(`[out-of-band-alert] Channel refused the alert with HTTP ${res.status}`)
      return { delivered: false, reason: 'failed' }
    }

    return { delivered: true }
  } catch (err) {
    // Includes the abort on timeout. Deliberately swallowed: an undeliverable alert
    // must never turn into a second failure on the request path.
    console.warn(
      '[out-of-band-alert] Delivery failed:',
      err instanceof Error ? err.message : String(err)
    )
    return { delivered: false, reason: 'failed' }
  }
}
