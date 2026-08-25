import { NextRequest, NextResponse } from 'next/server'
import { evaluatePersistentRateLimit } from '@/lib/rate-limit'
import { createServiceRoleClient } from '@/lib/supabase'
import { logSystemError } from '@/lib/monitoring/logger'
import { classifyAuthError } from '@/lib/auth/errors'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    let email: string | undefined
    try {
      const body = await request.json()
      email = body.email
    } catch {
      // Body optional if authenticated
    }

    const targetEmail = (email || '').trim().toLowerCase()

    if (!targetEmail) {
      return NextResponse.json({ success: false, error: 'Email address is required' }, { status: 400 })
    }

    // 1. Persistent 60-Second Rate Limit Check (PostgreSQL public.rate_limits)
    const rateLimit = await evaluatePersistentRateLimit(`verify_resend:${targetEmail}`, {
      windowMs: 60 * 1000,
      limit: 1,
    })

    if (!rateLimit.success) {
      const secondsLeft = Math.ceil(rateLimit.resetInMs / 1000)
      return NextResponse.json(
        {
          success: false,
          error: `Please wait ${secondsLeft} second${secondsLeft === 1 ? '' : 's'} before requesting another verification email.`,
          resetInMs: rateLimit.resetInMs,
        },
        { status: 429 }
      )
    }

    const supabase = createServiceRoleClient()
    const {
      data: { user: sessionUser },
    } = await supabase.auth.getUser()

    // 2. If user is logged in, check if already verified
    if (sessionUser && sessionUser.email_confirmed_at) {
      return NextResponse.json({
        success: true,
        message: 'Your email address is already verified.',
        alreadyVerified: true,
      })
    }

    // 3. Trigger Canonical Supabase Auth Resend Flow
    // Supabase Auth will invoke our Auth Hook (/api/auth/send-email-hook)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://prodily.adityagangwani.me'
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: targetEmail,
      options: {
        emailRedirectTo: `${siteUrl}/verified`,
      },
    })

    if (resendError) {
      const classified = classifyAuthError(resendError, 'resend_verification')

      void logSystemError({
        severity: 'warning',
        category: 'verification',
        operation: 'resend_verification',
        message: resendError.message,
        details: { authErrorCode: classified.code, rawCode: classified.rawCode },
      })

      // Check if error is already-verified
      if (resendError.message.toLowerCase().includes('already confirmed')) {
        return NextResponse.json({
          success: true,
          message: 'Your email address is already verified.',
          alreadyVerified: true,
        })
      }

      // Propagate Supabase-side rate limit as 429 so callers can back off correctly
      if (classified.code === 'AUTH_RATE_LIMITED') {
        return NextResponse.json(
          {
            success: false,
            error: 'Too many verification requests. Please wait a moment before trying again.',
          },
          { status: 429 }
        )
      }

      return NextResponse.json(
        {
          success: false,
          error: 'Unable to resend verification email right now. Please try again in a few minutes.',
        },
        { status: 400 }
      )
    }

    // 4. Return Uniform Success Response (Non-enumerating for unauthenticated)
    return NextResponse.json({
      success: true,
      message: 'If an unverified account exists for this email, a verification link has been sent.',
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown server error'
    void logSystemError({
      severity: 'error',
      category: 'verification',
      operation: 'resend_verification_exception',
      message: errorMsg,
    })

    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred while resending the verification email.' },
      { status: 500 }
    )
  }
}
