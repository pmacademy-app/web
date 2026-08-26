import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { SettingsService } from '@/lib/admin/settings-service'
import { createServiceRoleClient } from '@/lib/supabase'
import { ensureUserProfile } from '@/lib/auth'

export const runtime = 'nodejs'

const signupSchema = z.object({
  name: z.string().min(1, 'Full name is required.').min(2, 'Name must be at least 2 characters.').max(80).trim(),
  email: z.string().min(1, 'Email is required.').email('Please enter a valid email address.').trim().toLowerCase(),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const parsed = signupSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid registration data.', code: 'VALIDATION' },
        { status: 400 }
      )
    }

    const { name, email, password } = parsed.data
    const isRequired = await SettingsService.isEmailVerificationRequired()
    const supabase = createServiceRoleClient()
    const origin = request.headers.get('origin') || request.nextUrl.origin || 'http://localhost:3000'

    if (isRequired) {
      // ── Flow A: Verification required (ON) ──────────────────────────────────
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: `${origin}/api/auth/callback?next=/verified`,
        },
      })

      const isExistingAccount =
        Boolean(
          error && (
            error.message?.toLowerCase().includes('already registered') ||
            error.message?.toLowerCase().includes('already in use') ||
            error.message?.toLowerCase().includes('already exists')
          )
        ) ||
        Boolean(data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0)

      if (isExistingAccount) {
        return NextResponse.json(
          { error: 'An account with this email address already exists.', code: 'USER_EXISTS' },
          { status: 409 }
        )
      }

      if (error) {
        return NextResponse.json(
          { error: error.message || 'Registration failed.', code: error.code || 'SIGNUP_FAILED' },
          { status: 400 }
        )
      }

      return NextResponse.json({
        success: true,
        verificationRequired: true,
        email,
        message: 'Please check your email for the confirmation link.',
      })
    } else {
      // ── Flow B: Verification NOT required (OFF) ─────────────────────────────
      // 1. Create confirmed user using Supabase Admin API
      const { data: createData, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name },
      })

      if (createError) {
        const isExisting =
          createError.message?.toLowerCase().includes('already registered') ||
          createError.message?.toLowerCase().includes('already in use') ||
          createError.message?.toLowerCase().includes('already exists')

        return NextResponse.json(
          {
            error: isExisting
              ? 'An account with this email address already exists.'
              : createError.message || 'Registration failed.',
            code: isExisting ? 'USER_EXISTS' : createError.code || 'SIGNUP_FAILED',
          },
          { status: isExisting ? 409 : 400 }
        )
      }

      const user = createData.user
      if (!user) {
        return NextResponse.json(
          { error: 'Failed to create user record.', code: 'SERVER_ERROR' },
          { status: 500 }
        )
      }

      // 2. Initialize public.users record
      await ensureUserProfile(supabase, user, { name })

      // 3. Generate genuine Supabase session via password login
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError || !authData?.session) {
        return NextResponse.json({
          success: true,
          verificationRequired: false,
          user,
          redirect: '/login',
          message: 'Account created successfully. Please log in.',
        })
      }

      // 4. Attach HTTP-only session cookies
      const response = NextResponse.json({
        success: true,
        verificationRequired: false,
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
    }
  } catch (err) {
    console.error('[api/auth/signup] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal registration error', code: 'SERVER_ERROR' },
      { status: 500 }
    )
  }
}
