import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { BRAND } from '@/lib/brand'
import { renderEmailTemplate } from '@/emails'
import { maskEmail } from '@/lib/email'
import { sendGovernedEmail, type GovernedEmailPurpose } from '@/lib/email-governance'
import { secretMatchesAny } from '@/lib/security/constant-time'
import { buildAuthCallbackUrl } from '@/lib/auth-url'
import { log } from '@/lib/monitoring/log'

export const runtime = 'nodejs'

// ─── Types for Supabase Auth Send Email Hook Payload ──────────────────────────

export interface SupabaseAuthUser {
  id: string
  email: string
  phone?: string
  user_metadata?: {
    full_name?: string
    name?: string
    [key: string]: unknown
  }
}

export interface SupabaseEmailData {
  token?: string
  token_hash?: string
  token_new?: string
  token_hash_new?: string
  redirect_to?: string
  email_action_type: 'signup' | 'recovery' | 'email_change' | 'magiclink' | 'invite' | 'reauthentication' | string
  site_url?: string
}

export interface SupabaseSendEmailHookPayload {
  user: SupabaseAuthUser
  email_data: SupabaseEmailData
}

// ─── Verification Helper ──────────────────────────────────────────────────────

function getSecretBytes(secret: string): Buffer {
  let clean = secret.trim()
  if (clean.startsWith('v1,')) {
    clean = clean.substring(3).trim()
  }
  if (clean.startsWith('whsec_')) {
    const base64Part = clean.substring(6).trim()
    try {
      const buf = Buffer.from(base64Part, 'base64')
      if (buf.length > 0) return buf
    } catch {
      // Fall back to raw UTF-8 bytes if base64 decoding fails
    }
  }
  return Buffer.from(clean, 'utf-8')
}

// Allowed clock drift between webhook timestamp and server clock: 5 minutes (300 seconds).
export const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300

function verifyHookSecret(request: NextRequest, rawBody: string, secret: string): boolean {
  // SEC-16: Bearer token and custom-header bypasses have been removed.
  void secretMatchesAny

  // 3. Standard Webhook / Svix / Supabase signature check
  const signatureHeader =
    request.headers.get('webhook-signature') ||
    request.headers.get('svix-signature') ||
    request.headers.get('x-supabase-signature') ||
    request.headers.get('x-signature') ||
    request.headers.get('x-webhook-signature')

  const msgId =
    request.headers.get('webhook-id') ||
    request.headers.get('svix-id') ||
    request.headers.get('x-supabase-id') ||
    ''

  const msgTimestamp =
    request.headers.get('webhook-timestamp') ||
    request.headers.get('svix-timestamp') ||
    ''

  if (!signatureHeader || !msgId || !msgTimestamp) {
    return false
  }

  // Reject timestamps more than 5 minutes from now in either direction (prevent replay attacks)
  const timestampSeconds = parseInt(msgTimestamp, 10)
  if (!Number.isFinite(timestampSeconds)) {
    return false
  }
  const nowSeconds = Math.floor(Date.now() / 1000)
  if (Math.abs(nowSeconds - timestampSeconds) > WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS) {
    return false
  }

  // Extract v1 signature candidates from header
  const sigParts = signatureHeader.split(/[\s,]+/)
  const v1Signatures: string[] = []

  if (signatureHeader.startsWith('v1,')) {
    v1Signatures.push(signatureHeader.substring(3).trim())
  }
  for (const part of sigParts) {
    const p = part.trim()
    if (p.startsWith('v1=')) {
      v1Signatures.push(p.substring(3).trim())
    } else if (p.startsWith('v1,')) {
      v1Signatures.push(p.substring(3).trim())
    }
  }

  if (v1Signatures.length === 0) {
    return false
  }

  const secretBytes = getSecretBytes(secret)
  const payloadToSign = `${msgId}.${msgTimestamp}.${rawBody}`
  const expectedHmacBase64 = crypto.createHmac('sha256', secretBytes).update(payloadToSign).digest('base64')
  const expectedBuffer = Buffer.from(expectedHmacBase64)

  for (const v1Sig of v1Signatures) {
    try {
      const sigBuffer = Buffer.from(v1Sig)
      if (
        sigBuffer.length === expectedBuffer.length &&
        crypto.timingSafeEqual(sigBuffer, expectedBuffer)
      ) {
        return true
      }
    } catch {
      // Length mismatch or invalid buffer
    }
  }

  return false
}

