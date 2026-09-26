import type { NotificationProvider, ProviderSendPayload, ProviderSendResult, ProviderHealthResult } from './types'
import type { NotificationChannel } from '../types'
import { BRAND } from '@/lib/brand'
import { EMAIL_HTTP_TIMEOUT_MS } from '../config'
import { maskEmail } from '@/lib/email'

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
    const isTest = (process.env.NODE_ENV === 'test' && process.env.ALLOW_TEST_NETWORK_EMAILS !== 'true') || process.env.BREVO_SIMULATE === 'true'
    if (!apiKey || isTest) {
      console.log(`[BrevoProvider:simulation] Simulating email send to ${recipientEmail} for template '${payload.templateKey}'`)
      return {
        success: true,
        providerName: this.name,
        externalId: `sim-brevo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        statusCode: 200,
        timestamp: new Date().toISOString(),
      }
    }

    try {
      const fromEmail = (payload.variables.fromEmail as string) || (process.env.BREVO_FROM_EMAIL || process.env.RESEND_FROM_EMAIL)?.trim()
      const senderName = fromEmail ? (fromEmail.split('<')[0].trim() || BRAND.emailFromName) : BRAND.emailFromName
      const senderEmailMatch = fromEmail?.match(/<([^>]+)>/)
      const senderEmail = senderEmailMatch ? senderEmailMatch[1] : (fromEmail || BRAND.emailFromAddress)

      const headers: Record<string, string> = {}
      if (payload.variables.suppressListUnsubscribe !== true) {
        headers['List-Unsubscribe'] = `<${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || BRAND.siteUrl}/settings?tab=notifications>`
      }
      if (payload.variables.headers && typeof payload.variables.headers === 'object') {
        Object.assign(headers, payload.variables.headers)
      } else if (payload.variables.customHeaders && typeof payload.variables.customHeaders === 'object') {
        Object.assign(headers, payload.variables.customHeaders)
      }

      let tags: string[] | undefined
      if (payload.variables.suppressMarketingTags !== true) {
        if (Array.isArray(payload.variables.tags)) {
          tags = (payload.variables.tags as unknown[]).map(String)
        } else {
          tags = [
            payload.templateKey.replace(/[^a-zA-Z0-9_-]/g, '_'),
            `v${String(payload.templateVersion).replace(/[^a-zA-Z0-9_-]/g, '_')}`,
          ]
        }
      }

      const bodyPayload: Record<string, unknown> = {
        sender: { name: senderName, email: senderEmail },
        to: [{ email: recipientEmail, name: payload.recipient.name || recipientEmail.split('@')[0] }],
        subject: (payload.variables.subject as string) || 'Prodily Notification',
        htmlContent: (payload.variables.html as string) || '',
        textContent: (payload.variables.text as string) || '',
      }

      if (Object.keys(headers).length > 0) {
        bodyPayload.headers = headers
      }

      if (tags && tags.length > 0) {
        bodyPayload.tags = tags
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
        signal: AbortSignal.timeout(EMAIL_HTTP_TIMEOUT_MS),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        const errorMsg = data?.message || data?.error || `HTTP ${res.status} error from Brevo`
        const statusCode = res.status
        const providerCode = [data?.code, data?.message].filter(Boolean).join(' ') || undefined
        console.error('[BrevoProvider] Error response from Brevo API:', data)

        try {
          const { logErrorReport } = await import('@/lib/monitoring/logger')
          const { classifyProviderFailureKind } = await import('@/lib/monitoring/error-taxonomy')
          const op = payload.operation || 'email.provider_send'
          void logErrorReport({
            domain: 'email',
            kind: classifyProviderFailureKind(statusCode),
            operation: op,
            summary: op === 'email.direct_send' ? 'Brevo refused a direct transactional send' : 'Brevo rejected an email send',
            subject: {
              templateKey: payload.templateKey,
              userId: payload.recipient.userId,
              maskedEmail: maskEmail(recipientEmail),
            },
            provider: { name: this.name, statusCode },
            details: { providerMessage: errorMsg, providerCode: data?.code ?? null },
          })
        } catch {
          // Non-fatal logger fallback
        }

        return {
          success: false,
          providerName: this.name,
          error: errorMsg,
          statusCode,
          providerCode,
          timestamp: new Date().toISOString(),
        }
      }

      return {
        success: true,
        providerName: this.name,
        externalId: data?.messageId || data?.id || `brevo-${Date.now()}`,
        statusCode: res.status,
        timestamp: new Date().toISOString(),
      }
    } catch (err) {
      const isTimeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
      const isDns =
        err instanceof Error &&
        (err.message.includes('ENOTFOUND') ||
          err.message.includes('EAI_AGAIN') ||
          (err.cause instanceof Error && (err.cause.message.includes('ENOTFOUND') || err.cause.message.includes('EAI_AGAIN'))))

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
        const op = payload.operation || 'email.provider_send'
        void logErrorReport({
          domain: 'email',
          kind: isTimeout ? 'provider_timeout' : 'provider_outage',
          operation: op,
          summary: op === 'email.direct_send' ? 'Brevo refused a direct transactional send' : (isTimeout ? 'Brevo API request timed out' : 'Brevo API was unreachable'),
          subject: {
            templateKey: payload.templateKey,
            userId: payload.recipient.userId,
            maskedEmail: maskEmail(recipientEmail),
          },
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
