import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { SettingsService } from '@/lib/admin/settings-service'
import { createServiceRoleClient } from '@/lib/supabase'
import { ensureUserProfile } from '@/lib/auth'

export const runtime = 'nodejs'

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required.').email('Please enter a valid email address.').trim().toLowerCase(),
  password: z.string().min(1, 'Password is required.'),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const parsed = loginSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid email or password.', code: 'VALIDATION' },
        { status: 400 }
      )
    }

    const { email, password } = parsed.data
    const isRequired = await SettingsService.isEmailVerificationRequired()
    const supabase = createServiceRoleClient()

    // 1. Attempt password authentication with Supabase GoTrue
    let { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    // 2. Handle unconfirmed email scenario
    const isUnconfirmedError = Boolean(
      authError && (
        authError.message.toLowerCase().includes('email not confirmed') ||
        authError.message.toLowerCase().includes('email_not_confirmed') ||
        authError.code === 'email_not_confirmed'
      )
    )

    if (isUnconfirmedError) {
      if (!isRequired) {
        // GoTrue verified the password against bcrypt hash, but rejected because email_confirmed_at is null.
        // Since verification requirement is OFF, safely auto-confirm this authenticated user:
        const { data: usersList } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
        const matchedUser = (usersList?.users || []).find((u) => u.email?.toLowerCase() === email)

        if (matchedUser) {
          await supabase.auth.admin.updateUserById(matchedUser.id, { email_confirm: true })

          // Re-attempt sign-in with verified credentials
          const retryResult = await supabase.auth.signInWithPassword({ email, password })
          authData = retryResult.data
          authError = retryResult.error
        }
      } else {
        // Verification requirement is ON -> user must verify their email
        return NextResponse.json(
          {
            success: false,
            error: 'Please verify your email address before logging in. Check your inbox for the confirmation link.',
            code: 'AUTH_EMAIL_NOT_CONFIRMED',
            requiresVerification: true,
            email,
          },
          { status: 403 }
        )
      }
    }

    if (authError || !authData?.session || !authData?.user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid email or password. Please check your credentials and try again.',
          code: 'AUTH_INVALID_CREDENTIALS',
        },
        { status: 401 }
      )
    }

    // 3. Strict verification check when requirement is ON
    if (isRequired && !authData.user.email_confirmed_at) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please verify your email address before logging in.',
          code: 'AUTH_EMAIL_NOT_CONFIRMED',
          requiresVerification: true,
          email,
        },
        { status: 403 }
      )
    }

    // 4. Ensure public.users profile exists
    await ensureUserProfile(supabase, authData.user)

    // 5. Attach secure HTTP-only cookies
    const response = NextResponse.json({
      success: true,
      user: authData.user,
      session: authData.session,
      redirect: '/dashboard',
    })

    const isProd = process.env.NODE_ENV === 'production'
    response.cookies.set('sb-access-token', authData.session.access_token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: authData.session.expires_in || 3600,
    })
    response.cookies.set('sb-refresh-token', authData.session.refresh_token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    })

    return response
  } catch (err) {
    console.error('[api/auth/login] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal login error', code: 'SERVER_ERROR' },
      { status: 500 }
    )
  }
}
