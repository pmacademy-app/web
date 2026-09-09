/**
 * Transactional Email Service via Resend API.
 *
 * Rules:
 * - Server-only. RESEND_API_KEY is never exposed to the browser.
 * - If RESEND_API_KEY is missing, logs email to console without throwing.
 */

import { BRAND } from '@/lib/brand'
import { resolvePrimaryProvider } from '@/lib/notifications/config'

export interface EmailRecipient {
  email: string
  name?: string
}

export function getFromEmail(): string {
  const envFrom = (process.env.BREVO_FROM_EMAIL || process.env.RESEND_FROM_EMAIL)?.trim()
  if (envFrom) {
    if (envFrom.includes('<') && envFrom.includes('>')) {
      return envFrom
    }
    return `${BRAND.emailFromName} <${envFrom}>`
  }
  return `${BRAND.emailFromName} <${BRAND.emailFromAddress}>`
}

export interface SendEmailResult {
  success: boolean
  id?: string
  error?: string
  statusCode?: number
  /**
   * The provider's own error code/message. Brevo signals credit exhaustion as an
   * HTTP 400 with `{"code":"not_enough_credits"}`, so the status code alone cannot
   * decide failover eligibility. See `failure-classification.ts`.
   */
  providerCode?: string
  provider?: 'resend' | 'brevo' | 'simulated'
}

export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***'
  const [local, domain] = email.split('@')
  if (local.length <= 2) return `*@${domain}`
  return `${local[0]}***${local[local.length - 1]}@${domain}`
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  fromEmail: customFromEmail,
  replyTo,
  preferProvider,
  isCritical,
}: {
  to: string
  subject: string
  html: string
  text: string
  fromEmail?: string
  replyTo?: string
  /**
   * Start on this provider instead of the configured primary.
   *
   * Set by the governed gateway when it has already established that the configured
   * primary is out of credit for the day, so this send should not spend a request
   * rediscovering that. When it differs from the configured primary, failing back
   * onto the skipped provider is suppressed — it was skipped deliberately.
   *
   * The decision is passed in rather than looked up here so that the common path
   * stays a single provider call with no extra database round-trip.
   */
  preferProvider?: 'brevo' | 'resend'
  /**
   * Optional flag to indicate critical operational/system messages that can bypass
   * the EMAIL_ENABLED kill switch if explicitly configured.
   */
  isCritical?: boolean
}): Promise<SendEmailResult> {
  const fromEmail = customFromEmail || getFromEmail()

  // 1. Kill switch guard (I-04-B2)
  // Ensures direct sends also respect the platform-wide EMAIL_ENABLED kill switch.
  if (!isCritical) {
    try {
      const { globalFeatureFlagService } = await import('@/lib/notifications/feature-flags/service')
      const emailEnabled = globalFeatureFlagService.isEnabled('EMAIL_ENABLED')
      if (!emailEnabled) {
        console.warn(`[email] Direct send blocked: EMAIL_ENABLED kill switch is active (target: ${maskEmail(to)})`)
        return {
          success: false,
          error: 'Email delivery is disabled by platform kill switch (EMAIL_ENABLED=false)',
          statusCode: 503,
          provider: 'simulated',
        }
      }
    } catch (err) {
      console.error('[email] Error checking EMAIL_ENABLED kill switch:', err)
    }
  }

  const brevoApiKey = process.env.BREVO_API_KEY
  const resendApiKey = process.env.RESEND_API_KEY
  const isTest = process.env.NODE_ENV === 'test' && process.env.ALLOW_TEST_NETWORK_EMAILS !== 'true'
  const isSimulated = process.env.BREVO_SIMULATE === 'true' || process.env.RESEND_SIMULATE === 'true'
  const hasAnyKey = Boolean(brevoApiKey || resendApiKey)
  const primaryProvider = resolvePrimaryProvider()

  if (!hasAnyKey || isSimulated || isTest) {
    console.log(
      `[email] Email sending simulated (isTest=${isTest}, simulate=${isSimulated}, primary=${primaryProvider}) to ${maskEmail(to)}: "${subject}" from "${fromEmail}"`
    )
    return { success: true, id: `simulated-${primaryProvider}-${Date.now()}`, provider: 'simulated', statusCode: 200 }
  }

  // 2. Unified Canonical Provider Transport with Failover (I-04-B4)
  // Direct sends delegate to the canonical provider registry and failover state machine.
  const { sendEmailWithFailover, globalProviderRegistry } = await import('@/lib/notifications/providers')

  const failoverResult = await sendEmailWithFailover(
    {
      recipient: { email: to },
      channel: 'email',
      templateKey: 'direct.email',
      templateVersion: 1,
      variables: {
        subject,
        html,
        text,
        fromEmail,
        replyTo,
      },
      operation: 'email.direct_send',
    },
    globalProviderRegistry,
    preferProvider
  )

  if (failoverResult.success) {
    return {
      success: true,
      id: failoverResult.externalId,
      provider: failoverResult.provider as 'resend' | 'brevo' | 'simulated',
      statusCode: 200,
    }
  }

  const lastAttempt = failoverResult.attempts[failoverResult.attempts.length - 1]
  return {
    success: false,
    id: failoverResult.externalId,
    error: failoverResult.error || lastAttempt?.error,
    statusCode: lastAttempt?.statusCode ?? 500,
    providerCode: lastAttempt?.providerCode,
    provider: (failoverResult.provider || lastAttempt?.providerName) as 'resend' | 'brevo' | 'simulated',
  }
}

/**
 * Renders the waitlist confirmation email.
 *
 * Split out from sending so the caller can dispatch it through the governed gateway
 * (`lib/email-governance.ts`) instead of straight at a provider. The gateway imports
 * this module, so this module must not import the gateway — hence "build here, send
 * there" rather than a governed wrapper living alongside the template.
 */
export function buildWaitlistConfirmationEmail({
  name,
}: {
  name: string
}): { subject: string; html: string; text: string } {
  const firstName = name.split(' ')[0] ?? 'there'

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: ${BRAND.colors.foreground}; background-color: ${BRAND.colors.background}; padding: 20px; }
          .container { max-width: 560px; margin: 0 auto; background: #ffffff; padding: 32px; border-radius: 12px; border: 1px solid #e5e5e5; }
          .logo { margin-bottom: 24px; }
          .footer { margin-top: 32px; font-size: 12px; color: #737373; border-top: 1px solid #f5f5f5; padding-top: 16px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">
            <img src="${BRAND.siteUrl}${BRAND.assets.logoFullPng}" alt="${BRAND.fullName}" width="192" height="48" style="display:block; max-width:192px; width:100%; height:auto;" />
          </div>
          <h2>You're on the list, ${firstName}!</h2>
          <p>Thank you for joining the ${BRAND.shortName} waitlist.</p>
          <p>We're building a structured, free 90-lesson Product Management curriculum designed to take you from foundational principles to portfolio-ready artifacts - completely free.</p>
          <p>We'll notify you as soon as early access opens.</p>
          <div class="footer">
            ${BRAND.fullName} - ${BRAND.positioning}<br>
            If you didn't sign up for this waitlist, you can safely ignore this email.
          </div>
        </div>
      </body>
    </html>
  `

  const text = `Hi ${firstName},\n\nYou're on the list for ${BRAND.shortName}! We'll notify you as soon as early access opens.\n\n${BRAND.fullName} - ${BRAND.positioning}`

  return {
    subject: `You're on the ${BRAND.shortName} waitlist!`,
    html,
    text,
  }
}
