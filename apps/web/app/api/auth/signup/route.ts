import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { SettingsService } from '@/lib/admin/settings-service'
import { createServiceRoleClient } from '@/lib/supabase'
import { ensureUserProfile } from '@/lib/auth'
import { createReferralAttribution } from '@/lib/referral/referral-service'
import { apiInternalError, apiClassifiedAuthError, AUTH_SERVICE_UNAVAILABLE_MESSAGE } from '@/lib/errors/api-response'
import { evaluatePersistentRateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const signupSchema = z.object({
  name: z.string().min(1, 'Full name is required.').min(2, 'Name must be at least 2 characters.').max(80).trim(),
  email: z.string().min(1, 'Email is required.').email('Please enter a valid email address.').trim().toLowerCase(),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
  refCode: z.string().optional().nullable(),
})

// Signup abuse controls. See incident 2026-09-06/07: unrestricted signup allowed
// ~1,200+ accounts to be created in under 24h via scripted requests, each firing a
// welcome email and overwhelming the Brevo send quota. Both limits are enforced
// server-side via the persistent (cross-instance) rate limiter.
const IP_SIGNUP_LIMIT = { windowMs: 15 * 60 * 1000, limit: 5 } // 5 signups / 15 min / IP
const EMAIL_SIGNUP_LIMIT = { windowMs: 24 * 60 * 60 * 1000, limit: 3 } // 3 signups / 24h / canonical email

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    'unknown'
  )
}

/**
 * Collapses `name+tag@gmail.com` / `name+tag@googlemail.com` down to `name@gmail.com`
 * so the "+" alias trick (used to mass-create accounts from one inbox) can't dodge
 * the per-email rate limit by generating unlimited unique-looking addresses.
 */
function canonicalizeEmailForRateLimit(email: string): string {
  const [local, domain] = email.toLowerCase().split('@')
  if (!domain) return email.toLowerCase()
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return `${local.split('+')[0]}@${domain}`
  }
  return `${local}@${domain}`
}

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
    const refCode = parsed.data.refCode || request.cookies.get('prodily_referrer')?.value || null

    // Check both platform behavior controls in a single DB call. This is the
    // coarsest, cheapest gate, so it runs first — while signups are closed
    // platform-wide, a request should be rejected immediately without also
    // consuming per-IP/per-email rate-limit budget for an attempt that was
    // never going to be allowed through anyway.
    const productSettings = await SettingsService.getProductSettings()

    // Backend enforcement of Allow Signups setting.
    // Do NOT rely only on hiding the signup form — the API must reject directly too.
    if (!productSettings.allowSignups) {
      return NextResponse.json(
        {
          error: 'New learner registrations are currently closed. Please check back later.',
          code: 'SIGNUPS_DISABLED',
        },
        { status: 403 }
      )
    }

    // Server-side abuse throttling — evaluated before any Supabase Auth call so a
    // scripted burst never reaches account creation or the email queue.
    const clientIp = getClientIp(request)
    const canonicalEmail = canonicalizeEmailForRateLimit(email)

    const [ipLimit, emailLimit] = await Promise.all([
      evaluatePersistentRateLimit(`signup_ip:${clientIp}`, IP_SIGNUP_LIMIT),
      evaluatePersistentRateLimit(`signup_email:${canonicalEmail}`, EMAIL_SIGNUP_LIMIT),
    ])

    if (!ipLimit.success || !emailLimit.success) {
      const resetInMs = Math.max(ipLimit.resetInMs, emailLimit.resetInMs)
      return NextResponse.json(
        {
          error: 'Too many registration attempts. Please wait a while before trying again.',
          code: 'RATE_LIMITED',
          resetInMs,
        },
        { status: 429 }
      )
    }

    const isRequired = productSettings.requireEmailVerification
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
        // Route the provider error through the existing classifier rather than
        // forwarding its message. The learner still gets the specific guidance
        // (weak password, rate limited) but never the raw Supabase/GoTrue text.
        return apiClassifiedAuthError({
          cause: error,
          context: 'signup',
          status: 400,
        })
      }

      // Record referral attribution if user was registered and referred
      if (data?.user?.id && refCode) {
        try {
          await ensureUserProfile(supabase, data.user, { name })
          await createReferralAttribution(supabase, {
            referrerCodeOrId: refCode,
            newUserId: data.user.id,
          })
        } catch (refErr) {
          console.warn('[signup] Referral attribution error in Flow A:', refErr)
        }
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

      // 2. Initialize public.users record and record referral attribution
      await ensureUserProfile(supabase, user, { name })
      if (refCode) {
        try {
          await createReferralAttribution(supabase, {
            referrerCodeOrId: refCode,
            newUserId: user.id,
          })
        } catch (refErr) {
          console.warn('[signup] Referral attribution error in Flow B:', refErr)
        }
      }

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
    return apiInternalError({
      cause: err,
      domain: 'auth',
      operation: 'auth.signup',
      summary: 'Unexpected failure while registering a learner',
      code: 'SERVER_ERROR',
      message: AUTH_SERVICE_UNAVAILABLE_MESSAGE,
    })
  }
}
