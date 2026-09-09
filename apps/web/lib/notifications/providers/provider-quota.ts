/**
 * Per-provider daily send accounting.
 *
 * The platform had one global daily counter (`increment_daily_email_quota`). It can
 * say "we have sent 100 emails today" but not "Brevo is spent and Resend is not",
 * which is exactly the distinction failover needs. Two consequences during the
 * 2026-09-09 incident:
 *
 *  - Every dispatch kept selecting the exhausted Brevo first and burning a request
 *    against it before discovering, again, that it had no credit.
 *  - Once the global counter tripped, sending stopped platform-wide even though the
 *    secondary provider was healthy.
 *
 * These helpers wrap the RPCs added in `20260909000001_signup_abuse_email_governance`.
 *
 * ## Failure policy
 *
 * Reads (`isProviderExhausted`) fail OPEN: a database blip must not stop auth mail,
 * and if the provider really is spent it will say so on the next call and be marked
 * then. Reservations (`reserveProviderQuota`) also fail open for the same reason —
 * volume containment for untrusted traffic is enforced upstream by the governed
 * gateway's rate limits, which fail CLOSED. Keeping those two policies distinct is
 * deliberate: the quota is an accounting ceiling, the rate limiter is the abuse
 * boundary.
 */

import type { EmailProviderName } from '../config'

type ServiceClient = { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> }

async function getClient(): Promise<ServiceClient | null> {
  try {
    const { createServiceRoleClient } = await import('@/lib/supabase')
    return createServiceRoleClient() as unknown as ServiceClient
  } catch {
    return null
  }
}

/**
 * Whether a provider has already reported capacity exhaustion today (UTC).
 *
 * Used to skip a provider we know is spent instead of spending another request to
 * rediscover it — and to stop failover from selecting the exhausted provider again.
 */
export async function isProviderExhausted(provider: EmailProviderName): Promise<boolean> {
  const supabase = await getClient()
  if (!supabase) return false
  try {
    const { data, error } = await supabase.rpc('is_provider_exhausted', { p_provider: provider })
    if (error) return false
    return data === true
  } catch {
    return false
  }
}

/**
 * Records that a provider is out of capacity for the rest of the UTC day.
 *
 * Called when a provider answers with a capacity signal (402/429, or a body code such
 * as Brevo's `not_enough_credits`). This is what prevents the "retry the exhausted
 * provider indefinitely" loop.
 */
export async function markProviderExhausted(provider: EmailProviderName): Promise<void> {
  const supabase = await getClient()
  if (!supabase) return
  try {
    await supabase.rpc('mark_provider_exhausted', { p_provider: provider })
  } catch {
    // Best-effort: the provider will refuse again and we will retry marking it.
  }
}

/**
 * Reserves one send against a provider's daily allowance BEFORE dispatch.
 *
 * Returns false when the provider is exhausted or at its configured ceiling, in which
 * case the caller must not call that provider. `p_limit <= 0` means "no per-provider
 * ceiling configured", which reserves without capping.
 */
export async function reserveProviderQuota(provider: EmailProviderName, limit: number): Promise<boolean> {
  if (!Number.isFinite(limit) || limit <= 0) {
    // No ceiling configured — still consult the exhaustion marker, which is set from
    // the provider's own responses rather than from our configuration.
    return !(await isProviderExhausted(provider))
  }
  const supabase = await getClient()
  if (!supabase) return true
  try {
    const { data, error } = await supabase.rpc('reserve_provider_email_quota', {
      p_provider: provider,
      p_limit: Math.floor(limit),
    })
    if (error) return true
    return data !== false
  } catch {
    return true
  }
}

/** Returns a reservation when the send never reached the provider. */
export async function releaseProviderQuota(provider: EmailProviderName): Promise<void> {
  const supabase = await getClient()
  if (!supabase) return
  try {
    await supabase.rpc('release_provider_email_quota', { p_provider: provider })
  } catch {
    // Best-effort; an unreleased reservation only makes the ceiling slightly stricter.
  }
}
