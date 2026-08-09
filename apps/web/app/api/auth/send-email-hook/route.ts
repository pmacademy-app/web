import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { BRAND } from '@/lib/brand'
import { renderEmailTemplate } from '@/emails'
import { sendEmail } from '@/lib/email'

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

function verifyHookSecret(request: NextRequest, rawBody: string, secret: string): boolean {
  // 1. Authorization header check (Bearer token)
  const authHeader = request.headers.get('authorization')
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (token === secret) return true
  }

  // 2. Custom header checks
  const headerSecret =
    request.headers.get('x-supabase-auth-secret') ||
    request.headers.get('x-hook-secret') ||
    request.headers.get('x-secret')
  if (headerSecret && headerSecret.trim() === secret) return true

  // 3. Query string check
  const searchParams = request.nextUrl.searchParams
  const querySecret = searchParams.get('secret')
  if (querySecret && querySecret.trim() === secret) return true

  // 4. HMAC-SHA256 signature check (x-supabase-signature / x-signature)
  const signatureHeader =
    request.headers.get('x-supabase-signature') ||
    request.headers.get('x-signature') ||
    request.headers.get('x-webhook-signature')

  if (signatureHeader) {
    let sigToMatch = signatureHeader
    let payloadToSign = rawBody

    if (signatureHeader.includes('v1=')) {
      const parts = signatureHeader.split(',')
      const tPart = parts.find((p) => p.trim().startsWith('t='))
      const v1Part = parts.find((p) => p.trim().startsWith('v1='))
      if (v1Part) {
        sigToMatch = v1Part.replace('v1=', '').trim()
      }
      if (tPart) {
        const timestamp = tPart.replace('t=', '').trim()
        payloadToSign = `${timestamp}.${rawBody}`
      }
    }

    try {
      const computedSig = crypto
        .createHmac('sha256', secret)
        .update(payloadToSign)
        .digest('hex')

      if (
        computedSig.length === sigToMatch.length &&
        crypto.timingSafeEqual(Buffer.from(computedSig), Buffer.from(sigToMatch))
      ) {
        return true
      }
    } catch {
      return false
    }
  }

  return false
}

// ─── Callback URL Generator ───────────────────────────────────────────────────

export function buildAuthCallbackUrl(
  siteUrl: string,
  tokenHash: string,
  type: string,
  redirectTo?: string
): string {
  let nextPath = '/dashboard'

  if (redirectTo) {
    try {
      const parsed = new URL(redirectTo, siteUrl)
      // If redirect_to is already a full callback URL with token_hash, normalize host to siteUrl
      if (parsed.searchParams.has('token_hash')) {
        const canonical = new URL(parsed.pathname + parsed.search, siteUrl)
        return canonical.toString()
      }
      nextPath = parsed.searchParams.get('next') || parsed.pathname + parsed.search
    } catch {
      nextPath = redirectTo
    }
  } else {
    if (type === 'signup') nextPath = '/verified'
    if (type === 'recovery') nextPath = '/reset-password?mode=update'
    if (type === 'email_change') nextPath = '/settings'
    if (type === 'invite') nextPath = '/onboarding'
  }

  const callbackUrl = new URL('/api/auth/callback', siteUrl)
  if (tokenHash) {
    callbackUrl.searchParams.set('token_hash', tokenHash)
  }
  callbackUrl.searchParams.set('type', type)
  if (nextPath && nextPath !== '/dashboard') {
    callbackUrl.searchParams.set('next', nextPath)
  }
  return callbackUrl.toString()
}

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

  console.log(`[send-email-hook] Auth email ("${actionType}") successfully sent to ${toEmail} (resendId: ${sendResult.id})`)

  // 6. Return HTTP 200 to Supabase Auth Hook
  return jsonResponse({ success: true, message: 'Email sent successfully', id: sendResult.id }, 200)
}
