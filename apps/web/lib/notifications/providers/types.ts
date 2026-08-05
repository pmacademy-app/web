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
}
