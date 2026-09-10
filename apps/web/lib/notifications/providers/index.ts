import type { NotificationChannel } from '../types'
import type { NotificationProvider, ProviderSendPayload, ProviderSendResult } from './types'
import { ResendProvider } from './resend-provider'
import { BrevoProvider } from './brevo-provider'
import { classifyProviderFailure, isCapacityExhaustionSignal } from './failure-classification'
import { isProviderExhausted, markProviderExhausted } from './provider-quota'
import { resolvePrimaryProvider, getSecondaryProvider, type EmailProviderName } from '../config'

export * from './types'
export * from './resend-provider'
export * from './brevo-provider'
export * from './failure-classification'
export * from './provider-quota'

export class ProviderRegistry {
  private providers: Map<string, NotificationProvider> = new Map()

  constructor() {
    // Scaffold default email providers
    this.registerProvider(new BrevoProvider())
    this.registerProvider(new ResendProvider())
  }

  public registerProvider(provider: NotificationProvider): void {
    this.providers.set(provider.name, provider)
  }

  public getProvider(name: string): NotificationProvider | undefined {
    return this.providers.get(name)
  }

  public getProvidersForChannel(channel: NotificationChannel): NotificationProvider[] {
    return Array.from(this.providers.values()).filter((p) =>
      p.supportedChannels.includes(channel)
    )
  }

  public getAllProviders(): NotificationProvider[] {
    return Array.from(this.providers.values())
  }
}

export const globalProviderRegistry = new ProviderRegistry()

/**
 * Returns the active configured email provider.
 *
 * Selection is delegated to the shared `resolvePrimaryProvider()` so this registry and
 * the direct transport in `lib/email.ts` can never disagree about which provider is
 * primary (they previously did — see `lib/notifications/config.ts`).
 */
export function getActiveEmailProvider(registry: ProviderRegistry = globalProviderRegistry): NotificationProvider {
  const preferred = resolvePrimaryProvider()
  const provider = registry.getProvider(preferred)
  if (provider) return provider
  return registry.getProvider('brevo') || registry.getProvider('resend') || new BrevoProvider()
}

/** Outcome of a send that may have involved a failover to the secondary provider. */
export interface FailoverSendResult {
  success: boolean
  /** Provider whose result decided the outcome — the one that delivered, or the last tried. */
  provider?: string
  externalId?: string
  /** Human-readable failure summary. On a both-provider failure this names BOTH providers. */
  error?: string
  /** Every attempt made, in order. At most two entries. */
  attempts: ProviderSendResult[]
  /** True when the secondary provider was tried after the primary failed. */
  failedOver: boolean
}

/** "brevo: Plan sending limit reached | resend: Internal error" */
function describeAttempts(attempts: ProviderSendResult[]): string {
  return attempts
    .map((a) => `${a.providerName}: ${a.error || `HTTP ${a.statusCode ?? 'unknown'}`}`)
    .join(' | ')
}

/**
 * Sends one email through the primary provider and, when that provider could not
 * accept it, retries ONCE on the other configured provider.
 *
 * This is the single failover implementation for the platform. The queue processor
 * previously resolved one provider and re-tried the same one on every retry cycle, so
 * the second provider was never attempted — a Brevo quota exhaustion stalled the whole
 * queue while a healthy Resend key sat idle.
 *
 * Guarantees:
 *  - at most ONE secondary attempt; never a third provider call
 *  - failover only for `classifyProviderFailure() === 'failover'`
 *  - the secondary is skipped unless it actually has credentials, since an
 *    unconfigured provider reports a simulated success
 *  - every attempt is returned so callers can record what was tried and why it failed
 */