// ─── Callback URL Generator ───────────────────────────────────────────────────
// Handled by @/lib/auth-url

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/**
 * Maps a GoTrue action type onto the governed purpose that decides which controls
 * and which rate-limit budget apply.
 *
 * An unrecognized action is treated as `auth.verify_email`, matching the template
 * fallback below — an unknown action must land in a *metered* bucket, never in an
 * unmetered default.
 */
function purposeForAction(actionType: string): GovernedEmailPurpose {
  switch (actionType) {
    case 'recovery':
      return 'auth.password_reset'
    case 'email_change':
    case 'email_change_current':
    case 'email_change_new':
      return 'auth.email_change_verify'
    case 'invite':
      return 'auth.invite'
    case 'reauthentication':
      return 'auth.reauthentication'
    default:
      return 'auth.verify_email'
  }
}

/**
 * Derives a stable, non-reversible fingerprint of the one-time token.
 *
 * The token itself is a live credential. It is used here only to distinguish "the
 * same verification email, redelivered" from "a new verification request", and the
 * resulting idempotency key is persisted in `email_send_ledger`, so the raw value
 * must not survive into it.
 */
function fingerprintToken(tokenHash: string): string {
  if (!tokenHash) return 'no-token'
  return crypto.createHash('sha256').update(tokenHash).digest('hex').slice(0, 32)
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const secret = process.env.SEND_EMAIL_HOOK_SECRET

  // 1. Verify the hook secret. Fails closed unless this is explicitly local dev or a
  //    test run: an unset or unknown NODE_ENV (a misconfigured preview or staging
  //    deploy) must not turn this into an unauthenticated "send any auth email" API.
  //    Same rule as the email webhooks route.
  const allowUnverified = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'
  if (!secret) {
    if (!allowUnverified) {
      log.error('auth.hook.secret_not_configured', { environment: process.env.NODE_ENV ?? 'unset' })
      try {
        const { logSystemError } = await import('@/lib/monitoring/logger')
        void logSystemError({
          severity: 'error',
          category: 'auth',
          operation: 'send_email_hook_auth',
          message: 'Unauthorized request: SEND_EMAIL_HOOK_SECRET environment variable missing outside development/test',
        })
      } catch {}
      return jsonResponse({ error: 'Unauthorized: Missing hook secret configuration' }, 401)
    }
    log.warn('auth.hook.secret_not_configured', { environment: process.env.NODE_ENV, failClosed: false })
  } else {
    const isValid = verifyHookSecret(request, rawBody, secret)
    if (!isValid) {
      log.warn('auth.hook.signature_rejected')
      try {
        const { logSystemError } = await import('@/lib/monitoring/logger')
        void logSystemError({
          severity: 'warning',
          category: 'auth',
          operation: 'send_email_hook_auth',
          message: 'Unauthorized request: signature or secret verification failed',
        })
      } catch {}
      return jsonResponse({ error: 'Unauthorized: Invalid hook signature or secret' }, 401)
    }
  }

  // 2. Parse JSON payload
  let payload: SupabaseSendEmailHookPayload
  try {
    payload = JSON.parse(rawBody)
  } catch (err) {
    log.exception('auth.hook.payload_unparseable', err)
    try {
      const { logSystemError } = await import('@/lib/monitoring/logger')
      void logSystemError({
        severity: 'error',
        category: 'auth',
        operation: 'send_email_hook_parse',
        message: `Invalid JSON payload in Auth Send Email Hook: ${err instanceof Error ? err.message : 'Parse failure'}`,
      })
    } catch {}
    return jsonResponse({ error: 'Invalid JSON payload' }, 400)
  }

  const { user, email_data } = payload

  if (!user || !user.email) {
    return jsonResponse({ error: 'Missing user email in payload' }, 400)
  }

  if (!email_data || !email_data.email_action_type) {
    return jsonResponse({ error: 'Missing email_action_type in email_data' }, 400)
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || BRAND.siteUrl
  const toEmail = user.email
  const userName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email.split('@')[0] ||
    'Learner'

  const actionType = email_data.email_action_type
  const tokenHash = email_data.token_hash_new || email_data.token_hash || ''

  let templateKey: string
  let templateVariables: Record<string, unknown>

  // 3. Map Auth Action Type to existing code email template
  switch (actionType) {
    case 'signup': {
      templateKey = 'auth.verify_email'
      const verificationUrl = buildAuthCallbackUrl(siteUrl, tokenHash, 'signup', email_data.redirect_to)
      templateVariables = { userName, verificationUrl }
      break
    }

    case 'recovery': {
      templateKey = 'auth.password_reset'
      const resetUrl = buildAuthCallbackUrl(siteUrl, tokenHash, 'recovery', email_data.redirect_to)
      templateVariables = { userName, resetUrl }
      break
    }

    // Supabase reports email-change confirmations as 'email_change' (single
    // opt-in) or the granular 'email_change_current' / 'email_change_new'
    // (secure/double opt-in — one email to each address). All three must
    // resolve to the SAME canonical 'email_change' OTP type when building the
    // callback URL, since verifyOtp() only recognizes that literal value —
    // passing the raw sub-type through would make the confirmation link
    // unverifiable.
    case 'email_change':
    case 'email_change_current':
    case 'email_change_new': {
      templateKey = 'auth.email_change_verify'
      const verificationUrl = buildAuthCallbackUrl(siteUrl, tokenHash, 'email_change', email_data.redirect_to)
      templateVariables = { userName, verificationUrl }
      break
    }

    case 'magiclink': {
      templateKey = 'auth.verify_email'
      const verificationUrl = buildAuthCallbackUrl(siteUrl, tokenHash, 'magiclink', email_data.redirect_to)
      templateVariables = { userName, verificationUrl }
      break
    }

    case 'invite': {
      templateKey = 'auth.welcome'
      const appUrl = buildAuthCallbackUrl(siteUrl, tokenHash, 'invite', email_data.redirect_to)
      templateVariables = { userName, appUrl }
      break
    }

    case 'reauthentication': {
      templateKey = 'auth.verify_email'
      const verificationUrl = buildAuthCallbackUrl(siteUrl, tokenHash, 'reauthentication', email_data.redirect_to)
      templateVariables = { userName, verificationUrl }
      break
    }

    default: {
      // `actionType` comes from the hook payload, so it is caller-influenced: it is
      // a field rather than part of the message, and the logger strips control
      // characters from it before emitting.
      log.warn('auth.hook.unknown_action_type', { actionType, fallbackTemplate: 'auth.verify_email' })
      templateKey = 'auth.verify_email'
      const verificationUrl = buildAuthCallbackUrl(siteUrl, tokenHash, actionType, email_data.redirect_to)
      templateVariables = { userName, verificationUrl }
      break
    }
  }

  // 4. Render template server-side
  let rendered: { html: string; text: string; subject: string }
  try {
    rendered = await renderEmailTemplate(templateKey, templateVariables)
  } catch (err) {
    // The detail stays in the server log. The response goes back to Supabase Auth and
    // can surface to the learner's client, so it carries no template internals.
    log.exception('auth.hook.template_render_failed', err, { templateKey, actionType, recipient: maskEmail(toEmail) })
    return jsonResponse({ error: 'Email could not be prepared' }, 500)
  }

  // 5. Send through the governed gateway.
  //
  // This hook used to call `sendEmail()` directly, which is how untrusted signup
  // traffic reached a paid provider with no quota, kill switch, deduplication or rate
  // limit in the way. Supabase Auth invokes it for every `auth.signUp()` and
  // `auth.resend()`, none of which require a `public.users` row to exist — so the
  // application's own email governance never saw the sends that spent the credits.
  const purpose = purposeForAction(actionType)
  const masked = maskEmail(toEmail)

  const sendResult = await sendGovernedEmail({
    purpose,
    to: toEmail,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    // Identity of the message, not of the request: the same user + action + token is
    // the same email, so a redelivered hook call is deduplicated while a genuinely
    // new verification request (new token) is not. The token is hashed rather than
    // stored — the ledger row is long-lived and must not carry a live credential.
    idempotencyKey: `auth:${user.id}:${actionType}:${fingerprintToken(tokenHash)}`,
    // Deliberately no `ipBucket`. The caller of this hook is Supabase Auth, not the
    // learner, so the request IP is Supabase's: every auth email on the platform would
    // share one bucket and anyone could exhaust it to block all verification and
    // password-reset mail. The per-recipient limit (keyed on the address) and the
    // auth-only aggregate bucket still apply; per-client limits live on the routes
    // that trigger these emails (signup, resend-verification, password reset).
  })

  if (sendResult.blocked) {
    // A governance refusal is not a provider failure. Report it as a retryable
    // condition to Supabase Auth so GoTrue does not treat it as a hard error, and so
    // the learner's client can back off rather than hammering the endpoint.
    log.warn('auth.hook.send_blocked', {
      actionType,
      reason: sendResult.blocked,
      // Already masked by `maskEmail`; the logger masks addresses again anyway.
      recipient: masked,
    })
    const blockedStatus = sendResult.blocked === 'duplicate' ? 200 : 429
    if (blockedStatus === 200) {
      // The identical message is already in flight or delivered. Reporting success is
      // correct here: retrying would only produce another duplicate.
      return jsonResponse({ success: true, message: 'Email already dispatched for this request', deduplicated: true }, 200)
    }
    // The block reason is logged above; the response stays generic so it does not tell
    // a caller which control (recipient, aggregate, quota) it ran into.
    return jsonResponse({ error: 'Email temporarily unavailable' }, blockedStatus)
  }

  if (!sendResult.sent) {
    // `sendResult.error` is provider text. It reached the platform log verbatim
    // before B9-C, which is the F-SEC-14 leak on the highest-value path in the app.
    log.error('auth.hook.delivery_failed', {
      actionType,
      recipient: masked,
      reason: sendResult.error,
    })

    // Signup verification and password reset ride this path. Without a persisted
    // incident an operator cannot tell that auth mail has stopped.
    try {
      const { logErrorReport } = await import('@/lib/monitoring/logger')
      const { classifyProviderFailureKind } = await import('@/lib/monitoring/error-taxonomy')
      void logErrorReport({
        domain: 'auth',
        kind: classifyProviderFailureKind(sendResult.statusCode),
        operation: 'auth.email_delivery',
        summary: 'Authentication email could not be delivered',
        subject: { templateKey, maskedEmail: masked, userId: user.id },
        provider: sendResult.provider && sendResult.provider !== 'simulated'
          ? { name: sendResult.provider, statusCode: sendResult.statusCode }
          : undefined,
        nextAction:
          'Learners cannot verify their email or reset their password until this clears. Check provider credit and credentials, then retry.',
        details: { emailActionType: actionType, providerMessage: sendResult.error },
      })
    } catch {
      // Never let instrumentation break the hook response.
    }

    let status = 500
    if (sendResult.statusCode === 429) {
      status = 429
    } else if (sendResult.statusCode === 401 || sendResult.statusCode === 403) {
      status = 502
    } else if (sendResult.statusCode === 504) {
      status = 504
    } else if (sendResult.statusCode && sendResult.statusCode >= 500) {
      status = 503
    }

    return jsonResponse({ error: 'Email delivery failed' }, status)
  }

  // 6. Return HTTP 200 to Supabase Auth Hook
  return jsonResponse({ success: true, message: 'Email sent successfully', id: sendResult.id }, 200)
}
