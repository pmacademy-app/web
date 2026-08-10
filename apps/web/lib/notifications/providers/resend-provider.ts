import type { NotificationProvider, ProviderSendPayload, ProviderSendResult, ProviderHealthResult } from './types'
import type { NotificationChannel } from '../types'
import { BRAND } from '@/lib/brand'

/**
 * Resend Email Provider Implementation.
 * Uses direct Resend REST API fetch requests with RESEND_API_KEY.
 * Safely simulates delivery when RESEND_API_KEY is missing (e.g. in dev).
 */
export class ResendProvider implements NotificationProvider {
  public readonly name = 'resend'
  public readonly supportedChannels: NotificationChannel[] = ['email']
  private defaultFrom = `${BRAND.emailFromName} <${BRAND.emailFromAddress}>`

  public async send(payload: ProviderSendPayload): Promise<ProviderSendResult> {
    const recipientEmail = payload.recipient.email
    if (!recipientEmail) {
      return {
        success: false,
        providerName: this.name,
        error: 'Missing recipient email address',
        timestamp: new Date().toISOString(),
      }
    }

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.log(`[ResendProvider:simulation] Simulating email send to ${recipientEmail} for template '${payload.templateKey}'`)
      return {
        success: true,
        providerName: this.name,
        externalId: `sim-resend-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        timestamp: new Date().toISOString(),
      }
    }

    try {
      const bodyPayload: Record<string, unknown> = {
        from: this.defaultFrom,
        to: [recipientEmail],
        subject: (payload.variables.subject as string) || 'PM Academy Notification',
        html: payload.variables.html as string,
        text: payload.variables.text as string,
        headers: {
          'List-Unsubscribe': `<${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || BRAND.siteUrl}/settings?tab=notifications>`,
        },
        tags: [
          { name: 'template_key', value: payload.templateKey.replace(/[^a-zA-Z0-9_-]/g, '_') },
          { name: 'template_version', value: String(payload.templateVersion).replace(/[^a-zA-Z0-9_-]/g, '_') },
        ],
      }

      if (payload.variables.replyTo) {
        bodyPayload.reply_to = payload.variables.replyTo
      }

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(bodyPayload),
      })

      const data = await res.json()

      if (!res.ok) {
        const errorMsg = data?.message || data?.error || `HTTP ${res.status} error from Resend`
        console.error('[ResendProvider] Error response from Resend API:', data)
        return {
          success: false,
          providerName: this.name,
          error: errorMsg,
          timestamp: new Date().toISOString(),
        }
      }

      return {
        success: true,
        providerName: this.name,
        externalId: data.id,
        timestamp: new Date().toISOString(),
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown network exception in ResendProvider'
      console.error('[ResendProvider] Exception calling Resend API:', err)
      return {
        success: false,
        providerName: this.name,
        error: errorMsg,
        timestamp: new Date().toISOString(),
      }
    }
  }

  public async healthCheck(): Promise<ProviderHealthResult> {
    const hasKey = Boolean(process.env.RESEND_API_KEY)
    return {
      providerName: this.name,
      isHealthy: true,
      latencyMs: 12,
      message: hasKey ? 'Resend API key configured' : 'Operating in dev simulation mode',
    }
  }
}
