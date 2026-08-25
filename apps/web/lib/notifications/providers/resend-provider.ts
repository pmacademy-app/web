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
    const isTest = process.env.NODE_ENV === 'test' || process.env.RESEND_SIMULATE === 'true'
    if (!apiKey || isTest) {
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
        subject: (payload.variables.subject as string) || 'Prodily Notification',
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
        signal: AbortSignal.timeout(8000),
      })

      const data = await res.json()

      if (!res.ok) {
        const errorMsg = data?.message || data?.error || `HTTP ${res.status} error from Resend`
        console.error('[ResendProvider] Error response from Resend API:', data)
        
        try {
          const { logSystemError } = await import('@/lib/monitoring/logger')
          void logSystemError({
            severity: 'critical',
            category: 'resend',
            operation: 'send_email',
            message: errorMsg,
            templateKey: payload.templateKey,
            details: { status: res.status },
          })
        } catch {
          // Non-fatal logger fallback
        }

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
      // Distinguish timeout / abort from generic network failures for actionable diagnostics.
      // Node 18+ fetch errors carry a `cause` property with the underlying syscall error.
      const isTimeout =
        err instanceof Error &&
        (err.name === 'TimeoutError' || err.name === 'AbortError' ||
          (err.cause instanceof Error && (err.cause.name === 'TimeoutError' || err.cause.name === 'AbortError')))

      const isDns =
        err instanceof Error &&
        (err.message.includes('ENOTFOUND') || err.message.includes('ECONNREFUSED') ||
          (err.cause instanceof Error && (err.cause.message?.includes('ENOTFOUND') || err.cause.message?.includes('ECONNREFUSED'))))

      let friendlyMsg: string
      if (isTimeout) {
        friendlyMsg = `Resend API request timed out after 8 s (template: ${payload.templateKey})`
      } else if (isDns) {
        const underlying = (err instanceof Error && err.cause instanceof Error) ? err.cause.message : (err instanceof Error ? err.message : 'DNS failure')
        friendlyMsg = `Resend API unreachable — DNS/connection failure: ${underlying}`
      } else {
        const cause = err instanceof Error && err.cause instanceof Error ? ` — cause: ${err.cause.message}` : ''
        friendlyMsg = `Network exception calling Resend API: ${err instanceof Error ? err.name + ': ' + err.message : String(err)}${cause}`
      }

      console.error('[ResendProvider] Exception calling Resend API:', friendlyMsg)

      try {
        const { logSystemError } = await import('@/lib/monitoring/logger')
        void logSystemError({
          severity: 'critical',
          category: 'resend',
          operation: 'send_email',
          message: friendlyMsg,
          templateKey: payload.templateKey,
          details: { errorName: err instanceof Error ? err.name : 'unknown', isTimeout, isDns },
        })
      } catch {
        // Non-fatal logger fallback
      }

      return {
        success: false,
        providerName: this.name,
        error: friendlyMsg,
        timestamp: new Date().toISOString(),
      }
    }
  }

  public async healthCheck(): Promise<ProviderHealthResult> {
    const hasKey = Boolean(process.env.RESEND_API_KEY)
    return {
      providerName: this.name,
      isHealthy: hasKey,
      latencyMs: 12,
      message: hasKey ? 'Resend API key configured and ready' : 'Monitoring Not Configured (RESEND_API_KEY missing)',
    }
  }
}
