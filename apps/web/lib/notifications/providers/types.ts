import type { NotificationChannel, EventEnvelope } from '../types'
export type { NotificationChannel }

export interface ProviderSendPayload {
  recipient: {
    userId: string
    email?: string
    name?: string
    phone?: string
  }
  channel: NotificationChannel
  templateKey: string
  templateVersion: number
  variables: Record<string, unknown>
  event?: EventEnvelope
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
