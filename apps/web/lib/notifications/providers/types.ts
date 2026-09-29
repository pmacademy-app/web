import type { NotificationChannel, EventEnvelope } from '../types'
export type { NotificationChannel }

export interface ProviderSendPayload {
  recipient: {
    userId?: string
    email?: string
    name?: string
    phone?: string
  }
  channel: NotificationChannel
  templateKey: string
  templateVersion: number
  variables: Record<string, unknown>
  event?: EventEnvelope
  operation?: 'email.direct_send' | 'email.provider_send'
  /**
   * Whether the learner is blocked without this message (verification, password
   * reset). Drives the ambiguous-timeout failover policy: a `critical` message fails
   * over to the second provider even on a timeout the primary may have accepted
   * (delivery preferred, a rare duplicate tolerated), while a `standard` message does
   * NOT cross-fail-over on a bare timeout (no-duplicate preferred). Absent is treated
   * as `standard`. See `sendEmailWithFailover`.
   */
  criticality?: 'critical' | 'standard'
  /**
   * Stable logical identity of the message. Passed to providers that support an
   * idempotency key (Resend `Idempotency-Key`) so a retry of the SAME provider cannot
   * produce a duplicate. Brevo's transactional API has no idempotency key, so this is
   * best-effort per provider — never rely on it for cross-provider dedup.
   */
  idempotencyKey?: string
}

export interface ProviderSendResult {
  success: boolean
  providerName: string
  externalId?: string
  error?: string
  /**
   * HTTP status from the provider API, when the request produced a response.
   * Absent when the request never reached the provider (DNS, refused connection).
   * Timeouts are reported as 504 and other network exceptions as 503, matching the
   * convention in `lib/email.ts`. Consumed by `classifyProviderFailure()`.
   */
  statusCode?: number
  /**
   * The provider's own error code (or, failing that, its message).
   *
   * Required alongside `statusCode` because Brevo reports credit exhaustion as an
   * ordinary HTTP 400 carrying `{"code":"not_enough_credits"}`. Classifying on the
   * status alone read that as a permanent bad-request and refused to fail over,
   * which is why Resend never took over during the 2026-09-09 incident.
   */
  providerCode?: string
  /**
   * True when the request was sent but no response arrived (a client-side timeout or
   * abort), so the provider MAY have accepted the message before we gave up. Distinct
   * from a definitive rejection (HTTP error response) or a connection that never
   * established (DNS/refused) — both of which are unambiguous. `sendEmailWithFailover`
   * uses this to avoid duplicating a `standard` message across providers on a timeout.
   */
  deliveryUncertain?: boolean
  timestamp: string
}

export interface ProviderHealthResult {
  providerName: string
  isHealthy: boolean
  latencyMs?: number
  message?: string
}

export interface NotificationProvider {
  name: string
  supportedChannels: NotificationChannel[]
  send(payload: ProviderSendPayload): Promise<ProviderSendResult>
  healthCheck(): Promise<ProviderHealthResult>
  /**
   * Whether this provider has credentials in the current environment.
   *
   * Failover must never target an unconfigured provider: without an API key both
   * provider classes short-circuit to a simulated success, which would report a
   * delivery that never happened.
   */
  isConfigured(): boolean
}
