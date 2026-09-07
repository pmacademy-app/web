import type { NotificationProvider, ProviderSendPayload, ProviderSendResult, ProviderHealthResult } from './types'
import type { NotificationChannel } from '../types'
import { BRAND } from '@/lib/brand'

/**
 * Brevo (formerly Sendinblue) Transactional Email Provider Implementation.
 * Uses direct Brevo REST API (/v3/smtp/email) with BREVO_API_KEY.
 * Safely simulates delivery when BREVO_API_KEY is missing (e.g. in dev or unit tests).
 */
export class BrevoProvider implements NotificationProvider {
  public readonly name = 'brevo'
  public readonly supportedChannels: NotificationChannel[] = ['email']

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

    const apiKey = process.env.BREVO_API_KEY
    const isTest = process.env.NODE_ENV === 'test' || process.env.BREVO_SIMULATE === 'true'
    if (!apiKey || isTest) {
      console.log(`[BrevoProvider:simulation] Simulating email send to ${recipientEmail} for template '${payload.templateKey}'`)
      return {
        success: true,
        providerName: this.name,
        externalId: `sim-brevo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        timestamp: new Date().toISOString(),
      }
    }

    try {
      const senderName = BRAND.emailFromName
      const senderEmail = BRAND.emailFromAddress

      const bodyPayload: Record<string, unknown> = {
        sender: { name: senderName, email: senderEmail },
        to: [{ email: recipientEmail, name: payload.recipient.name || recipientEmail.split('@')[0] }],
        subject: (payload.variables.subject as string) || 'Prodily Notification',
        htmlContent: (payload.variables.html as string) || '',
        textContent: (payload.variables.text as string) || '',
        headers: {
          'List-Unsubscribe': `<${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || BRAND.siteUrl}/settings?tab=notifications>`,
        },
        tags: [
          payload.templateKey.replace(/[^a-zA-Z0-9_-]/g, '_'),
          `v${String(payload.templateVersion).replace(/[^a-zA-Z0-9_-]/g, '_')}`,
        ],
      }

      if (payload.variables.replyTo) {
        bodyPayload.replyTo = { email: payload.variables.replyTo as string }
      }

      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey,
          'accept': 'application/json',
        },
        body: JSON.stringify(bodyPayload),
        signal: AbortSignal.timeout(8000),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        const errorMsg = data?.message || data?.error || `HTTP ${res.status} error from Brevo`
        const statusCode = res.status
        console.error('[BrevoProvider] Error response from Brevo API:', data)

        try {
          const { logErrorReport } = await import('@/lib/monitoring/logger')
          const { classifyProviderFailureKind } = await import('@/lib/monitoring/error-taxonomy')
          void logErrorReport({
            domain: 'email',
            kind: classifyProviderFailureKind(statusCode),
            operation: 'email.provider_send',
            // Stable summary: the provider's own message goes in details, not here,
            // or every distinct error text would fingerprint separately.
            summary: 'Brevo rejected an email send',
            subject: { templateKey: payload.templateKey, userId: payload.recipient.userId },
            provider: { name: this.name, statusCode },
            details: { providerMessage: errorMsg },
          })
        } catch {
          // Non-fatal logger fallback
        }

        return {
          success: false,
          providerName: this.name,
          error: errorMsg,
          statusCode,
          timestamp: new Date().toISOString(),
        }
      }

      return {
        success: true,
        providerName: this.name,
        externalId: data.messageId || data.id,
        statusCode: res.status,
        timestamp: new Date().toISOString(),
      }
    } catch (err) {
      const isTimeout =
        err instanceof Error &&
        (err.name === 'TimeoutError' ||
          err.name === 'AbortError' ||
          (err.cause instanceof Error && (err.cause.name === 'TimeoutError' || err.cause.name === 'AbortError')))

      const isDns =
        err instanceof Error &&
        (err.message.includes('ENOTFOUND') ||
          err.message.includes('ECONNREFUSED') ||
          (err.cause instanceof Error &&
            (err.cause.message?.includes('ENOTFOUND') || err.cause.message?.includes('ECONNREFUSED'))))

      let friendlyMsg: string
      if (isTimeout) {
        friendlyMsg = `Brevo API request timed out after 8 s (template: ${payload.templateKey})`
      } else if (isDns) {
        const underlying =
          err instanceof Error && err.cause instanceof Error
            ? err.cause.message
            : err instanceof Error
              ? err.message
              : 'DNS failure'
        friendlyMsg = `Brevo API unreachable — DNS/connection failure: ${underlying}`
      } else {
        const cause = err instanceof Error && err.cause instanceof Error ? ` — cause: ${err.cause.message}` : ''
        friendlyMsg = `Network exception calling Brevo API: ${err instanceof Error ? err.name + ': ' + err.message : String(err)}${cause}`
      }

      console.error('[BrevoProvider] Exception calling Brevo API:', friendlyMsg)

      try {
        const { logErrorReport } = await import('@/lib/monitoring/logger')
        void logErrorReport({
          domain: 'email',
          kind: isTimeout ? 'provider_timeout' : 'provider_outage',
          operation: 'email.provider_send',
          summary: isTimeout ? 'Brevo API request timed out' : 'Brevo API was unreachable',
          subject: { templateKey: payload.templateKey, userId: payload.recipient.userId },
          provider: { name: this.name, statusCode: isTimeout ? 504 : 503 },
          details: { errorName: err instanceof Error ? err.name : 'unknown', isTimeout, isDns, detail: friendlyMsg },
        })
      } catch {
        // Non-fatal logger fallback
      }

      return {
        success: false,
        providerName: this.name,
        error: friendlyMsg,
        // No HTTP response was produced. Timeout -> 504, other network faults -> 503,
        // matching the convention in `lib/email.ts` so both stacks classify alike.
        statusCode: isTimeout ? 504 : 503,
        timestamp: new Date().toISOString(),
      }
    }
  }

  public isConfigured(): boolean {
    return Boolean(process.env.BREVO_API_KEY)
  }

  public async healthCheck(): Promise<ProviderHealthResult> {
    const hasKey = Boolean(process.env.BREVO_API_KEY)
    return {
      providerName: this.name,
      isHealthy: hasKey,
      latencyMs: 12,
      message: hasKey ? 'Brevo API key configured and ready' : 'Monitoring Not Configured (BREVO_API_KEY missing)',
    }
  }
}