export async function sendEmailWithFailover(
  payload: ProviderSendPayload,
  registry: ProviderRegistry = globalProviderRegistry,
  preferProvider?: EmailProviderName
): Promise<FailoverSendResult> {
  const attempts: ProviderSendResult[] = []

  const configuredPrimary = getActiveEmailProvider(registry)
  const configuredPrimaryName = configuredPrimary.name as EmailProviderName
  const alternateName = getSecondaryProvider(configuredPrimaryName)
  const alternate = registry.getProvider(alternateName)

  // Skip a provider already known to be out of credit for today rather than spending
  // another request to rediscover it. Without this the queue kept hammering the
  // exhausted Brevo on every retry cycle — one wasted call per item, forever.
  let primary = configuredPrimary
  let startedOnSecondary = false
  if (preferProvider) {
    const preferred = registry.getProvider(preferProvider)
    if (preferred && preferred.isConfigured()) {
      primary = preferred
      if (preferred.name !== configuredPrimaryName) {
        startedOnSecondary = true
      }
    }
  } else if (payload.operation !== 'email.direct_send' && (await isProviderExhausted(configuredPrimaryName))) {
    if (alternate && alternate.isConfigured() && !(await isProviderExhausted(alternateName))) {
      primary = alternate
      startedOnSecondary = true
    }
  }

  const primaryResult = await primary.send(payload)
  attempts.push(primaryResult)

  if (!primaryResult.success && isCapacityExhaustionSignal(primaryResult.statusCode, primaryResult.providerCode)) {
    await markProviderExhausted(primary.name as EmailProviderName)
  }

  if (primaryResult.success) {
    return {
      success: true,
      provider: primaryResult.providerName,
      externalId: primaryResult.externalId,
      attempts,
      failedOver: startedOnSecondary,
    }
  }

  // Both providers would reject this identically (bad payload, bad credentials) —
  // failing over would only hide the real problem behind a second identical failure.
  if (classifyProviderFailure(primaryResult.statusCode, primaryResult.providerCode) !== 'failover') {
    return {
      success: false,
      provider: primaryResult.providerName,
      error: primaryResult.error,
      attempts,
      failedOver: startedOnSecondary,
    }
  }

  // Never fall back onto the provider we just started from.
  const secondaryName = getSecondaryProvider(primary.name as EmailProviderName)
  const secondary = startedOnSecondary ? undefined : registry.getProvider(secondaryName)

  if (!secondary || !secondary.isConfigured()) {
    return {
      success: false,
      provider: primaryResult.providerName,
      error: `${primaryResult.error} (no configured failover provider: ${secondaryName})`,
      attempts,
      failedOver: startedOnSecondary,
    }
  }

  const secondaryResult = await secondary.send(payload)
  attempts.push(secondaryResult)

  if (!secondaryResult.success && isCapacityExhaustionSignal(secondaryResult.statusCode, secondaryResult.providerCode)) {
    await markProviderExhausted(secondary.name as EmailProviderName)
  }

  if (secondaryResult.success) {
    return {
      success: true,
      provider: secondaryResult.providerName,
      externalId: secondaryResult.externalId,
      attempts,
      failedOver: true,
    }
  }

  // Both providers refused. Surface BOTH failures — an admin looking at the resulting
  // queue row or alert must be able to tell that the failover ran and why each
  // provider declined, not just see the primary's error.
  //
  // This is the one email failure that is unambiguously critical: a single provider
  // outage is routine and covered by failover, but losing both means mail has stopped.
  // The individual attempts are already reported by each provider at their own
  // severity; this adds the escalated "no provider is working" incident on top.
  try {
    const { logErrorReport } = await import('@/lib/monitoring/logger')
    const { classifyProviderFailureKind } = await import('@/lib/monitoring/error-taxonomy')
    void logErrorReport({
      domain: 'email',
      kind: classifyProviderFailureKind(primaryResult.statusCode),
      operation: 'email.failover_exhausted',
      summary: 'Every configured email provider refused the send',
      subject: { templateKey: payload.templateKey, userId: payload.recipient.userId },
      provider: { name: secondaryResult.providerName, statusCode: secondaryResult.statusCode, attempt: 2 },
      allProvidersFailed: true,
      details: { attempts: describeAttempts(attempts) },
    })
  } catch {
    // Non-fatal logger fallback
  }

  return {
    success: false,
    provider: secondaryResult.providerName,
    error: `All email providers failed — ${describeAttempts(attempts)}`,
    attempts,
    failedOver: true,
  }
}
