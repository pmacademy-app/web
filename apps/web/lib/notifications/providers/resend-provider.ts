import type { NotificationProvider, ProviderSendPayload, ProviderSendResult, ProviderHealthResult } from './types'
import type { NotificationChannel } from '../types'
import { BRAND } from '@/lib/brand'
import { EMAIL_HTTP_TIMEOUT_MS } from '../config'
import { maskEmail } from '@/lib/email'

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
    const isTest = (process.env.NODE_ENV === 'test' && process.env.ALLOW_TEST_NETWORK_EMAILS !== 'true') || process.env.RESEND_SIMULATE === 'true'
    if (!apiKey || isTest) {
      console.log(`[ResendProvider:simulation] Simulating email send to ${recipientEmail} for template '${payload.templateKey}'`)
      return {
        success: true,
        providerName: this.name,
        externalId: `sim-resend-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        statusCode: 200,
        timestamp: new Date().toISOString(),
      }
    }

    try {
      const fromEmail =
        (payload.variables.fromEmail as string) ||
        (process.env.RESEND_FROM_EMAIL || process.env.BREVO_FROM_EMAIL)?.trim() ||
        this.defaultFrom

      const headers: Record<string, string> = {}
      if (payload.variables.suppressListUnsubscribe !== true) {
        headers['List-Unsubscribe'] = `<${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || BRAND.siteUrl}/settings?tab=notifications>`
      }
      if (payload.variables.headers && typeof payload.variables.headers === 'object') {
        Object.assign(headers, payload.variables.headers)
      } else if (payload.variables.customHeaders && typeof payload.variables.customHeaders === 'object') {
        Object.assign(headers, payload.variables.customHeaders)
      }

      let tags: Array<{ name: string; value: string }> | undefined
      if (payload.variables.suppressMarketingTags !== true) {
        if (Array.isArray(payload.variables.tags)) {
          tags = payload.variables.tags as Array<{ name: string; value: string }>
        } else {
          tags = [
            { name: 'template_key', value: payload.templateKey.replace(/[^a-zA-Z0-9_-]/g, '_') },
            { name: 'template_version', value: String(payload.templateVersion).replace(/[^a-zA-Z0-9_-]/g, '_') },
          ]
        }
      }

      const bodyPayload: Record<string, unknown> = {
        from: fromEmail,
        to: [recipientEmail],
        subject: (payload.variables.subject as string) || 'Prodily Notification',
        html: payload.variables.html as string,
        text: payload.variables.text as string,
      }

      if (Object.keys(headers).length > 0) {
        bodyPayload.headers = headers
      }

      if (tags && tags.length > 0) {
        bodyPayload.tags = tags
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
        signal: AbortSignal.timeout(EMAIL_HTTP_TIMEOUT_MS),
      })

      const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string }

      if (!res.ok) {
        const errorMsg = data?.message || `HTTP ${res.status} error from Resend`
        const statusCode = res.status
        // Resend names the condition in `name` (e.g. `rate_limit_exceeded`,
        // `daily_quota_exceeded`). Same reasoning as Brevo: the code, not just the
        // status, decides whether the other provider is worth trying.
        const providerCode = [data?.name, data?.message].filter(Boolean).join(' ') || undefined
        console.error('[ResendProvider] Error response from Resend API:', data)
        
        try {
          const { logErrorReport } = await import('@/lib/monitoring/logger')
          const { classifyProviderFailureKind } = await import('@/lib/monitoring/error-taxonomy')
          const op = payload.operation || 'email.provider_send'
          void logErrorReport({
            domain: 'email',
            kind: classifyProviderFailureKind(statusCode),
            operation: op,
            summary: op === 'email.direct_send' ? 'Resend refused a direct transactional send' : 'Resend rejected an email send',
            subject: {
              templateKey: payload.templateKey,
              userId: payload.recipient.userId,
              maskedEmail: maskEmail(recipientEmail),
            },
            provider: { name: this.name, statusCode },
            details: { providerMessage: errorMsg, providerCode: data?.name ?? null },
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
        externalId: data.id || `resend-${Date.now()}`,
        statusCode: res.status,
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
        const { logErrorReport } = await import('@/lib/monitoring/logger')
        const op = payload.operation || 'email.provider_send'
        void logErrorReport({
          domain: 'email',
          kind: isTimeout ? 'provider_timeout' : 'provider_outage',
          operation: op,
          summary: op === 'email.direct_send' ? 'Resend refused a direct transactional send' : (isTimeout ? 'Resend API request timed out' : 'Resend API was unreachable'),
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
        // No HTTP response was produced. Timeout -> 504, other network faults -> 503,
        // matching the convention in `lib/email.ts` so both stacks classify alike.
        statusCode: isTimeout ? 504 : 503,
        timestamp: new Date().toISOString(),
      }
    }
  }

  public isConfigured(): boolean {
    return Boolean(process.env.RESEND_API_KEY)
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
