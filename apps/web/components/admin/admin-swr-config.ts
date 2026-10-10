import type { SWRConfiguration } from 'swr'

/**
 * Shared SWR settings for admin console views (plan B6).
 *
 * Admin data changes slowly and the console is often left open in a
 * background tab, so these settings keep request volume low.
 */

/** Minimum dedupe window for admin list views. */
export const ADMIN_DEDUPE_INTERVAL_MS = 10_000

/** Normal polling interval for the system alerts view. */
export const ALERTS_POLL_INTERVAL_MS = 30_000

/** Ceiling for the alerts error backoff. */
export const ALERTS_MAX_BACKOFF_MS = 5 * 60_000

/**
 * Delay before the Nth error retry: the poll interval doubled per failed
 * attempt (60s, 120s, 240s, ...), capped at 5 minutes.
 * `retryCount` starts at 1, as SWR passes it.
 */
export function alertsErrorBackoffMs(retryCount: number): number {
  const attempt = Math.max(1, Math.floor(retryCount))
  // Cap the exponent so the multiplication cannot overflow to Infinity.
  const delay = ALERTS_POLL_INTERVAL_MS * 2 ** Math.min(attempt, 16)
  return Math.min(delay, ALERTS_MAX_BACKOFF_MS)
}

/**
 * Error retry handler for the alerts poll. While the cache holds an error,
 * SWR skips its own refresh ticks, so this handler alone decides when the
 * next request goes out.
 */
export const alertsOnErrorRetry: NonNullable<SWRConfiguration['onErrorRetry']> = (
  _error,
  _key,
  _config,
  revalidate,
  { retryCount }
) => {
  setTimeout(() => {
    void revalidate({ retryCount })
  }, alertsErrorBackoffMs(retryCount))
}

/** Polling config for AdminSystemAlertsView. */
export const ADMIN_ALERTS_SWR_CONFIG = {
  refreshInterval: ALERTS_POLL_INTERVAL_MS,
  refreshWhenHidden: false,
  revalidateOnFocus: true,
  dedupingInterval: ADMIN_DEDUPE_INTERVAL_MS,
  onErrorRetry: alertsOnErrorRetry,
} satisfies SWRConfiguration

/** Config for admin list views seeded with server data (no polling). */
export const ADMIN_LIST_SWR_CONFIG = {
  revalidateOnMount: false,
  dedupingInterval: ADMIN_DEDUPE_INTERVAL_MS,
} satisfies SWRConfiguration
