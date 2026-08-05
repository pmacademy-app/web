import type { NotificationProvider, ProviderSendPayload, ProviderSendResult, ProviderHealthResult } from './types'
import type { NotificationChannel } from '../types'

/**
 * Resend Email Provider Scaffold.
 * Implements NotificationProvider interface without executing actual email sends.
 */
export class ResendProvider implements NotificationProvider {
  public readonly name = 'resend'
  public readonly supportedChannels: NotificationChannel[] = ['email']

  public async send(payload: ProviderSendPayload): Promise<ProviderSendResult> {
    if (!payload.recipient.email) {
      return {
        success: false,
        providerName: this.name,
        error: 'Missing recipient email address',
        timestamp: new Date().toISOString(),
      }
    }

    // Scaffold implementation - actual API calls belong to future implementation sprint
    return {
      success: true,
      providerName: this.name,
      externalId: `scaffold-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
    }
  }

  public async healthCheck(): Promise<ProviderHealthResult> {
    return {
      providerName: this.name,
      isHealthy: true,
      latencyMs: 15,
      message: 'Resend provider scaffold ready',
    }
  }
}
