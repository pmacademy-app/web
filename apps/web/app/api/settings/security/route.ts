import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase'
import { requireUserId } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { setSessionCookies } from '@/lib/auth/session-cookies'
import { logSystemError } from '@/lib/monitoring/logger'

export const runtime = 'nodejs'

/**
 * Maps a Supabase Auth Admin `updateUserById` password-change failure to safe,
 * authored copy. Returns `null` for anything not recognized so the caller can
 * rethrow it — an unmapped error is a genuine fault, not a user-facing one, and
 * must go through `withRoute`'s generic handling rather than reach the client
 * as raw provider text.
 */
function describePasswordUpdateError(error: { code?: string; message?: string }): string | null {
  switch (error.code) {
    case 'weak_password':
      return 'That password does not meet the minimum security requirements. Please choose a different one.'
    case 'same_password':
      return 'New password must be different from your current password.'
    case 'over_request_rate_limit':
      return 'Too many attempts. Please wait a while before trying again.'
    default:
      return null
  }
}

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'settings.security.change_password',
    domain: 'auth',
    summary: 'Unexpected failure changing a learner password',
    // High-severity audit finding: this route re-verifies the caller's current
    // password via `signInWithPassword`, which is an authenticated password-guessing
    // oracle without a limit. Fail-closed because it gates a privileged auth-provider
    // call — an outage must refuse rather than grant unlimited attempts. Values match
    // the per-user limit already used by /api/auth/update-password.
    rateLimit: [
      {
        key: ({ actor }) => (actor.kind === 'learner' ? `settings_change_password_${actor.userId}` : null),
        limit: 5,
        windowMs: 15 * 60 * 1000,
        failClosed: true,
      },
    ],
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

      const safeMessage = describePasswordUpdateError(updateError)
      if (safeMessage) {
        return NextResponse.json({ success: false, error: safeMessage }, { status: 400 })
      }
      // Unrecognized failure: rethrown so the wrapper genericizes it rather than
      // forwarding raw provider text (N-3 / audit finding D-4).
      throw updateError
    }

    // Invalidate every other active session/refresh token for this user now that
    // the password has changed — the point of changing a password is moot if a
    // session opened under the old one stays valid. Scoped to "others" so the
    // session this request is about to refresh (below) is deliberately spared:
    // the caller stays logged in here, matching the existing UX.
    if (newSessionAfterAuth) {
      try {
        const { error: signOutError } = await supabase.auth.admin.signOut(
          newSessionAfterAuth.access_token,
          'others'
        )
        if (signOutError) {
          void logSystemError({
            severity: 'warning',
            category: 'auth',
            operation: 'settings_password_change_session_revocation_failed',
            message: signOutError.message,
          })
        }
      } catch (revokeError) {
        // Never let session revocation block a password change that already
        // succeeded — logged for observability, not surfaced to the learner.
        void logSystemError({
          severity: 'warning',
          category: 'auth',
          operation: 'settings_password_change_session_revocation_failed',
          message: revokeError instanceof Error ? revokeError.message : String(revokeError),
        })
      }
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
