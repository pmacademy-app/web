import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase'
import { requireUserId } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { setSessionCookies } from '@/lib/auth/session-cookies'
import { logSystemError } from '@/lib/monitoring/logger'

export const runtime = 'nodejs'

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'settings.security.change_password',
    domain: 'auth',
    summary: 'Unexpected failure changing a learner password',
  },
  async ({ request, actor }) => {
  try {
    const contentType = request.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      return NextResponse.json(
        { success: false, error: 'Unsupported Content-Type. Expected application/json' },
        { status: 415 }
      )
    }

    const userId = requireUserId(actor)
    // The provider must be re-authenticated with the caller's own address, so an
    // actor with no email cannot proceed. Kept as an explicit guard rather than
    // folded into the policy: `resolveActor` models identity, not this
    // route's precondition.
    const userEmail = actor.kind === 'learner' ? actor.email : null
    if (!userEmail) {
      throw new RouteError(401, 'UNAUTHORIZED', 'Authentication required.')
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

    if (!currentPassword || typeof currentPassword !== 'string' || !currentPassword.trim()) {
      return NextResponse.json(
        { success: false, error: 'Current password is required.' },
        { status: 400 }
      )
    }

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

    if (currentPassword === newPassword) {
      return NextResponse.json(
        { success: false, error: 'New password must be different from current password.' },
        { status: 400 }
      )
    }

    const supabase = createServiceRoleClient()

    // 1. Verify current password against Supabase Auth
    let newSessionAfterAuth: { access_token: string; refresh_token: string; expires_in: number } | null = null
    const { data: signInData, error: verifyError } = await supabase.auth.signInWithPassword({
      email: userEmail,
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

    // 2. Update user's password securely through Supabase Auth Admin API
    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
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
      setSessionCookies(response, newSessionAfterAuth)
    }

    return response
  } catch (error: unknown) {
    // Rethrown so the wrapper genericises it; this branch previously returned
    // error.message to an authenticated learner (N-3).
    throw error
  }
  }
)
