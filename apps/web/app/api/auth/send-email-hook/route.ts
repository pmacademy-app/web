import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { BRAND } from '@/lib/brand'
import { renderEmailTemplate } from '@/emails'
import { sendEmail } from '@/lib/email'
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

  // 1. Authorization header check (Bearer token)
  const authHeader = request.headers.get('authorization')
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (token === secret || token === cleanSecret || token === unprefixedSecret) return true
  }

  // 2. Custom header checks
  const headerSecret =
    request.headers.get('x-supabase-auth-secret') ||
    request.headers.get('x-hook-secret') ||
    request.headers.get('x-secret')
  if (headerSecret) {
    const val = headerSecret.trim()
    if (val === secret || val === cleanSecret || val === unprefixedSecret) return true
  }

  // 3. Query string check
  const searchParams = request.nextUrl.searchParams
  const querySecret = searchParams.get('secret')
  if (querySecret) {
    const val = querySecret.trim()
    if (val === secret || val === cleanSecret || val === unprefixedSecret) return true
  }

  // 4. Standard Webhook / Svix / Supabase signature check
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

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const secret = process.env.SEND_EMAIL_HOOK_SECRET

  // 1. Verify hook secret if configured in environment
  if (secret) {
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
  } else {
    console.warn('[send-email-hook] Warning: SEND_EMAIL_HOOK_SECRET is not configured in environment. Proceeding without signature check.')
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

    case 'email_change': {
      templateKey = 'auth.verify_email'
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

  // 5. Send email via Resend integration
  const sendResult = await sendEmail({
    to: toEmail,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  })

  if (!sendResult.success) {
    console.error('[send-email-hook] Email send failed via Resend:', sendResult.error)
    return jsonResponse({ error: `Email delivery failure: ${sendResult.error}` }, 500)
  }

  // 6. Enqueue Welcome Email for new account registration (high priority, idempotent)
  if (actionType === 'signup') {
    try {
      const { enqueueNotificationItem } = await import('@/lib/notifications/queue/processor')
      enqueueNotificationItem({
        userId: user.id,
        toEmail,
        toName: userName,
        channel: 'email',
        templateKey: 'auth.welcome',
        templateVariables: { userName },
        eventId: `welcome-${user.id}`,
        eventType: 'user.registered',
        category: 'security',
        priorityLevel: 'high',
      }).catch((err) => {
        console.warn('[send-email-hook] Non-fatal welcome email enqueue warning:', err)
      })
    } catch (err) {
      console.warn('[send-email-hook] Non-fatal welcome email enqueue error:', err)
    }
  }

  // 7. Return HTTP 200 to Supabase Auth Hook
  return jsonResponse({ success: true, message: 'Email sent successfully', id: sendResult.id }, 200)
}
