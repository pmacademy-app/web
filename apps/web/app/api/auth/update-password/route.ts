import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAuthenticatedServerClient } from '@/lib/supabase'
import { logSystemError } from '@/lib/monitoring/logger'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    // 1. Enforce application/json Content-Type to guard against standard form submission CSRF
    const contentType = request.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      return NextResponse.json(
        { success: false, error: 'Unsupported Content-Type. Expected application/json' },
        { status: 415 }
      )
    }

    // 2. Validate Origin / Referer to prevent Cross-Site Request Forgery
    const origin = request.headers.get('origin') || ''
    const referer = request.headers.get('referer') || ''
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://prodily.adityagangwani.me').replace(/\/$/, '')
    
    // Parse host from siteUrl for origin checking
    let expectedHost = ''
    try {
      expectedHost = new URL(siteUrl).host
    } catch {
      expectedHost = 'prodily.adityagangwani.me'
    }

    const reqHost = request.headers.get('host') || ''

    // Verify Origin or Referer host matches request host or configured site URL
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

    // 3. Read and validate newPassword from payload
    let body: { newPassword?: unknown }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON payload' }, { status: 400 })
    }

    const { newPassword } = body

    if (!newPassword || typeof newPassword !== 'string') {
      return NextResponse.json({ success: false, error: 'Password is required.' }, { status: 400 })
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ success: false, error: 'Password must be at least 6 characters.' }, { status: 400 })
    }

    // 4. Extract recovery session token from HTTP-only cookies safely
    let accessToken = request.cookies.get('sb-access-token')?.value
    if (!accessToken) {
      try {
        const cookieStore = await cookies()
        accessToken = cookieStore.get('sb-access-token')?.value
      } catch {
        const cookieHeader = request.headers.get('cookie') || ''
        const match = cookieHeader.match(/sb-access-token=([^;]+)/)
        if (match && match[1]) {
          accessToken = decodeURIComponent(match[1])
        }
      }
    }

    if (!accessToken) {
      return NextResponse.json(
        {
          success: false,
          error: 'No active recovery session found. Please request a new password reset link.',
        },
        { status: 401 }
      )
    }

    // 5. Authenticate server client using the recovery token and update user password
    const supabase = createAuthenticatedServerClient(accessToken)
    const { error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) {
      void logSystemError({
        severity: 'warning',
        category: 'auth',
        operation: 'update_password_failure',
        message: error.message,
      })

      return NextResponse.json(
        {
          success: false,
          error: error.message || 'Failed to update password. Your reset link may have expired.',
        },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Password updated successfully.',
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown server error'
    void logSystemError({
      severity: 'error',
      category: 'auth',
      operation: 'update_password_exception',
      message: errorMsg,
    })

    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred while updating your password.' },
      { status: 500 }
    )
  }
}
