/**
 * The governed email gateway.
 *
 * ## Why this exists
 *
 * Prodily had two email stacks, and only one of them was governed. Queued mail went
 * through `enqueueNotificationItem` -> `processEmailQueue`, which checks the
 * EMAIL_ENABLED flag, the global pause, suppression, user preferences and a daily
 * quota before dispatching. Direct mail called `sendEmail()` and checked nothing.
 *
 * The Supabase Auth send-email hook is on the second path. That means every
 * unauthenticated `auth.signUp()` and `auth.resend()` produced a real, billable
 * provider call that no quota, kill switch, suppression list or deduplication ever
 * observed — with no `public.users` row anywhere in sight, because Supabase Auth
 * creates only an `auth.users` record until the address is verified. That is the
 * exact shape of the 2026-09-09 incident: hundreds of outbound sends, Brevo's
 * allowance gone, and no corresponding application users.
 *
 * This module is the single governed entry point for those sends. It enforces, in
 * order and before any provider is contacted:
 *
 *   1. EMAIL_ENABLED kill switch (hydrated from the database, not a compiled default)
 *   2. Global non-critical pause
 *   3. Suppression list
 *   4. Rate limits — per recipient, per client IP, and a platform-wide aggregate —
 *      all fail-closed
 *   5. Durable idempotency claim, so a duplicate can never reach a provider
 *   6. Per-provider daily quota reservation
 *
 * ...and only then dispatches through the shared transport, which owns provider
 * selection and failover.
 *
 * ## What this module is NOT for
 *
 * Welcome emails. Those belong on the queue (`user.registered` -> `auth.welcome`),
 * which is already governed and is the only path with a `public.users` row to attach
 * to. Nothing here should grow a second welcome-email implementation.
 */

import { sendEmail, maskEmail, type SendEmailResult } from '@/lib/email'
import { createServiceRoleClient } from '@/lib/supabase'
import { evaluatePersistentRateLimit } from '@/lib/rate-limit'
import { globalFeatureFlagService } from '@/lib/notifications/feature-flags/service'
import { EmailAutomationsService } from '@/lib/notifications/automations/service'
import { resolvePrimaryProvider } from '@/lib/notifications/config'
import { reserveProviderQuota, releaseProviderQuota } from '@/lib/notifications/providers/provider-quota'

/**
 * What kind of message this is. Drives which controls apply and which rate-limit
 * budget it draws from.
 *
 * `critical` purposes are the ones a learner cannot complete their account without.
 * They bypass the global non-critical pause and the suppression list — matching the
 * queue processor's existing rule — but they do NOT bypass the kill switch, the rate
 * limits, the idempotency claim or the quota. Being critical means "an operator would
 * not casually pause this", not "unmetered".
 */
export type GovernedEmailPurpose =
  | 'auth.verify_email'
  | 'auth.password_reset'
  | 'auth.email_change_verify'
  | 'auth.reauthentication'
  | 'auth.invite'
  | 'waitlist.confirmation'
  | 'contact.acknowledgement'

const CRITICAL_PURPOSES = new Set<GovernedEmailPurpose>([
  'auth.verify_email',
  'auth.password_reset',
  'auth.email_change_verify',
  'auth.reauthentication',
])

/**
 * Per-recipient budget, by purpose.
 *
 * Sized from how the flows are actually used rather than from a round number: a
 * learner who mistypes an address, retries, and asks for one resend needs a handful
 * of verification mails an hour; nobody legitimately needs dozens. These are the
 * per-address ceilings — IP and aggregate ceilings sit on top.
 */
const RECIPIENT_LIMITS: Record<GovernedEmailPurpose, { limit: number; windowMs: number }> = {
  'auth.verify_email': { limit: 4, windowMs: 60 * 60 * 1000 },
  'auth.password_reset': { limit: 4, windowMs: 60 * 60 * 1000 },
  'auth.email_change_verify': { limit: 4, windowMs: 60 * 60 * 1000 },
  'auth.reauthentication': { limit: 6, windowMs: 60 * 60 * 1000 },
  'auth.invite': { limit: 3, windowMs: 24 * 60 * 60 * 1000 },
  'waitlist.confirmation': { limit: 2, windowMs: 24 * 60 * 60 * 1000 },
  // Contact alerts all go to one internal support inbox, so this is a platform-wide
  // ceiling on support notifications rather than a per-learner one — sized for real
  // support volume, not for a single person's inbox. Per-submitter throttling for
  // this flow lives on the route's own IP/user rate limit.
  'contact.acknowledgement': { limit: 60, windowMs: 24 * 60 * 60 * 1000 },
}

