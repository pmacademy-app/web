/**
 * Transactional Email Service via Resend API.
 *
 * Rules:
 * - Server-only. RESEND_API_KEY is never exposed to the browser.
 * - If RESEND_API_KEY is missing, logs email to console without throwing.
 */

import { BRAND } from '@/lib/brand'
import { classifyProviderFailure, isCapacityExhaustionSignal } from '@/lib/notifications/providers/failure-classification'
import { markProviderExhausted } from '@/lib/notifications/providers/provider-quota'
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

/**
 * Decides whether a failed send should retry on the OTHER provider.
 *
 * Delegates to the shared classifier so this transport and the queue's provider
 * registry apply identical rules. Failover covers provider-availability failures —
 * timeout, network error, 5xx — AND capacity exhaustion (402/408/429), which is
 * precisely the case a second provider exists for. It never covers failures both
 * providers would reject identically (400 bad recipient, 401/403 auth/config).
 *
 * Volume containment is enforced upstream by the pre-dispatch daily quota gate and
 * signup rate limiting, not by refusing to fail over.
 */
function isFailoverEligibleFailure(result: SendEmailResult): boolean {
  if (result.success) return false
  return classifyProviderFailure(result.statusCode, result.providerCode) === 'failover'
}

/**
 * Records capacity exhaustion so later dispatches skip this provider for the rest of
 * the UTC day instead of spending another request to rediscover that it has no credit.
 */
async function noteExhaustionIfCapacity(
  providerName: 'brevo' | 'resend',
  result: SendEmailResult
): Promise<void> {
  if (result.success) return
  if (!isCapacityExhaustionSignal(result.statusCode, result.providerCode)) return
  await markProviderExhausted(providerName)
}

/**
 * Records a transport failure as a structured incident.
 *
 * `lib/email.ts` carries signup verification and password reset via the Supabase Auth
 * hook, and until now it emitted only a console.error on failure — so the platform's
 * most business-critical email path produced zero rows in `system_errors` and zero
 * admin alerts. During a Brevo quota exhaustion an operator looking at /admin/system
 * would have seen a green all-clear.
 */
async function reportTransportFailure(
  providerName: 'brevo' | 'resend',
  result: SendEmailResult,
  to: string
): Promise<void> {
  try {
    const { logErrorReport } = await import('@/lib/monitoring/logger')
    const { classifyProviderFailureKind } = await import('@/lib/monitoring/error-taxonomy')
    void logErrorReport({
      domain: 'email',
      kind: classifyProviderFailureKind(result.statusCode),
      operation: 'email.direct_send',
      summary: `${providerName === 'brevo' ? 'Brevo' : 'Resend'} refused a direct transactional send`,
      subject: { maskedEmail: maskEmail(to) },
      provider: { name: providerName, statusCode: result.statusCode },
      details: { providerMessage: result.error },
    })
  } catch {
    // Never let instrumentation break a send path.
  }
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
}): Promise<SendEmailResult> {
  const fromEmail = customFromEmail || getFromEmail()
  const brevoApiKey = process.env.BREVO_API_KEY
  const resendApiKey = process.env.RESEND_API_KEY
  const isTest = process.env.NODE_ENV === 'test' && process.env.ALLOW_TEST_NETWORK_EMAILS !== 'true'
  const isSimulated = process.env.BREVO_SIMULATE === 'true' || process.env.RESEND_SIMULATE === 'true'

  // Shared with the provider registry so auth mail and queued mail always leave via
  // the same provider (previously this preferred Resend while the registry preferred
  // Brevo, splitting sender identity and DKIM alignment between the two stacks).
  const primaryProvider = resolvePrimaryProvider()

  const hasAnyKey = Boolean(brevoApiKey || resendApiKey)

  if (!hasAnyKey || isSimulated || isTest) {
    console.log(
      `[email] Email sending simulated (isTest=${isTest}, simulate=${isSimulated}, primary=${primaryProvider}) to ${maskEmail(to)}: "${subject}" from "${fromEmail}"`
    )
    return { success: true, id: `simulated-${primaryProvider}-${Date.now()}`, provider: 'simulated', statusCode: 200 }
  }

  // A provider already known to be out of credit is not worth a request. The caller
  // supplies that decision (see `preferProvider`), which is what stops "select the
  // exhausted Brevo, fail, fail over" from repeating on every single send.
  const hasOther = primaryProvider === 'brevo' ? Boolean(resendApiKey) : Boolean(brevoApiKey)
  const effectivePrimary = preferProvider && hasOther ? preferProvider : primaryProvider
  if (effectivePrimary !== primaryProvider) {
    console.log(`[email] Starting on ${effectivePrimary} instead of ${primaryProvider} at the caller's direction (primary exhausted).`)
  }

  if (effectivePrimary === 'brevo') {
    if (brevoApiKey) {
      const brevoRes = await sendViaBrevo(to, subject, html, text, fromEmail, brevoApiKey, replyTo)
      if (brevoRes.success) return brevoRes
      void reportTransportFailure('brevo', brevoRes, to)
      await noteExhaustionIfCapacity('brevo', brevoRes)
      // Never fail back onto the provider we skipped for being exhausted.
      const mayFailOver = Boolean(resendApiKey) && effectivePrimary === primaryProvider
      if (mayFailOver && isFailoverEligibleFailure(brevoRes)) {
        console.log(`[email] Brevo failover-eligible failure (status ${brevoRes.statusCode ?? 'network'}), falling back to Resend...`)
        const resendRes = await sendViaResend(to, subject, html, text, fromEmail, resendApiKey as string, replyTo)
        await noteExhaustionIfCapacity('resend', resendRes)
        return resendRes
      }
      if (!isFailoverEligibleFailure(brevoRes)) {
        console.warn(`[email] Brevo permanent failure (status ${brevoRes.statusCode}) — not falling back to Resend; both providers would reject this identically.`)
      }
      return brevoRes
    }
    if (resendApiKey) {
      return sendViaResend(to, subject, html, text, fromEmail, resendApiKey, replyTo)
    }
  } else {
    if (resendApiKey) {
      const resendRes = await sendViaResend(to, subject, html, text, fromEmail, resendApiKey, replyTo)
      if (resendRes.success) return resendRes
      void reportTransportFailure('resend', resendRes, to)
      await noteExhaustionIfCapacity('resend', resendRes)
      const mayFailOver = Boolean(brevoApiKey) && effectivePrimary === primaryProvider
      if (mayFailOver && isFailoverEligibleFailure(resendRes)) {
        console.log(`[email] Resend failover-eligible failure (status ${resendRes.statusCode ?? 'network'}), falling back to Brevo...`)
        const brevoRes = await sendViaBrevo(to, subject, html, text, fromEmail, brevoApiKey as string, replyTo)
        await noteExhaustionIfCapacity('brevo', brevoRes)
        return brevoRes
      }
      if (!isFailoverEligibleFailure(resendRes)) {
        console.warn(`[email] Resend permanent failure (status ${resendRes.statusCode}) — not falling back to Brevo; both providers would reject this identically.`)
      }
      return resendRes
    }
    if (brevoApiKey) {
      return sendViaBrevo(to, subject, html, text, fromEmail, brevoApiKey, replyTo)
    }
  }

  return {
    success: false,
    error: 'No valid email provider credentials configured',
    statusCode: 500,
    provider: 'simulated',
  }
}

