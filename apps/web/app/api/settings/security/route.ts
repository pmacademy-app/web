import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
import { logSystemError } from '@/lib/monitoring/logger'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      return NextResponse.json(
        { success: false, error: 'Unsupported Content-Type. Expected application/json' },
        { status: 415 }
      )
    }

    const user = await getAuthenticatedUserFromRequest(request)

    if (!user || !user.id || !user.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Authenticated session required.' },
        { status: 401 }
      )
    }

    let body: {
      currentPassword?: string
      newPassword?: string
      confirmPassword?: string
      password?: string
    }

    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON payload' },
        { status: 400 }
      )
    }

    const currentPassword = body.currentPassword
    const newPassword = body.newPassword || body.password
    const confirmPassword = body.confirmPassword

    if (!newPassword || typeof newPassword !== 'string') {
      return NextResponse.json(
        { success: false, error: 'New password is required.' },
        { status: 400 }
      )
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 6 characters long.' },
        { status: 400 }
      )
    }

    if (confirmPassword !== undefined && confirmPassword !== newPassword) {
      return NextResponse.json(
        { success: false, error: 'New passwords do not match.' },
        { status: 400 }
      )
    }

    if (currentPassword && currentPassword === newPassword) {
      return NextResponse.json(
        { success: false, error: 'New password must be different from current password.' },
        { status: 400 }
      )
    }

    const supabase = createServiceRoleClient()

    // 1. If current password is provided, verify it first against Supabase Auth
    let newSessionAfterAuth: { access_token: string; refresh_token: string; expires_in: number } | null = null
    if (currentPassword) {
      const { data: signInData, error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      })

      if (verifyError) {
        return NextResponse.json(
          { success: false, error: 'Current password is incorrect.' },
          { status: 400 }
        )
      }

      if (signInData.session) {
        newSessionAfterAuth = signInData.session
      }
    }

    // 2. Update user's password securely through Supabase Auth Admin API
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      password: newPassword,
    })

    if (updateError) {
      void logSystemError({
        severity: 'warning',
        category: 'auth',
        operation: 'settings_password_change_failure',
        message: updateError.message,
      })

      return NextResponse.json(
        { success: false, error: updateError.message || 'Failed to update password.' },
        { status: 400 }
      )
    }

    const response = NextResponse.json({
      success: true,
      message: 'Password updated successfully.',
    })

    // If verification generated a fresh session, refresh auth cookies
    if (newSessionAfterAuth) {
      const isProd = process.env.NODE_ENV === 'production'
      response.cookies.set('sb-access-token', newSessionAfterAuth.access_token, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        path: '/',
        maxAge: newSessionAfterAuth.expires_in,
      })
      response.cookies.set('sb-refresh-token', newSessionAfterAuth.refresh_token, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      })
    }

    return response
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred.'
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }
}
