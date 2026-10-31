import { createServiceRoleClient, type Json } from '@/lib/supabase'
import { logSystemError } from '@/lib/monitoring/logger'

/**
 * Server-side product events (PROD-15).
 *
 * Writes one row to public.product_events with the service-role client. This is the
 * measurement stream behind the admin north-star tile and the weekly retention view; it is
 * not GA4. Do not confuse it with `trackEvent` in lib/analytics.ts, which is the client-side,
 * consent-gated GA4 helper.
 *
 * Contract for callers:
 *   - Call it only after the write it describes has succeeded.
 *   - It never throws and never rejects. A bad name, a bad user id, oversized properties or a
 *     database error is logged and reported as `false`, so analytics can never fail the
 *     request that triggered it. In route handlers and server actions, run it inside
 *     `after(() => trackProductEvent(...))`; in lib code, await it.
 *   - `lesson_completed` must carry `score` as a JSON number from 0 to 100: the
 *     weekly_mastering_learners view counts a learner when score >= 70 and ignores any other
 *     type.
 */

/** Every event name the database accepts. Mirrors the CHECK in 20261024000001_product_events.sql. */
export const PRODUCT_EVENT_NAMES = [
  'signup',
  'onboarding_completed',
  'lesson_started',
  'lesson_completed',
  'quiz_submitted',
  'capstone_submitted',
  'capstone_reviewed',
  'certificate_issued',
  'portfolio_shared',
  'referral_used',
] as const

export type ProductEventName = (typeof PRODUCT_EVENT_NAMES)[number]

/** A flat or nested JSON object. Values must be JSON-serializable. */
export type ProductEventProperties = { [key: string]: Json | undefined }

export interface TrackProductEventOptions {
  /** When the event happened, if not now (for example the original write's timestamp). */
  occurredAt?: Date | string
}

/**
 * Upper bound on the serialized properties, in bytes. The table CHECK caps the stored jsonb
 * at 4096 bytes; the JSON text is a close proxy, and rejecting here avoids a round trip that
 * is bound to fail.
 */
export const MAX_PRODUCT_EVENT_PROPERTIES_BYTES = 4096

const EVENT_NAME_SET: ReadonlySet<string> = new Set(PRODUCT_EVENT_NAMES)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isProductEventName(value: unknown): value is ProductEventName {
  return typeof value === 'string' && EVENT_NAME_SET.has(value)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** Serializes properties, or returns null when they are not a JSON object within the size cap. */
function serializeProperties(props: unknown): Json | null {
  if (!isPlainObject(props)) return null
  let text: string
  try {
    text = JSON.stringify(props)
  } catch {
    return null
  }
  if (new TextEncoder().encode(text).length > MAX_PRODUCT_EVENT_PROPERTIES_BYTES) return null
  return JSON.parse(text) as Json
}

function resolveOccurredAt(value: Date | string | undefined): string | null {
  if (value === undefined) return new Date().toISOString()
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function warn(message: string, details: Record<string, unknown>): void {
  console.warn(`[product-events] ${message}`, details)
}

/**
 * Records a product event. Resolves `true` when the row was written and `false` otherwise.
 * Never throws.
 */
export async function trackProductEvent(
  name: ProductEventName,
  userId: string | null,
  props: ProductEventProperties = {},
  options: TrackProductEventOptions = {}
): Promise<boolean> {
  try {
    // Callers are typed, but a name can still arrive from an untyped path; the DB CHECK
    // would reject it anyway, so refuse it here without a round trip.
    if (!isProductEventName(name)) {
      warn('rejected unknown event name', { name: String(name) })
      return false
    }
    if (userId !== null && (typeof userId !== 'string' || !UUID_RE.test(userId))) {
      warn('rejected invalid user id', { name })
      return false
    }
    const properties = serializeProperties(props)
    if (properties === null) {
      warn('rejected properties (not a JSON object or over the size cap)', { name })
      return false
    }
    const occurredAt = resolveOccurredAt(options.occurredAt)
    if (occurredAt === null) {
      warn('rejected invalid occurredAt', { name })
      return false
    }

    const supabase = createServiceRoleClient()
    const { error } = await supabase.from('product_events').insert({
      event_name: name,
      user_id: userId,
      properties,
      occurred_at: occurredAt,
    })

    if (error) {
      await reportWriteFailure(name, userId, error.message, error.code)
      return false
    }
    return true
  } catch (err) {
    await reportWriteFailure(name, userId, err instanceof Error ? err.message : String(err))
    return false
  }
}

/** Logs a failed write. Swallows its own failures: logging must not throw either. */
async function reportWriteFailure(
  name: string,
  userId: string | null,
  message: string,
  code?: string
): Promise<void> {
  try {
    warn('write failed', { name, code, message })
    await logSystemError({
      severity: 'warning',
      category: 'db',
      operation: 'product_events.insert',
      message: `product event "${name}" was not recorded: ${message}`,
      userId: userId ?? undefined,
      details: { eventName: name, code },
    })
  } catch {
    // Nothing left to do: the console line above is the last resort.
  }
}