/**
 * Per-IP ceiling across ALL governed purposes.
 *
 * Keyed on the trusted client IP (see `lib/security/client-ip.ts`) rather than the
 * leftmost `X-Forwarded-For` value the attacker supplies. Shared across purposes on
 * purpose: otherwise an attacker simply alternates between signup and password-reset
 * to double their budget.
 */
const IP_EMAIL_LIMIT = { limit: 15, windowMs: 60 * 60 * 1000 }

/**
 * Platform-wide ceiling on ungoverned-origin email, per hour.
 *
 * This is the control that actually stops a campaign rotating both IPs and addresses:
 * neither rotation buys any budget here, because the key is constant. The threshold is
 * derived from the operator's own configured daily email limit
 * (`system_settings.email_daily_send_limit`, surfaced as `dailyLimit`) rather than
 * invented — one hour's worth of it, with a floor so a small configured limit cannot
 * wedge legitimate signups.
 */
const AGGREGATE_WINDOW_MS = 60 * 60 * 1000
const AGGREGATE_FLOOR = 20

function aggregateHourlyCeiling(dailyLimit: number): number {
  const derived = Math.ceil((Number.isFinite(dailyLimit) && dailyLimit > 0 ? dailyLimit : 100) / 24)
  return Math.max(AGGREGATE_FLOOR, derived)
}

export interface GovernedEmailRequest {
  purpose: GovernedEmailPurpose
  to: string
  subject: string
  html: string
  text: string
  /**
   * Logical identity of this message. Two requests with the same key are the same
   * message, and only one of them may reach a provider.
   *
   * For auth mail this is derived from the auth user id + action + token, so a
   * redelivered webhook is deduplicated but a genuinely new verification request is
   * not.
   */
  idempotencyKey: string
  /** Trusted client IP bucket, when the send was triggered by an inbound request. */
  ipBucket?: string
  fromEmail?: string
  replyTo?: string
}

export type GovernedEmailBlockReason =
  | 'email_disabled'
  | 'global_pause'
  | 'suppressed'
  | 'rate_limited_recipient'
  | 'rate_limited_ip'
  | 'rate_limited_aggregate'
  | 'duplicate'
  | 'quota_exhausted'

export interface GovernedEmailResult {
  /** True only when a provider accepted the message. */
  sent: boolean
  /** Set when the gateway refused to dispatch. */
  blocked?: GovernedEmailBlockReason
  provider?: string
  id?: string
  error?: string
  statusCode?: number
  /** How long until the relevant limit frees up, for a 429 response. */
  resetInMs?: number
}

/**
 * Minimal surface the gateway needs from the service-role client.
 *
 * Resolved ONCE per send and threaded through the helpers below. Each helper used to
 * do its own `await import('@/lib/supabase')`, which meant four dynamic imports per
 * message and a needless failure point on every one of them — and since each helper
 * degrades gracefully on error, a failure there silently skipped the control it was
 * supposed to enforce.
 */
type GovernanceClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> }
    }
  }
}

function getGovernanceClient(): GovernanceClient | null {
  try {
    return createServiceRoleClient() as unknown as GovernanceClient
  } catch {
    // No credentials in this environment. Every helper below treats a null client as
    // "control unavailable" and degrades explicitly rather than throwing mid-send.
    return null
  }
}

async function claimIdempotencyKey(
  supabase: GovernanceClient | null,
  key: string,
  purpose: string,
  maskedEmail: string
): Promise<boolean> {
  if (!supabase) return true
  try {
    const { data, error } = await supabase.rpc('claim_email_send', {
      p_key: key,
      p_purpose: purpose,
      p_masked_email: maskedEmail,
    })
    if (error) throw error
    return data !== false
  } catch (err) {
    // The claim is a duplicate guard, not the abuse boundary — the rate limits above
    // it already fail closed. Refusing every send because the ledger is unreachable
    // would take auth mail down on a database blip, so this degrades to "allow" and
    // is reported.
    console.warn('[email-governance] Idempotency claim unavailable, proceeding without dedup:', err)
    return true
  }
}

