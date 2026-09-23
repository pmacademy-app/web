/**
 * Cookie consent state — shared by the proxy (server) and the banner (client).
 *
 * The audit found GA4, Google Tag Manager and the 30-day `prodily_referrer`
 * attribution cookie all firing unconditionally on page load. Those three are the
 * non-essential technologies this module gates. Authentication session cookies are
 * strictly necessary and deliberately NOT gated — a consent banner must never be
 * able to log a learner out.
 *
 * Framework-agnostic on purpose (see the `lib/` convention): it owns the cookie
 * name, the encoding and the "is this consent still valid" rule, and nothing else.
 */

/**
 * Readable by client JavaScript, unlike the auth cookies — the banner has to know
 * whether it has already been answered before React hydrates, and the analytics
 * gate has to read the answer without a round trip.
 */
export const COOKIE_CONSENT_COOKIE = 'prodily_cookie_consent'

/**
 * Bump only when the set of non-essential technologies changes in a way that makes
 * a previous answer no longer informed. A bump re-prompts every visitor, so it is
 * not a free action.
 */
export const COOKIE_CONSENT_VERSION = '2026-09-23'

/** Six months. Long enough not to nag, short enough to count as a fresh choice. */
export const COOKIE_CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180

export type CookieConsentDecision = 'accepted' | 'rejected'

export interface CookieConsentRecord {
  decision: CookieConsentDecision
  version: string
  decidedAt: string
}

/** `accepted|2026-09-23|2026-09-23T10:00:00.000Z` — compact and cookie-safe. */
export function serializeCookieConsent(record: CookieConsentRecord): string {
  return `${record.decision}|${record.version}|${record.decidedAt}`
}

/**
 * Percent-decodes when needed.
 *
 * The client writes the value URI-encoded, and whether it arrives back decoded
 * depends on the cookie reader: Next's `RequestCookies` decodes in some runtimes
 * and not in others. Decoding here rather than relying on the caller is what keeps
 * the gate from silently reading "no consent" for a visitor who accepted.
 */
function normalizeRaw(raw: string): string {
  if (!raw.includes('%')) return raw
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export function parseCookieConsent(raw: string | null | undefined): CookieConsentRecord | null {
  if (!raw) return null
  const [decision, version, decidedAt] = normalizeRaw(raw).split('|')
  if (decision !== 'accepted' && decision !== 'rejected') return null
  if (!version) return null
  return { decision, version, decidedAt: decidedAt ?? '' }
}

/**
 * Has this visitor answered the *current* banner?
 *
 * A record written against an older `COOKIE_CONSENT_VERSION` counts as unanswered,
 * so the banner reappears rather than silently carrying a stale answer forward.
 */
export function hasDecidedCookieConsent(raw: string | null | undefined): boolean {
  const record = parseCookieConsent(raw)
  return record !== null && record.version === COOKIE_CONSENT_VERSION
}

/**
 * The gate every non-essential cookie and tracking script must pass.
 *
 * Fails closed: anything unparsable, missing or stale means "no consent".
 */
export function hasOptionalCookieConsent(raw: string | null | undefined): boolean {
  const record = parseCookieConsent(raw)
  return record?.decision === 'accepted' && record.version === COOKIE_CONSENT_VERSION
}

export function buildCookieConsentRecord(
  decision: CookieConsentDecision,
  decidedAt: Date = new Date()
): CookieConsentRecord {
  return { decision, version: COOKIE_CONSENT_VERSION, decidedAt: decidedAt.toISOString() }
}

/**
 * The non-essential technologies this consent covers, rendered in the banner and
 * mirrored by the Privacy Policy's cookie table. Keeping the list here is what
 * stops the disclosure and the implementation drifting apart again.
 */
export const OPTIONAL_COOKIE_DISCLOSURES = [
  {
    name: 'Google Analytics 4 (`_ga`, `_ga_*`)',
    purpose: 'Aggregate, PII-free usage measurement — which pages and CTAs are used.',
    duration: 'Up to 2 years',
  },
  {
    name: 'Google Tag Manager',
    purpose: 'Tag container, loaded only when configured by the operator.',
    duration: 'Session',
  },
  {
    name: '`prodily_referrer`',
    purpose: 'Remembers which learner referred you, so a referral can be credited after signup.',
    duration: '30 days',
  },
] as const
