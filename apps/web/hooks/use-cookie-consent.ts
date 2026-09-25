'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import {
  COOKIE_CONSENT_COOKIE,
  COOKIE_CONSENT_MAX_AGE_SECONDS,
  buildCookieConsentRecord,
  hasDecidedCookieConsent,
  hasOptionalCookieConsent,
  serializeCookieConsent,
  type CookieConsentDecision,
} from '@/lib/legal/cookie-consent'

/**
 * Client-side access to the visitor's cookie-consent decision.
 *
 * The decision lives in a first-party cookie rather than localStorage because the
 * proxy has to read it too — it is what gates the `prodily_referrer` attribution
 * cookie server-side.
 */

/** Fired whenever the decision changes, so every mounted consumer re-reads it. */
const CONSENT_CHANGE_EVENT = 'prodily:cookie-consent-change'

/** Fired by the "Cookie preferences" control to bring the banner back. */
const CONSENT_REOPEN_EVENT = 'prodily:cookie-consent-reopen'

function readRawConsent(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${COOKIE_CONSENT_COOKIE}=`))
  return match ? decodeURIComponent(match.slice(COOKIE_CONSENT_COOKIE.length + 1)) : null
}

/** GA4's own cookies. Cleared when consent is withdrawn. */
const GA_COOKIE_PATTERN = /^_ga/

/**
 * Expires the analytics cookies GA4 wrote while consent was in force.
 *
 * Withdrawing consent has to remove what the previous acceptance created,
 * otherwise "reject" only stops future loads and the visitor keeps carrying the
 * identifier they just asked us to stop using. GA sets `_ga` on the registrable
 * domain, so the deletion is repeated for the host and its dot-prefixed parent.
 */
function clearAnalyticsCookies(): void {
  const hostname = window.location.hostname
  const domains = [undefined, hostname, `.${hostname}`, `.${hostname.split('.').slice(-2).join('.')}`]

  for (const entry of document.cookie.split('; ')) {
    const name = entry.split('=')[0]
    if (!GA_COOKIE_PATTERN.test(name)) continue
    for (const domain of domains) {
      document.cookie =
        `${name}=; Path=/; Max-Age=0` + (domain ? `; Domain=${domain}` : '')
    }
  }
}

/**
 * Persists a decision and notifies every consumer.
 *
 * Not `httpOnly` — the analytics gate and the banner both need to read it without
 * a round trip. It carries no personal data, only the answer to the banner.
 */
export function writeCookieConsent(decision: CookieConsentDecision): void {
  if (typeof document === 'undefined') return
  const value = serializeCookieConsent(buildCookieConsentRecord(decision))
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie =
    `${COOKIE_CONSENT_COOKIE}=${encodeURIComponent(value)}` +
    `; Path=/; Max-Age=${COOKIE_CONSENT_MAX_AGE_SECONDS}; SameSite=Lax${secure}`

  // Unmounting the gate stops React rendering the tags, but a GA runtime already
  // injected into this document keeps running until the page is replaced. So a
  // withdrawal clears GA's cookies and reloads; an acceptance does not need to,
  // because mounting the gate is what loads the tags in the first place.
  const withdrewFromLoadedAnalytics = decision === 'rejected' && typeof window.gtag === 'function'
  if (decision === 'rejected') clearAnalyticsCookies()

  window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT))

  if (withdrewFromLoadedAnalytics) window.location.reload()
}

/** Reopens the consent banner so a visitor can change their mind later. */
export function openCookiePreferences(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(CONSENT_REOPEN_EVENT))
}

export interface CookieConsentState {
  /**
   * False during server rendering and the first client render. Everything gated on
   * consent stays off while this is false — server output cannot know the cookie,
   * so rendering the banner or a tracker before hydration would either mismatch or
   * fire early.
   */
  isHydrated: boolean
  /** The visitor has answered the current banner version. */
  hasDecided: boolean
  /** The visitor accepted optional cookies. Never true before hydration. */
  hasAccepted: boolean
  accept: () => void
  reject: () => void
}

/**
 * `useSyncExternalStore` rather than `useState` + `useEffect`: the cookie is an
 * external store, every mounted consumer must see the same value the instant it
 * changes, and the server snapshot is unambiguously "unknown" without a synchronous
 * setState in an effect.
 */
function subscribeToConsent(onChange: () => void): () => void {
  window.addEventListener(CONSENT_CHANGE_EVENT, onChange)
  return () => window.removeEventListener(CONSENT_CHANGE_EVENT, onChange)
}

const consentServerSnapshot = (): string | null => null
const hydratedClientSnapshot = () => true
const hydratedServerSnapshot = () => false

export function useCookieConsent(): CookieConsentState {
  const raw = useSyncExternalStore(subscribeToConsent, readRawConsent, consentServerSnapshot)
  const isHydrated = useSyncExternalStore(
    subscribeToConsent,
    hydratedClientSnapshot,
    hydratedServerSnapshot
  )

  const accept = useCallback(() => writeCookieConsent('accepted'), [])
  const reject = useCallback(() => writeCookieConsent('rejected'), [])

  return {
    isHydrated,
    hasDecided: isHydrated && hasDecidedCookieConsent(raw),
    hasAccepted: isHydrated && hasOptionalCookieConsent(raw),
    accept,
    reject,
  }
}

/** Subscribes to the "Cookie preferences" control elsewhere on the page. */
export function useCookiePreferencesReopen(onReopen: () => void): void {
  useEffect(() => {
    window.addEventListener(CONSENT_REOPEN_EVENT, onReopen)
    return () => window.removeEventListener(CONSENT_REOPEN_EVENT, onReopen)
  }, [onReopen])
}