async function finalizeIdempotencyKey(
  supabase: GovernanceClient | null,
  key: string,
  status: 'sent' | 'failed',
  result: SendEmailResult
): Promise<void> {
  if (!supabase) return
  try {
    await supabase.rpc('finalize_email_send', {
      p_key: key,
      p_status: status,
      p_provider: result.provider ?? null,
      p_status_code: result.statusCode ?? null,
      p_attempts: [
        {
          provider: result.provider ?? null,
          success: result.success,
          statusCode: result.statusCode ?? null,
          // The provider's own code, not our rendered message — no recipient data,
          // no token, nothing from the email body.
          providerCode: result.providerCode ?? null,
        },
      ],
    })
  } catch {
    // Ledger bookkeeping must never change the delivery outcome.
  }
}

async function isSuppressed(supabase: GovernanceClient | null, email: string): Promise<boolean> {
  if (!supabase) return false
  try {
    const { data } = await supabase.from('email_suppressions').select('id').eq('email', email).maybeSingle()
    return Boolean(data)
  } catch {
    return false
  }
}

/**
 * Emits a structured, redacted record of a governed-send decision.
 *
 * Carries enough to answer "which action, which provider, what status, did failover
 * run, what was the quota/limit state, which correlation id" — and deliberately
 * carries none of the message: no tokens, no verification URLs, no rendered body, no
 * unmasked address.
 */
async function reportDecision(params: {
  purpose: GovernedEmailPurpose
  maskedEmail: string
  idempotencyKey: string
  outcome: 'sent' | 'blocked' | 'failed'
  blocked?: GovernedEmailBlockReason
  result?: SendEmailResult
}): Promise<void> {
  // A blocked send is normal operation (a limit doing its job), not an incident.
  if (params.outcome === 'blocked') {
    console.warn(
      `[email-governance] blocked purpose=${params.purpose} reason=${params.blocked} recipient=${params.maskedEmail} key=${params.idempotencyKey}`
    )
    return
  }
  if (params.outcome === 'sent') return

  try {
    const { logErrorReport } = await import('@/lib/monitoring/logger')
    const { classifyProviderFailureKind } = await import('@/lib/monitoring/error-taxonomy')
    void logErrorReport({
      domain: 'email',
      kind: classifyProviderFailureKind(params.result?.statusCode),
      operation: 'email.governed_send',
      summary: 'A governed transactional email could not be delivered',
      subject: { templateKey: params.purpose, maskedEmail: params.maskedEmail },
      provider:
        params.result?.provider && params.result.provider !== 'simulated'
          ? { name: params.result.provider, statusCode: params.result.statusCode }
          : undefined,
      nextAction:
        'Check provider credit and credentials. Learners on this path cannot verify their address or reset their password until it clears.',
      details: {
        purpose: params.purpose,
        idempotencyKey: params.idempotencyKey,
        providerMessage: params.result?.error,
        providerCode: params.result?.providerCode ?? null,
      },
    })
  } catch {
    // Never let instrumentation break a send path.
  }
}

/**
 * Sends one transactional email under full platform governance.
 *
 * Returns `sent: false` with a `blocked` reason when a control refused it — callers
 * should treat that as a normal, expected outcome and must not retry around it.
 */
