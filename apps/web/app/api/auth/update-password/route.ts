import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { createAuthenticatedServerClient } from '@/lib/supabase'
import { logSystemError } from '@/lib/monitoring/logger'
import { isNetworkFailure } from '@/lib/auth/errors'

export const runtime = 'nodejs'

/** Helper to delete recovery cookies cleanly across all response paths */
function clearRecoveryCookies(response: NextResponse): void {
  response.cookies.delete('sb-access-token')
  response.cookies.delete('sb-refresh-token')
  response.cookies.set('sb-access-token', '', { path: '/', maxAge: 0 })
  response.cookies.set('sb-refresh-token', '', { path: '/', maxAge: 0 })
}

/** Determines if an auth error is a confirmed, expected client token/session lifecycle state */
function isExpectedTokenInvalidation(error: unknown): boolean {
  if (!error) return false
  if (typeof error === 'object' && error !== null) {
    const err = error as { status?: unknown; code?: unknown; message?: string }
    const status = Number(err.status)
    const code = String(err.code || '').toLowerCase()
    const msg = String(err.message || '').toLowerCase()

    if (isNetworkFailure(msg) || isNetworkFailure(error)) {
      return false
    }

    if (
      code === 'session_not_found' ||
      code === 'token_expired' ||
      code === 'bad_jwt' ||
      code === 'invalid_grant' ||
      code === 'refresh_token_not_found' ||
      code === 'refresh_token_already_used' ||
      code === 'session_expired' ||
      code === 'user_not_found'
    ) {
      return true
    }

    if (
      msg.includes('refresh token is not valid') ||
      msg.includes('invalid refresh token') ||
      msg.includes('token is expired') ||
      msg.includes('jwt expired') ||
      msg.includes('invalid jwt') ||
      msg.includes('session not found') ||
      msg.includes('session expired') ||
      msg.includes('auth session missing') ||
      msg.includes('invalid_grant') ||
      msg.includes('refresh token not found') ||
      msg.includes('already used')
    ) {
      return true
    }

    if (status === 401 || (status === 400 && (msg.includes('grant') || msg.includes('token') || msg.includes('session')))) {
      return true
    }
  }
  return false
}

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
      const response = NextResponse.json(
        { success: false, error: 'No active recovery session found. Please request a new password reset link.' },
        { status: 401 }
      )
      clearRecoveryCookies(response)
      return response
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    // 5. Attempt password update with the current access token.
    if (accessToken) {
      const userClient = createAuthenticatedServerClient(accessToken)
      const { error } = await userClient.auth.updateUser({ password: newPassword })

      if (!error) {
        const response = NextResponse.json({ success: true, message: 'Password updated successfully.' })
        clearRecoveryCookies(response)
        return response
      }

      const isExpiredOrInvalid = isExpectedTokenInvalidation(error)

      if (!isExpiredOrInvalid || !refreshToken) {
        if (!isExpiredOrInvalid) {
          // Genuine unexpected update failure
          void logSystemError({ severity: 'warning', category: 'auth', operation: 'update_password_failure', message: error.message })
        }
        const response = NextResponse.json(
          { success: false, error: error.message || 'Failed to update password. Your reset link may have expired.' },
          { status: isExpiredOrInvalid ? 401 : 400 }
        )
        if (isExpiredOrInvalid) {
          clearRecoveryCookies(response)
        }
        return response
      }
      // Access token expired/invalid but refresh token is present — fall through to refresh fallback
    }

    // 6. Refresh-token fallback: exchange recovery refresh token for a fresh access token
    if (!refreshToken) {
      const response = NextResponse.json(
        { success: false, error: 'No active recovery session found. Please request a new password reset link.' },
        { status: 401 }
      )
      clearRecoveryCookies(response)
      return response
    }

    const refreshClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } })
    const { data: refreshData, error: refreshError } = await refreshClient.auth.refreshSession({
      refresh_token: refreshToken,
    })

    if (refreshError || !refreshData?.session) {
      const isExpected = isExpectedTokenInvalidation(refreshError)

      if (!isExpected) {
        // Log unexpected server/network failures during refresh so they remain observable
        void logSystemError({
          severity: 'error',
          category: 'auth',
          operation: 'update_password_refresh_failed',
          message: refreshError?.message || 'Refresh token exchange failed unexpectedly',
        })
      }

      const response = NextResponse.json(
        { success: false, error: 'Your password reset link has expired. Please request a new one.' },
        { status: 401 }
      )
      clearRecoveryCookies(response)
      return response
    }

    // 7. Retry with the freshly obtained access token
    const retryClient = createAuthenticatedServerClient(refreshData.session.access_token)
    const { error: retryError } = await retryClient.auth.updateUser({ password: newPassword })

    if (retryError) {
      const isExpected = isExpectedTokenInvalidation(retryError)
      if (!isExpected) {
        void logSystemError({ severity: 'warning', category: 'auth', operation: 'update_password_failure', message: retryError.message })
      }
      const response = NextResponse.json(
        { success: false, error: retryError.message || 'Failed to update password. Your reset link may have expired.' },
        { status: isExpected ? 401 : 400 }
      )
      if (isExpected) {
        clearRecoveryCookies(response)
      }
      return response
    }

    const response = NextResponse.json({ success: true, message: 'Password updated successfully.' })
    clearRecoveryCookies(response)
    return response
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown server error'
    void logSystemError({ severity: 'error', category: 'auth', operation: 'update_password_exception', message: errorMsg })
    return NextResponse.json({ success: false, error: 'An unexpected error occurred.' }, { status: 500 })
  }
}