async function sendViaBrevo(
  to: string,
  subject: string,
  html: string,
  text: string,
  fromEmail: string,
  apiKey: string,
  replyTo?: string
): Promise<SendEmailResult> {
  const senderName = fromEmail.split('<')[0].trim() || BRAND.emailFromName
  const senderEmailMatch = fromEmail.match(/<([^>]+)>/)
  const senderEmail = senderEmailMatch ? senderEmailMatch[1] : fromEmail

  try {
    const brevoBody: Record<string, unknown> = {
      sender: { name: senderName, email: senderEmail },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
      headers: {
        'List-Unsubscribe': `<${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || BRAND.siteUrl}/settings?tab=notifications>`,
      },
    }

    if (replyTo) {
      brevoBody.replyTo = { email: replyTo }
    }

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
        'accept': 'application/json',
      },
      body: JSON.stringify(brevoBody),
      signal: AbortSignal.timeout(8000),
    })

    const data = (await res.json().catch(() => ({}))) as { messageId?: string; id?: string; message?: string; code?: string }

    if (!res.ok) {
      console.warn(`[email] Brevo API error (status ${res.status}, code ${data.code ?? 'none'}):`, data.message || res.statusText)
      return {
        success: false,
        error: data.message ?? `Brevo error (${res.status})`,
        statusCode: res.status,
        // Brevo answers "no credit left" with HTTP 400 + code `not_enough_credits`.
        // Without this field the classifier saw only the 400 and called it permanent.
        providerCode: [data.code, data.message].filter(Boolean).join(' ') || undefined,
        provider: 'brevo',
      }
    }

    return { success: true, id: data.messageId || data.id, provider: 'brevo', statusCode: 200 }
  } catch (err) {
    const isTimeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
    console.error('[email] Exception sending via Brevo:', isTimeout ? 'Request timed out after 8s' : err)
    return {
      success: false,
      error: isTimeout ? 'Brevo request timed out' : (err instanceof Error ? err.message : 'Unknown network failure'),
      statusCode: isTimeout ? 504 : 503,
      provider: 'brevo',
    }
  }
}

async function sendViaResend(
  to: string,
  subject: string,
  html: string,
  text: string,
  fromEmail: string,
  apiKey: string,
  replyTo?: string
): Promise<SendEmailResult> {
  try {
    const resendBody: Record<string, unknown> = {
      from: fromEmail,
      to: [to],
      subject,
      html,
      text,
    }
    if (replyTo) {
      resendBody.reply_to = replyTo
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(resendBody),
      signal: AbortSignal.timeout(8000),
    })

    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string }

    if (!res.ok) {
      return {
        success: false,
        error: data.message ?? `Resend error (${res.status})`,
        statusCode: res.status,
        providerCode: [data.name, data.message].filter(Boolean).join(' ') || undefined,
        provider: 'resend',
      }
    }

    return { success: true, id: data.id, provider: 'resend', statusCode: 200 }
  } catch (err) {
    const isTimeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
    return {
      success: false,
      error: isTimeout ? 'Resend request timed out' : (err instanceof Error ? err.message : 'Unknown network failure'),
      statusCode: isTimeout ? 504 : 503,
      provider: 'resend',
    }
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