export async function sendGovernedEmail(request: GovernedEmailRequest): Promise<GovernedEmailResult> {
  const { purpose, to, idempotencyKey } = request
  const maskedEmail = maskEmail(to)
  const isCritical = CRITICAL_PURPOSES.has(purpose)

  // Resolved once and threaded through every control below, so a single send makes a
  // single client acquisition rather than one per check.
  const supabase = getGovernanceClient()

  // 1. Kill switch. Hydrated from the database so an admin toggle actually reaches
  //    every serverless instance. This intentionally covers auth mail too: an
  //    operational stop that leaves the highest-volume path running is not a stop.
  const emailEnabled = await globalFeatureFlagService.isEnabledAsync('EMAIL_ENABLED')
  if (!emailEnabled) {
    await reportDecision({ purpose, maskedEmail, idempotencyKey, outcome: 'blocked', blocked: 'email_disabled' })
    return { sent: false, blocked: 'email_disabled' }
  }

  // 2. Global non-critical pause, and 3. suppression — both bypassed by critical auth
  //    mail, matching the queue processor so the two paths cannot disagree.
  const automations = await EmailAutomationsService.getState().catch(() => null)
  if (!isCritical && automations?.globalPause) {
    await reportDecision({ purpose, maskedEmail, idempotencyKey, outcome: 'blocked', blocked: 'global_pause' })
    return { sent: false, blocked: 'global_pause' }
  }

  if (!isCritical && (await isSuppressed(supabase, to))) {
    await reportDecision({ purpose, maskedEmail, idempotencyKey, outcome: 'blocked', blocked: 'suppressed' })
    return { sent: false, blocked: 'suppressed' }
  }

  // 4. Rate limits. All three fail closed: an unreachable limiter must not become an
  //    unmetered path to a paid provider.
  const recipientLimit = RECIPIENT_LIMITS[purpose]
  const aggregateLimit = aggregateHourlyCeiling(automations?.dailyLimit ?? 100)

  const [recipientCheck, ipCheck, aggregateCheck] = await Promise.all([
    evaluatePersistentRateLimit(`email_to:${purpose}:${to.toLowerCase()}`, {
      ...recipientLimit,
      failClosed: true,
    }),
    request.ipBucket
      ? evaluatePersistentRateLimit(`email_ip:${request.ipBucket}`, { ...IP_EMAIL_LIMIT, failClosed: true })
      : Promise.resolve({ success: true, remaining: 0, resetInMs: 0 }),
    evaluatePersistentRateLimit('email_global:governed', {
      limit: aggregateLimit,
      windowMs: AGGREGATE_WINDOW_MS,
      failClosed: true,
    }),
  ])

  if (!recipientCheck.success) {
    await reportDecision({ purpose, maskedEmail, idempotencyKey, outcome: 'blocked', blocked: 'rate_limited_recipient' })
    return { sent: false, blocked: 'rate_limited_recipient', resetInMs: recipientCheck.resetInMs }
  }
  if (!ipCheck.success) {
    await reportDecision({ purpose, maskedEmail, idempotencyKey, outcome: 'blocked', blocked: 'rate_limited_ip' })
    return { sent: false, blocked: 'rate_limited_ip', resetInMs: ipCheck.resetInMs }
  }
  if (!aggregateCheck.success) {
    await reportDecision({ purpose, maskedEmail, idempotencyKey, outcome: 'blocked', blocked: 'rate_limited_aggregate' })
    return { sent: false, blocked: 'rate_limited_aggregate', resetInMs: aggregateCheck.resetInMs }
  }

  // 5. Durable idempotency claim. Concurrent duplicates lose the claim and return
  //    here, so only one of them can ever reach a provider.
  const claimed = await claimIdempotencyKey(supabase, idempotencyKey, purpose, maskedEmail)
  if (!claimed) {
    return { sent: false, blocked: 'duplicate' }
  }

  // 6. Reserve provider quota BEFORE dispatch. Reserving after a send is what made
  //    the 2026-09-06 quota purely decorative.
  const primary = resolvePrimaryProvider()
  const dailyLimit = automations?.dailyLimit ?? 100
  let chargedProvider = primary
  let preferProvider: typeof primary | undefined

  const reserved = await reserveProviderQuota(primary, dailyLimit)
  if (!reserved) {
    // The primary is spent. That is not a reason to stop — it is the reason the
    // secondary exists. Reserve against the secondary and tell the transport to start
    // there, so this send does not spend a request rediscovering that the primary has
    // no credit. Only a failure on BOTH is a block.
    const { getSecondaryProvider, isProviderConfigured } = await import('@/lib/notifications/config')
    const secondary = getSecondaryProvider(primary)
    const secondaryUsable = isProviderConfigured(secondary) && (await reserveProviderQuota(secondary, dailyLimit))
    if (!secondaryUsable) {
      await finalizeIdempotencyKey(supabase, idempotencyKey, 'failed', { success: false, error: 'All provider quotas exhausted' })
      await reportDecision({ purpose, maskedEmail, idempotencyKey, outcome: 'blocked', blocked: 'quota_exhausted' })
      return { sent: false, blocked: 'quota_exhausted' }
    }
    chargedProvider = secondary
    preferProvider = secondary
  }

  const result = await sendEmail({
    to,
    subject: request.subject,
    html: request.html,
    text: request.text,
    fromEmail: request.fromEmail,
    replyTo: request.replyTo,
    preferProvider,
  })

  if (!result.success) {
    // Give the reservation back: no provider accepted the message, so it did not cost
    // a send. Leaving it consumed would let repeated failures eat the day's ceiling.
    await releaseProviderQuota(chargedProvider)
  }

  await finalizeIdempotencyKey(supabase, idempotencyKey, result.success ? 'sent' : 'failed', result)
  await reportDecision({
    purpose,
    maskedEmail,
    idempotencyKey,
    outcome: result.success ? 'sent' : 'failed',
    result,
  })

  return {
    sent: result.success,
    provider: result.provider,
    id: result.id,
    error: result.success ? undefined : result.error,
    statusCode: result.statusCode,
  }
}
