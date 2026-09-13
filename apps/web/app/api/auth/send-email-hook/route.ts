import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { BRAND } from '@/lib/brand'
import { renderEmailTemplate } from '@/emails'
import { maskEmail } from '@/lib/email'
import { sendGovernedEmail, type GovernedEmailPurpose } from '@/lib/email-governance'
import { getClientIpBucket } from '@/lib/security/client-ip'
import { secretMatchesAny } from '@/lib/security/constant-time'
import { buildAuthCallbackUrl } from '@/lib/auth-url'

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

function verifyHookSecret(request: NextRequest, rawBody: string, secret: string): boolean {
  const cleanSecret = secret.trim()
  let unprefixedSecret = cleanSecret
  if (unprefixedSecret.startsWith('v1,')) {
    unprefixedSecret = unprefixedSecret.substring(3).trim()
  }
  if (unprefixedSecret.startsWith('whsec_')) {
    unprefixedSecret = unprefixedSecret.substring(6).trim()
  }

  // The same shared secret is accepted in three spellings, because the value in
  // SEND_EMAIL_HOOK_SECRET may or may not carry the `v1,` and `whsec_` prefixes
  // depending on how it was copied out of the dashboard.
  const acceptedSecrets = [secret, cleanSecret, unprefixedSecret]

  // 1. Authorization header check (Bearer token).
  //    B7-D / F-SEC-12: compared in constant time. The previous `===` chain
  //    returned as soon as a byte differed, which is a timing oracle on a
  //    long-lived shared secret.
  const authHeader = request.headers.get('authorization')
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (secretMatchesAny(token, acceptedSecrets)) return true
  }

  // 2. Custom header checks — likewise constant-time.
  const headerSecret =
    request.headers.get('x-supabase-auth-secret') ||
    request.headers.get('x-hook-secret') ||
    request.headers.get('x-secret')
  if (headerSecret) {
    const val = headerSecret.trim()
    if (secretMatchesAny(val, acceptedSecrets)) return true
  }

  // 3. Standard Webhook / Svix / Supabase signature check — the mechanism
  //    production actually uses (verified 2026-09-14: the configured secret is in
  //    `v1,whsec_...` form). HMAC over the raw body, compared with timingSafeEqual.
  const signatureHeader =
    request.headers.get('webhook-signature') ||
    request.headers.get('svix-signature') ||
    request.headers.get('x-supabase-signature') ||
    request.headers.get('x-signature') ||
    request.headers.get('x-webhook-signature')

  if (signatureHeader) {
    const msgId =
      request.headers.get('webhook-id') ||
      request.headers.get('svix-id') ||
      request.headers.get('x-supabase-id') ||
      ''

    const msgTimestamp =
      request.headers.get('webhook-timestamp') ||
      request.headers.get('svix-timestamp') ||
      ''

    const sigParts = signatureHeader.split(/[\s,]+/)
    let v1Sig = ''
    let tSig = msgTimestamp

    if (signatureHeader.startsWith('v1,')) {
      v1Sig = signatureHeader.substring(3).trim()
    } else {
      for (const part of sigParts) {
        const p = part.trim()
        if (p.startsWith('v1=')) {
          v1Sig = p.substring(3).trim()
        } else if (p.startsWith('t=') && !tSig) {
          tSig = p.substring(2).trim()
        } else if (!v1Sig && p && !p.startsWith('t=')) {
          v1Sig = p
        }
      }
    }

    if (v1Sig) {
      const secretBytes = getSecretBytes(secret)

      const payloadCandidates: string[] = []
      if (msgId && tSig) {
        payloadCandidates.push(`${msgId}.${tSig}.${rawBody}`)
      }
      if (tSig) {
        payloadCandidates.push(`${tSig}.${rawBody}`)
      }
      payloadCandidates.push(rawBody)

      for (const candidate of payloadCandidates) {
        const hmacBase64 = crypto.createHmac('sha256', secretBytes).update(candidate).digest('base64')
        const hmacBase64Url = Buffer.from(hmacBase64, 'base64').toString('base64url')
        const hmacHex = crypto.createHmac('sha256', secretBytes).update(candidate).digest('hex')

        for (const expected of [hmacBase64, hmacBase64Url, hmacHex]) {
          try {
            if (
              expected.length === v1Sig.length &&
              crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1Sig))
            ) {
              return true
            }
          } catch {
            // Ignore length mismatches
          }
        }
      }
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

  // 1. Verify hook secret if configured in environment (fail closed in production)
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[send-email-hook] Unauthorized request: SEND_EMAIL_HOOK_SECRET is not configured in production.')
      try {
        const { logSystemError } = await import('@/lib/monitoring/logger')
        void logSystemError({
          severity: 'error',
          category: 'auth',
          operation: 'send_email_hook_auth',
          message: 'Unauthorized request: SEND_EMAIL_HOOK_SECRET environment variable missing in production',
        })
      } catch {}
      return jsonResponse({ error: 'Unauthorized: Missing hook secret configuration' }, 401)
    }
    console.warn('[send-email-hook] Warning: SEND_EMAIL_HOOK_SECRET is not configured in environment. Proceeding in non-production mode.')
  } else {
    const isValid = verifyHookSecret(request, rawBody, secret)
    if (!isValid) {
      console.warn('[send-email-hook] Unauthorized request: signature/secret verification failed.')
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
    console.error('[send-email-hook] Invalid JSON payload:', err)
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
      console.warn(`[send-email-hook] Unknown email_action_type: "${actionType}". Falling back to auth.verify_email.`)
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
    console.error(`[send-email-hook] Failed to render template "${templateKey}":`, err)
    return jsonResponse({ error: `Template render failure: ${err instanceof Error ? err.message : 'Unknown'}` }, 500)
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
    ipBucket: getClientIpBucket(request),
  })

  if (sendResult.blocked) {
    // A governance refusal is not a provider failure. Report it as a retryable
    // condition to Supabase Auth so GoTrue does not treat it as a hard error, and so
    // the learner's client can back off rather than hammering the endpoint.
    console.warn(`[send-email-hook] Governed send blocked action="${actionType}" reason="${sendResult.blocked}" recipient="${masked}"`)
    const blockedStatus = sendResult.blocked === 'duplicate' ? 200 : 429
    if (blockedStatus === 200) {
      // The identical message is already in flight or delivered. Reporting success is
      // correct here: retrying would only produce another duplicate.
      return jsonResponse({ success: true, message: 'Email already dispatched for this request', deduplicated: true }, 200)
    }
    return jsonResponse({ error: 'Email temporarily unavailable', reason: sendResult.blocked }, blockedStatus)
  }

  if (!sendResult.sent) {
    console.error(`[send-email-hook] Email delivery failed for action="${actionType}" recipient="${masked}":`, sendResult.error)

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
