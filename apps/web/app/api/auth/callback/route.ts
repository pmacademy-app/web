import { type EmailOtpType } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
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

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const token_hash = requestUrl.searchParams.get('token_hash')
  const type = requestUrl.searchParams.get('type') as EmailOtpType | null
  const next = requestUrl.searchParams.get('next') ?? '/dashboard'
  const destination = new URL(next, requestUrl.origin)

  // ── Path 1: PKCE code exchange (OAuth / magic link) ──────────────────────
  if (code) {
    try {
      const supabase = createServerSupabaseClient()
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
      const supabase = createServerSupabaseClient()
      const { data, error } = await supabase.auth.verifyOtp({ token_hash, type })

      if (!error && data.user && data.session) {
        await ensureUserProfile(supabase, data.user)
        return redirectWithSession(destination, data.session)
      }

      if (error) {
        console.error('[auth/callback] verifyOtp error:', error.message)
      }
    } catch (err) {
      console.error('[auth/callback] Unexpected error during OTP verification:', err)
    }
  }

  // ── Fallback: both paths failed — send to login with error ────────────────
  return NextResponse.redirect(new URL('/login?error=auth_failed', requestUrl.origin))
}
