import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { createAuthenticatedServerClient } from '@/lib/supabase'
import { logSystemError } from '@/lib/monitoring/logger'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      return NextResponse.json(
        { success: false, error: 'Unsupported Content-Type. Expected application/json' },
        { status: 415 }
      )
    }

    const origin = request.headers.get('origin') || ''
    const referer = request.headers.get('referer') || ''
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://prodily.adityagangwani.me').replace(/\/$/, '')
    
    let expectedHost = ''
    try {
      expectedHost = new URL(siteUrl).host
    } catch {
      expectedHost = 'prodily.adityagangwani.me'
    }

    const reqHost = request.headers.get('host') || ''

    if (origin) {
      try {
        const originHost = new URL(origin).host
        if (originHost !== reqHost && originHost !== expectedHost) {
          return NextResponse.json({ success: false, error: 'Forbidden: Untrusted Origin' }, { status: 403 })
        }
      } catch {
        return NextResponse.json({ success: false, error: 'Forbidden: Malformed Origin' }, { status: 403 })
      }
    } else if (referer) {
      try {
        const refererHost = new URL(referer).host
        if (refererHost !== reqHost && refererHost !== expectedHost) {
          return NextResponse.json({ success: false, error: 'Forbidden: Untrusted Referer' }, { status: 403 })
        }
      } catch {
        return NextResponse.json({ success: false, error: 'Forbidden: Malformed Referer' }, { status: 403 })
      }
    }

    let body: { newPassword?: unknown }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON payload' }, { status: 400 })
    }

    const { newPassword } = body
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return NextResponse.json({ success: false, error: 'Password must be at least 6 characters.' }, { status: 400 })
    }

    const cookieStore = await cookies()
    const accessToken = request.cookies.get('sb-access-token')?.value || cookieStore.get('sb-access-token')?.value
    const refreshToken = request.cookies.get('sb-refresh-token')?.value || cookieStore.get('sb-refresh-token')?.value

    // If neither token is present, recovery session is completely absent
    if (!accessToken && !refreshToken) {
      return NextResponse.json(
        { success: false, error: 'No active recovery session found. Please request a new password reset link.' },
        { status: 401 }
      )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    // 5. Attempt password update with the current access token.
    //    createAuthenticatedServerClient uses anon key + Bearer header — the correct pattern
    //    for user-scoped operations that respect the user's identity.
    if (accessToken) {
      const userClient = createAuthenticatedServerClient(accessToken)
      const { error } = await userClient.auth.updateUser({ password: newPassword })

      if (!error) {
        const response = NextResponse.json({ success: true, message: 'Password updated successfully.' })
        response.cookies.delete('sb-access-token')
        response.cookies.delete('sb-refresh-token')
        return response
      }

      // Detect access-token expiry — the confirmed root cause of "Auth session missing!" in production
      const isExpiredOrMissing =
        (error as { status?: unknown }).status === 401 ||
        (error as { status?: unknown }).status === '401' ||
        (error as { code?: unknown }).code === 'session_not_found' ||
        (error as { code?: unknown }).code === 'token_expired' ||
        (error as { code?: unknown }).code === 'bad_jwt' ||
        error.message?.toLowerCase().includes('auth session missing') ||
        error.message?.toLowerCase().includes('invalid jwt') ||
        error.message?.toLowerCase().includes('jwt expired') ||
        error.message?.toLowerCase().includes('token is expired') ||
        error.message?.toLowerCase().includes('session expired') ||
        error.message?.toLowerCase().includes('session not found')

      if (!isExpiredOrMissing || !refreshToken) {
        void logSystemError({ severity: 'warning', category: 'auth', operation: 'update_password_failure', message: error.message })
        return NextResponse.json(
          { success: false, error: error.message || 'Failed to update password. Your reset link may have expired.' },
          { status: 400 }
        )
      }
      // Access token expired but refresh token is present — fall through to refresh
    }

    // 6. Refresh-token fallback: silently exchanges the long-lived refresh token for a new
    //    access token. This resolves the "Auth session missing!" production error: the recovery
    //    access token (~1 h TTL) can expire between the callback redirect and form submission.
    if (!refreshToken) {
      return NextResponse.json(
        { success: false, error: 'No active recovery session found. Please request a new password reset link.' },
        { status: 401 }
      )
    }

    const refreshClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } })
    const { data: refreshData, error: refreshError } = await refreshClient.auth.refreshSession({
      refresh_token: refreshToken,
    })

    if (refreshError || !refreshData?.session) {
      void logSystemError({
        severity: 'warning',
        category: 'auth',
        operation: 'update_password_refresh_failed',
        message: refreshError?.message || 'Refresh token exchange failed — recovery session fully expired',
      })
      return NextResponse.json(
        { success: false, error: 'Your password reset link has expired. Please request a new one.' },
        { status: 401 }
      )
    }

    // 7. Retry with the freshly obtained access token
    const retryClient = createAuthenticatedServerClient(refreshData.session.access_token)
    const { error: retryError } = await retryClient.auth.updateUser({ password: newPassword })

    if (retryError) {
      void logSystemError({ severity: 'warning', category: 'auth', operation: 'update_password_failure', message: retryError.message })
      return NextResponse.json(
        { success: false, error: retryError.message || 'Failed to update password. Your reset link may have expired.' },
        { status: 400 }
      )
    }

    const response = NextResponse.json({ success: true, message: 'Password updated successfully.' })
    response.cookies.delete('sb-access-token')
    response.cookies.delete('sb-refresh-token')
    response.cookies.set('sb-access-token', '', { path: '/', maxAge: 0 })
    response.cookies.set('sb-refresh-token', '', { path: '/', maxAge: 0 })
    return response
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown server error'
    void logSystemError({ severity: 'error', category: 'auth', operation: 'update_password_exception', message: errorMsg })
    return NextResponse.json({ success: false, error: 'An unexpected error occurred.' }, { status: 500 })
  }
}
