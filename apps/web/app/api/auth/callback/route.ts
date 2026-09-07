import { type EmailOtpType, createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase'
import { ensureUserProfile } from '@/lib/auth'

/** Attach the Supabase session as HTTP-only cookies on a redirect response. */
function redirectWithSession(
  destination: URL,
  session: { access_token: string; refresh_token: string; expires_in: number },
): NextResponse {
  const response = NextResponse.redirect(destination)
  const isProd = process.env.NODE_ENV === 'production'

  response.cookies.set('sb-access-token', session.access_token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: session.expires_in,
  })
  response.cookies.set('sb-refresh-token', session.refresh_token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })

  return response
}

/**
 * Supabase's Send Email Hook reports email-change events as the granular
 * `email_change_current` / `email_change_new` action types (one per address
 * being notified), but `verifyOtp()` only recognizes the single canonical
 * `email_change` OTP type. Normalizing here ensures a confirmation link is
 * never misrouted or rejected due to that sub-type mismatch.
 */
function normalizeOtpType(rawType: string | null): EmailOtpType | null {
  if (rawType === 'email_change_current' || rawType === 'email_change_new') {
    return 'email_change'
  }
  return rawType as EmailOtpType | null
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const token_hash = requestUrl.searchParams.get('token_hash')
  const type = normalizeOtpType(requestUrl.searchParams.get('type'))
  const next = requestUrl.searchParams.get('next') ?? '/dashboard'
  let destination = new URL(next, requestUrl.origin)
  if (destination.origin !== requestUrl.origin) {
    destination = new URL('/dashboard', requestUrl.origin)
  }

  // ── Path 1: PKCE code exchange (OAuth / magic link) ──────────────────────
  if (code) {
    try {
      const supabase = createServiceRoleClient()
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)

      if (!error && data.user && data.session) {
        await ensureUserProfile(supabase, data.user)
        return redirectWithSession(destination, data.session)
      }
    } catch (err) {
      console.error('[auth/callback] Unexpected error during code exchange:', err)
    }
  }

  // ── Path 2: Email OTP / token_hash (email confirmation, password reset) ──
  //
  // Supabase email verification links include ?token_hash=...&type=signup
  // (not a #hash fragment). The server reads the token_hash query param and
  // calls verifyOtp() to confirm the account and create a session.
  if (token_hash && type) {
    try {
      // Recovery OTP must use the anon client so Supabase creates a proper
      // user-scoped session. The service role client bypasses session creation
      // which breaks the password reset flow entirely.
      const supabase = type === 'recovery'
        ? createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { auth: { persistSession: false } }
          )
        : createServiceRoleClient()
      const { data, error } = await supabase.auth.verifyOtp({ token_hash, type })

      if (!error && data.user) {
        // Skip ensureUserProfile for recovery — the user already exists
        if (type !== 'recovery') {
          await ensureUserProfile(supabase, data.user)
        }

        // Supabase Auth's email_change confirmation updates `auth.users.email`
        // directly, but there is no trigger syncing that to `public.users.email`
        // (the app's own profile table). Keep them consistent here — this is
        // the one place every email-change confirmation flows through.
        if (type === 'email_change' && data.user.email) {
          try {
            await supabase
              .from('users')
              .update({ email: data.user.email })
              .eq('id', data.user.id)
          } catch (syncErr) {
            console.error('[auth/callback] Failed to sync public.users.email after email_change:', syncErr)
          }
        }

        if (type === 'signup' || type === 'email_change') {
          try {
            const { globalNotificationDispatcher } = await import('@/lib/notifications/dispatcher')
            const { initializeNotificationConnectors } = await import('@/lib/notifications/events/connectors')
            initializeNotificationConnectors()
            await globalNotificationDispatcher.dispatch({
              id: `user-verified-${data.user.id}`,
              event: 'user.verified',
              userId: data.user.id,
              userEmail: data.user.email || '',
              userName: data.user.user_metadata?.full_name || data.user.user_metadata?.name || 'Learner',
              userTimezone: 'UTC',
              priority: 'high',
              category: 'security',
              occurredAt: new Date().toISOString(),
              payload: {
                email: data.user.email,
              },
            })
          } catch (notifErr) {
            console.warn('[auth/callback] user.verified notification dispatch warning:', notifErr)
          }
        }

        // email_change confirmation always lands on the dedicated success page
        // (regardless of whether verifyOtp happened to mint a fresh session),
        // rather than continuing on to a generic post-login destination.
        if (type === 'email_change') {
          const successUrl = new URL('/email-verified', requestUrl.origin)
          return data.session ? redirectWithSession(successUrl, data.session) : NextResponse.redirect(successUrl)
        }

        if (data.session) {
          return redirectWithSession(destination, data.session)
        }

        return NextResponse.redirect(new URL('/login?verified=true', requestUrl.origin))
      }

      if (error) {
        console.error('[auth/callback] verifyOtp error:', error.message)
      }
    } catch (err) {
      console.error('[auth/callback] Unexpected error during OTP verification:', err)
    }
  }

  // ── Fallback: both paths failed — send to appropriate destination with error ──
  if (type === 'recovery' || next.includes('reset-password')) {
    return NextResponse.redirect(new URL('/reset-password?error=expired', requestUrl.origin))
  }

  // Expired/invalid/already-used email-change confirmation: land on the same
  // dedicated page in its error state rather than bouncing to /login.
  if (type === 'email_change') {
    return NextResponse.redirect(new URL('/email-verified?status=error', requestUrl.origin))
  }

  // Distinguish email verification failures from generic auth failures
  // so the login page can show a targeted message and link to the resend flow.
  if (type === 'signup' || type === 'email') {
    return NextResponse.redirect(new URL('/login?error=verification_failed', requestUrl.origin))
  }

  return NextResponse.redirect(new URL('/login?error=auth_failed', requestUrl.origin))
}
